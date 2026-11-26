/**
 * Dreamweaver Game Server
 *
 * Handles:
 * - Session management (create, join, leave)
 * - LiveKit token generation
 * - Game state persistence (SQLite)
 * - WebSocket events
 * - Event ingestion from agent
 * - PTT session window management
 * - Async narration delivery via Redis pub/sub
 * - Intent parsing and deterministic GM (Day 5)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Database } from 'bun:sqlite';
import { createClient, type RedisClientType } from 'redis';
import { AccessToken } from 'livekit-server-sdk';
import {
  CONSTANTS,
  generateEventId,
  type DreamweaverEvent,
  type PttTrackDetected,
  type PttTrackEnded,
  type CommandReceived,
  type CommandTranscribed,
  type NarrationReady,
  type NarrationInterrupt,
  type TraceSummary,
  createInitialState,
  type GameState,
} from '@dreamweaver/shared';
import { validateGMResponse } from '@dreamweaver/shared/gm_policy';
import { parseIntent, describeIntent } from './intent';
import { processIntent } from './gm';
import { isCreatingCharacter, handleCharacterCreation } from './character';
import { WEB_PAGE } from './webpage';

const app = new Hono();

// Web client — play Dreamweaver in a browser (no app needed).
app.get('/', (c) => c.html(WEB_PAGE));

// ============================================================================
// SQLite Database (Game State)
// ============================================================================

const DATABASE_PATH = process.env.DATABASE_PATH || './data/dreamweaver.db';
const db = new Database(DATABASE_PATH, { create: true });

// Initialize tables
db.run(`
  CREATE TABLE IF NOT EXISTS game_states (
    room_name TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

function getGameState(roomName: string): GameState | null {
  const row = db.query('SELECT state_json FROM game_states WHERE room_name = ?').get(roomName) as { state_json: string } | null;
  if (!row) return null;
  return JSON.parse(row.state_json) as GameState;
}

function saveGameState(state: GameState): void {
  const now = Date.now();
  db.run(
    `INSERT INTO game_states (room_name, state_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(room_name) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    [state.roomName, JSON.stringify(state), now, now]
  );
}

function getOrCreateGameState(roomName: string, sessionId: string): GameState {
  let state = getGameState(roomName);
  if (!state) {
    state = createInitialState(sessionId, roomName);
    saveGameState(state);
  }
  return state;
}

// ============================================================================
// Redis Client (for async narration delivery)
// ============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redis: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType> {
  if (redis && redis.isOpen) {
    return redis;
  }

  redis = createClient({ url: REDIS_URL });
  redis.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'redis_error', error: String(err) }));
  });

  await redis.connect();
  console.log(JSON.stringify({ level: 'info', msg: 'redis_connected', url: REDIS_URL }));
  return redis;
}

/**
 * Publish narration to Redis channel for async delivery.
 */
async function publishNarration(roomName: string, narration: NarrationReady): Promise<void> {
  try {
    const client = await getRedis();
    const channel = `${CONSTANTS.REDIS_NARRATION_CHANNEL_PREFIX}${roomName}`;
    await client.publish(channel, JSON.stringify(narration));
    console.log(JSON.stringify({
      level: 'info',
      msg: 'narration_published',
      channel,
      ptt_session_id: narration.pttSessionId,
      trace_id: narration.traceId,
    }));
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'narration_publish_failed',
      error: String(err),
    }));
  }
}

/**
 * Publish interruption event to Redis.
 */
async function publishInterruption(roomName: string, interrupt: NarrationInterrupt): Promise<void> {
  try {
    const client = await getRedis();
    const channel = `${CONSTANTS.REDIS_NARRATION_CHANNEL_PREFIX}${roomName}`;
    await client.publish(channel, JSON.stringify(interrupt));
    console.log(JSON.stringify({
      level: 'info',
      msg: 'interruption_published',
      channel,
      trace_id: interrupt.traceId,
    }));
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'interruption_publish_failed',
      error: String(err),
    }));
  }
}

// ============================================================================
// Event Deduplication Cache (in-memory, will move to Redis)
// ============================================================================

interface SeenEvent {
  key: string;
  seenAtMs: number;  // Server receive time, NOT client ts
}

const seenEvents = new Map<string, SeenEvent>();

/**
 * Build scoped dedup key: type:eventId
 * Prevents cross-type collisions if eventId ever reused
 */
function dedupKey(eventType: string, eventId: string): string {
  return `${eventType}:${eventId}`;
}

function cleanupSeenEvents(): void {
  const now = Date.now();
  const ttl = CONSTANTS.EVENT_DEDUP_TTL_MS;
  for (const [key, seen] of seenEvents) {
    // Use server receive time for expiry, immune to client clock skew
    if (now - seen.seenAtMs > ttl) {
      seenEvents.delete(key);
    }
  }
}

// Cleanup every 30 seconds
setInterval(cleanupSeenEvents, 30000);

function isDuplicateEvent(eventType: string, eventId: string): boolean {
  return seenEvents.has(dedupKey(eventType, eventId));
}

function markEventSeen(eventType: string, eventId: string): void {
  const key = dedupKey(eventType, eventId);
  seenEvents.set(key, { key, seenAtMs: Date.now() });
}

// ============================================================================
// PTT Session Management
// ============================================================================

interface PttSession {
  pttSessionId: string;
  roomName: string;
  identity: string;
  trackSid: string;
  startedAt: number;
  endedAt?: number;
}

// Map: trackSid -> PttSession
const activePttSessions = new Map<string, PttSession>();

// Map: pttSessionId -> roomName (for lookup after session closed)
const sessionToRoom = new Map<string, string>();

function createPttSession(event: PttTrackDetected): PttSession {
  const session: PttSession = {
    pttSessionId: generateEventId(),
    roomName: event.roomName,
    identity: event.identity,
    trackSid: event.trackSid,
    startedAt: event.ts,
  };
  activePttSessions.set(event.trackSid, session);
  sessionToRoom.set(session.pttSessionId, event.roomName);
  return session;
}

function closePttSession(event: PttTrackEnded): PttSession | null {
  const session = activePttSessions.get(event.trackSid);
  if (session) {
    session.endedAt = event.ts;
    activePttSessions.delete(event.trackSid);
    // Keep sessionToRoom for async narration lookup
    return session;
  }
  return null;
}

// ============================================================================
// Room Command Lock (Day 8: Single active command per room)
// ============================================================================

interface RoomLock {
  traceId: string;
  identity: string;
  lockedAt: number;
}

const roomLocks = new Map<string, RoomLock>();

// Lock timeout - if command doesn't complete in 10s, release lock
const ROOM_LOCK_TIMEOUT_MS = 10000;

function tryAcquireRoomLock(roomName: string, traceId: string, identity: string): boolean {
  const existing = roomLocks.get(roomName);
  const now = Date.now();

  // Check if existing lock is expired
  if (existing && (now - existing.lockedAt) > ROOM_LOCK_TIMEOUT_MS) {
    console.log(JSON.stringify({
      level: 'warn',
      msg: 'room_lock_expired',
      room_name: roomName,
      old_trace_id: existing.traceId,
      new_trace_id: traceId,
    }));
    roomLocks.delete(roomName);
  }

  // If locked by another command, reject
  if (roomLocks.has(roomName)) {
    console.log(JSON.stringify({
      level: 'info',
      msg: 'room_busy_rejected',
      room_name: roomName,
      rejected_trace_id: traceId,
      active_trace_id: roomLocks.get(roomName)?.traceId,
    }));
    return false;
  }

  // Acquire lock
  roomLocks.set(roomName, { traceId, identity, lockedAt: now });
  return true;
}

function releaseRoomLock(roomName: string, traceId: string): void {
  const lock = roomLocks.get(roomName);
  if (lock && lock.traceId === traceId) {
    roomLocks.delete(roomName);
  }
}

// ============================================================================
// Command Processing (Day 5: Intent + GM)
// ============================================================================

interface ProcessResult {
  commandId: string;
  narration: NarrationReady | null;
  latency: LatencyLog;
  rejected?: boolean;
  rejectReason?: string;
}

interface LatencyLog {
  trace_id: string;
  ptt_ms: number;
  stt_ms: number;
  gm_ms: number;
  tts_ms: number;  // Will be filled by agent
  publish_ms: number;  // Day 8: time to publish to Redis
  total_ms: number;
  text_len: number;
  narration_len: number;
  mode: string;
  intent: string;
  result: 'ok' | 'timeout' | 'capped' | 'rejected' | 'interrupted' | 'skipped';
}

/**
 * Process a transcribed command and generate narration.
 * Day 5: Uses intent parser + deterministic GM + state management.
 * Day 8: Room lock, enhanced trace summary.
 */
async function processCommandAsync(event: CommandTranscribed): Promise<ProcessResult> {
  const { text, identity, sessionId, pttSessionId, roomName, latencyMs } = event;
  const commandId = generateEventId();
  const traceId = pttSessionId || commandId;
  const commandStartTime = Date.now();

  // Initialize latency log
  const latency: LatencyLog = {
    trace_id: traceId,
    ptt_ms: 0,  // Calculated from PTT session
    stt_ms: latencyMs,
    gm_ms: 0,
    tts_ms: 0,  // Agent will log this
    publish_ms: 0,
    total_ms: 0,
    text_len: text.length,
    narration_len: 0,
    mode: 'driving',
    intent: 'UNKNOWN',
    result: 'ok',
  };

  // Validate roomName is present (required for Redis routing)
  if (!roomName) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'missing_room_name',
      ptt_session_id: pttSessionId,
      trace_id: traceId,
    }));
    latency.result = 'skipped';
    return { commandId, narration: null, latency };
  }

  // Day 8: Try to acquire room lock (single active command)
  if (!tryAcquireRoomLock(roomName, traceId, identity)) {
    latency.result = 'rejected';
    latency.total_ms = Date.now() - commandStartTime;
    return {
      commandId,
      narration: null,
      latency,
      rejected: true,
      rejectReason: 'busy',
    };
  }

  try {
    // Skip placeholder/empty commands
    const isPlaceholder = text.startsWith('__') && !text.includes('timeout');
    if (!text || isPlaceholder || text.length < 2) {
      console.log(JSON.stringify({
        level: 'info',
        msg: 'skipping_placeholder_command',
        text,
        trace_id: traceId,
      }));
      latency.result = 'skipped';
      return { commandId, narration: null, latency };
    }

    // Get or create game state
    let state = getOrCreateGameState(roomName, sessionId);

    // Check if in quiet mode (STOP was issued)
    if (state.quietUntil && Date.now() < state.quietUntil) {
      // Parse to check if it's a wake-up command (use sync version for speed)
      const { parseIntentSync } = await import('./intent');
      const intent = parseIntentSync(text);
      if (intent.type !== 'HELP' && intent.type !== 'STATUS' && intent.type !== 'LOOK') {
        console.log(JSON.stringify({
          level: 'info',
          msg: 'quiet_mode_active',
          trace_id: traceId,
          until: state.quietUntil,
        }));
        latency.result = 'skipped';
        return { commandId, narration: null, latency };
      }
      // Wake-up command received, clear quiet mode
      state.quietUntil = undefined;
    }

    // Day 9: character creation runs once per room before the normal
    // GO/LOOK/TAKE intent parser - the player's free speech is consumed as
    // name/archetype/trait answers instead.
    const gmStartTime = Date.now();
    const intent = isCreatingCharacter(state)
      ? { type: 'UNKNOWN' as const, rawText: text }
      : await parseIntent(text);
    latency.intent = isCreatingCharacter(state) ? 'CREATING_CHARACTER' : describeIntent(intent);

    console.log(JSON.stringify({
      level: 'info',
      msg: 'intent_parsed',
      intent_type: intent.type,
      intent_target: intent.target,
      raw_text: text,
      trace_id: traceId,
    }));

    // Process intent with GM (async for Ollama LLM), or continue character creation
    const result = isCreatingCharacter(state)
      ? handleCharacterCreation(state, text, pttSessionId, traceId)
      : await processIntent(state, intent, pttSessionId, traceId);

    // Calculate GM latency
    latency.gm_ms = Date.now() - gmStartTime;
    latency.narration_len = result.narration.text.length;
    latency.mode = state.mode;

    // Validate narration against driving policy
    const validation = validateGMResponse({
      narration: result.narration.text,
      choices: result.narration.choices,
    });

    if (!validation.ok) {
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'gm_response_validation_failed',
        violations: validation.violations,
        trace_id: traceId,
      }));
      if (validation.violations?.some(
        (v) => v.rule === 'MAX_NARRATION_WORDS' || v.rule === 'MAX_NARRATION_SECONDS',
      )) {
        latency.result = 'capped';
      }
    }

    // Apply state updates
    if (Object.keys(result.stateUpdates).length > 0) {
      state = { ...state, ...result.stateUpdates };

      // Save lastNarration for REPEAT
      state.lastNarration = {
        narrationId: result.narration.eventId,
        text: result.narration.text,
        choices: result.narration.choices,
      };

      saveGameState(state);
    }

    // Handle STOP intent specially - emit interruption
    if (intent.type === 'STOP') {
      const interrupt: NarrationInterrupt = {
        type: 'NARRATION_INTERRUPT',
        eventId: generateEventId(),
        sessionId,
        narrationId: state.lastNarration?.narrationId || '',
        identity,
        reason: 'stop_command',
        ts: Date.now(),
        traceId,
      };
      await publishInterruption(roomName, interrupt);
      latency.result = 'interrupted';
    }

    // Publish narration to Redis with timing metadata
    const publishStartTime = Date.now();
    const enrichedNarration: NarrationReady & { serverPublishTs: number } = {
      ...result.narration,
      serverPublishTs: publishStartTime,
    };
    await publishNarration(roomName, enrichedNarration as NarrationReady);
    latency.publish_ms = Date.now() - publishStartTime;

    // Log latency summary
    latency.total_ms = Date.now() - (event.ts - latencyMs);  // From PTT end to now
    console.log(JSON.stringify({
      level: 'info',
      msg: 'latency_summary',
      ...latency,
    }));

    return { commandId, narration: result.narration, latency };
  } finally {
    // Always release lock
    releaseRoomLock(roomName, traceId);
  }
}

// ============================================================================
// Middleware
// ============================================================================

app.use('*', cors());

// ============================================================================
// Health Endpoints
// ============================================================================

// Health check (legacy)
app.get('/health', async (c) => {
  let redisStatus = 'disconnected';
  try {
    const client = await getRedis();
    await client.ping();
    redisStatus = 'healthy';
  } catch {
    redisStatus = 'error';
  }

  return c.json({
    status: 'healthy',
    timestamp: Date.now(),
    services: {
      redis: redisStatus,
      sqlite: 'healthy',
      livekit: 'pending',
    },
  });
});

// Kubernetes-style health check
app.get('/healthz', (c) => {
  return c.json({
    status: 'ok',
    ts: Date.now(),
  });
});

// ============================================================================
// Event Ingestion Endpoint
// ============================================================================

app.post('/events', async (c) => {
  try {
    const event = await c.req.json<DreamweaverEvent>();

    // Validate event has required fields
    if (!event.type || !event.ts) {
      return c.json({ error: 'INVALID_EVENT', message: 'Missing type or ts' }, 400);
    }

    if (!event.eventId) {
      return c.json({ error: 'INVALID_EVENT', message: 'Missing eventId' }, 400);
    }

    // Extract traceId for logging
    const traceId = event.traceId || event.eventId;

    // Idempotency check (scoped by type:eventId)
    if (isDuplicateEvent(event.type, event.eventId)) {
      console.log(JSON.stringify({
        level: 'info',
        msg: 'event_deduped',
        event_id: event.eventId,
        event_type: event.type,
        trace_id: traceId,
      }));
      return c.json({ status: 'accepted', deduped: true, event_type: event.type });
    }

    // Mark as seen (uses server receive time for TTL)
    markEventSeen(event.type, event.eventId);

    // Log event receipt (structured logging for observability)
    console.log(JSON.stringify({
      level: 'info',
      msg: 'event_received',
      event_id: event.eventId,
      event_type: event.type,
      ts: event.ts,
      trace_id: traceId,
      ...('sessionId' in event && { session_id: event.sessionId }),
      ...('identity' in event && { identity: event.identity }),
      ...('roomName' in event && { room_name: event.roomName }),
    }));

    // Route event to handler
    let responseData: Record<string, unknown> = { status: 'accepted', event_type: event.type };

    switch (event.type) {
      case 'PTT_TRACK_DETECTED': {
        const pttSession = createPttSession(event as PttTrackDetected);
        console.log(JSON.stringify({
          level: 'info',
          msg: 'ptt_session_created',
          ptt_session_id: pttSession.pttSessionId,
          identity: pttSession.identity,
          room_name: pttSession.roomName,
          trace_id: pttSession.pttSessionId,
        }));
        responseData.pttSessionId = pttSession.pttSessionId;
        break;
      }

      case 'PTT_TRACK_ENDED': {
        const closedSession = closePttSession(event as PttTrackEnded);
        if (closedSession) {
          const duration = closedSession.endedAt! - closedSession.startedAt;
          console.log(JSON.stringify({
            level: 'info',
            msg: 'ptt_session_closed',
            ptt_session_id: closedSession.pttSessionId,
            identity: closedSession.identity,
            duration_ms: duration,
            trace_id: closedSession.pttSessionId,
          }));
          responseData.pttSessionId = closedSession.pttSessionId;
          responseData.durationMs = duration;
        } else {
          console.log(JSON.stringify({
            level: 'warn',
            msg: 'ptt_session_not_found',
            track_sid: (event as PttTrackEnded).trackSid,
          }));
        }
        break;
      }

      case 'COMMAND_RECEIVED': {
        const cmd = event as CommandReceived;
        console.log(JSON.stringify({
          level: 'info',
          msg: 'command_received',
          ptt_session_id: cmd.pttSessionId,
          identity: cmd.identity,
          text: cmd.text,
          trace_id: cmd.pttSessionId,
        }));
        break;
      }

      case 'COMMAND_TRANSCRIBED': {
        const cmd = event as CommandTranscribed;
        console.log(JSON.stringify({
          level: 'info',
          msg: 'command_transcribed',
          ptt_session_id: cmd.pttSessionId,
          identity: cmd.identity,
          text: cmd.text,
          latency_ms: cmd.latencyMs,
          trace_id: cmd.pttSessionId,
        }));

        // Process command asynchronously, return 202 Accepted
        const result = await processCommandAsync(cmd);

        // Day 8: Handle busy rejection
        if (result.rejected) {
          return c.json({
            status: 'rejected',
            event_type: event.type,
            reason: result.rejectReason,
            message: 'One at a time.',
          }, 429);
        }

        return c.json({
          status: 'accepted',
          event_type: event.type,
          commandId: result.commandId,
          intent: result.latency.intent,
          result: result.latency.result,
        }, 202);
      }

      // Day 8: TRACE_SUMMARY from agent
      case 'TRACE_SUMMARY': {
        const trace = event as TraceSummary;
        console.log(JSON.stringify({
          level: 'info',
          msg: 'trace_summary',
          trace_id: trace.traceId,
          room_name: trace.roomName,
          identity: trace.identity,
          intent: trace.intent,
          ptt_ms: trace.ptt_ms,
          stt_ms: trace.stt_ms,
          gm_ms: trace.gm_ms,
          tts_ms: trace.tts_ms,
          publish_ms: trace.publish_ms,
          total_ms: trace.total_ms,
          result: trace.result,
        }));
        break;
      }

      default:
        // Log unhandled event types
        console.log(JSON.stringify({
          level: 'debug',
          msg: 'unhandled_event_type',
          event_type: event.type,
        }));
    }

    return c.json(responseData);
  } catch (err) {
    console.error('event_parse_error', err);
    return c.json({ error: 'PARSE_ERROR', message: 'Invalid JSON' }, 400);
  }
});

// ============================================================================
// Game State API (for debugging)
// ============================================================================

app.get('/api/state/:roomName', (c) => {
  const roomName = c.req.param('roomName');
  const state = getGameState(roomName);
  if (!state) {
    return c.json({ error: 'NOT_FOUND' }, 404);
  }
  return c.json(state);
});

// ============================================================================
// Session API Routes
// ============================================================================

app.get('/api/sessions/:code', (c) => {
  const code = c.req.param('code');
  // TODO: Implement session lookup
  return c.json({ error: 'NOT_IMPLEMENTED' }, 501);
});

app.post('/api/sessions', async (c) => {
  // TODO: Implement session creation
  return c.json({ error: 'NOT_IMPLEMENTED' }, 501);
});

app.post('/api/sessions/:code/join', async (c) => {
  // TODO: Implement session join
  return c.json({ error: 'NOT_IMPLEMENTED' }, 501);
});

// ============================================================================
// Auth Routes
// ============================================================================

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret_min_32_characters_long_here';
const LIVEKIT_WS_URL_EXTERNAL = process.env.LIVEKIT_WS_URL_EXTERNAL || 'ws://localhost:7880';

app.post('/auth/token', async (c) => {
  try {
    const body = await c.req.json<{ identity: string; room: string }>();

    if (!body.identity || !body.room) {
      return c.json({ error: 'INVALID_REQUEST', message: 'Missing identity or room' }, 400);
    }

    const { identity, room } = body;

    // Create access token
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: identity,
      ttl: CONSTANTS.TOKEN_TTL_SECONDS,
    });

    // Grant room access
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    console.log(JSON.stringify({
      level: 'info',
      msg: 'token_generated',
      identity,
      room,
    }));

    return c.json({
      token: jwt,
      wsUrl: LIVEKIT_WS_URL_EXTERNAL,
      identity,
      room,
    });
  } catch (err) {
    console.error('token_generation_error', err);
    return c.json({ error: 'TOKEN_ERROR', message: 'Failed to generate token' }, 500);
  }
});

// ============================================================================
// Direct Command Endpoint (Day 7: bypasses STT)
// ============================================================================

interface DirectCommand {
  roomName: string;
  identity: string;
  text: 'stop' | 'repeat' | 'help';
  traceId?: string;
}

app.post('/command', async (c) => {
  try {
    const body = await c.req.json<DirectCommand>();

    if (!body.roomName || !body.identity || !body.text) {
      return c.json({ error: 'INVALID_REQUEST', message: 'Missing roomName, identity, or text' }, 400);
    }

    const { roomName, identity, text, traceId } = body;
    const commandId = generateEventId();
    const finalTraceId = traceId || commandId;

    console.log(JSON.stringify({
      level: 'info',
      msg: 'direct_command_received',
      command: text,
      room_name: roomName,
      identity,
      trace_id: finalTraceId,
    }));

    // Map button text to full command text the GM understands
    const commandTextMap: Record<string, string> = {
      'stop': 'stop',
      'repeat': 'repeat',
      'help': 'help',
    };

    const normalizedText = commandTextMap[text.toLowerCase()] || text;

    // Create a synthetic COMMAND_TRANSCRIBED event
    const syntheticEvent: CommandTranscribed = {
      type: 'COMMAND_TRANSCRIBED',
      eventId: generateEventId(),
      sessionId: roomName,
      pttSessionId: finalTraceId,
      identity,
      roomName,
      text: normalizedText,
      latencyMs: 0, // No STT latency for direct commands
      ts: Date.now(),
      traceId: finalTraceId,
    };

    // Process through same async flow
    const result = await processCommandAsync(syntheticEvent);

    // Day 8: Handle busy rejection
    if (result.rejected) {
      return c.json({
        status: 'rejected',
        reason: result.rejectReason,
        message: 'One at a time.',
      }, 429);
    }

    return c.json({
      status: 'accepted',
      commandId: result.commandId,
      intent: result.latency.intent,
      result: result.latency.result,
      // Narration for text/web clients (the voice path also gets it via Redis).
      narration: result.narration?.text ?? null,
      choices: result.narration?.choices ?? [],
    }, 202);
  } catch (err) {
    console.error('command_error', err);
    return c.json({ error: 'COMMAND_ERROR', message: 'Failed to process command' }, 500);
  }
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || '3000');
console.log(`Dreamweaver server starting on port ${port}`);
console.log(`SQLite database: ${DATABASE_PATH}`);

// Initialize Redis connection on startup
getRedis().catch((err) => {
  console.error('Failed to connect to Redis on startup:', err);
});

export default {
  port,
  fetch: app.fetch,
};
