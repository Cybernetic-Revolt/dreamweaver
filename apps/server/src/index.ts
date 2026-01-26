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
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  CONSTANTS,
  generateEventId,
  type DreamweaverEvent,
  type PttTrackDetected,
  type PttTrackEnded,
  type CommandReceived,
  type CommandTranscribed,
  type NarrationReady,
} from '@dreamweaver/shared';
import {
  validateGMResponse,
  getFallbackResponse,
  type GMResponse,
} from '@dreamweaver/shared/gm_policy';

const app = new Hono();

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

function createPttSession(event: PttTrackDetected): PttSession {
  const session: PttSession = {
    pttSessionId: generateEventId(),
    roomName: event.roomName,
    identity: event.identity,
    trackSid: event.trackSid,
    startedAt: event.ts,
  };
  activePttSessions.set(event.trackSid, session);
  return session;
}

function closePttSession(event: PttTrackEnded): PttSession | null {
  const session = activePttSessions.get(event.trackSid);
  if (session) {
    session.endedAt = event.ts;
    activePttSessions.delete(event.trackSid);
    return session;
  }
  return null;
}

function getPttSessionByTrack(trackSid: string): PttSession | undefined {
  return activePttSessions.get(trackSid);
}

// ============================================================================
// GM Logic (minimal for Day 3)
// ============================================================================

/**
 * Generate a GM response for a player command.
 * For Day 3, this is a simple rule-based system.
 * Will be replaced with LLM in Day 4+.
 */
function generateGMResponse(command: string, identity: string): GMResponse {
  const lowerCommand = command.toLowerCase().trim();

  // Simple keyword-based responses for Day 3 demo
  if (lowerCommand.includes('look') || lowerCommand.includes('examine')) {
    return {
      narration: `${identity}, you see a dimly lit chamber. Ancient runes glow faintly on the walls. Two passages lead deeper. Do you take the left path or the right?`,
      choices: ['left path', 'right path'],
    };
  }

  if (lowerCommand.includes('attack') || lowerCommand.includes('fight')) {
    return {
      narration: `${identity} charges into battle! The enemy staggers from your blow. Do you press the attack or fall back?`,
      choices: ['press attack', 'fall back'],
    };
  }

  if (lowerCommand.includes('help') || lowerCommand.includes('what')) {
    return {
      narration: `You can explore, fight, or talk. What action do you take?`,
      choices: ['explore', 'talk'],
    };
  }

  if (lowerCommand.includes('go') || lowerCommand.includes('move') || lowerCommand.includes('walk')) {
    return {
      narration: `${identity} moves forward cautiously. The passage opens into a wider area. Do you continue or rest here?`,
      choices: ['continue', 'rest'],
    };
  }

  // Default response
  return {
    narration: `The GM considers your words. What would you like to do, ${identity}?`,
    choices: ['explore', 'wait'],
  };
}

/**
 * Process a transcribed command and generate narration.
 */
function processCommand(event: CommandTranscribed): NarrationReady | null {
  const { text, identity, sessionId, pttSessionId } = event;

  // Skip placeholder/empty commands
  if (!text || text.startsWith('__') || text.length < 2) {
    console.log(JSON.stringify({
      level: 'info',
      msg: 'skipping_placeholder_command',
      text,
    }));
    return null;
  }

  // Generate GM response
  let gmResponse = generateGMResponse(text, identity);

  // Validate against driving policy
  const validation = validateGMResponse(gmResponse);
  if (!validation.ok) {
    console.log(JSON.stringify({
      level: 'warn',
      msg: 'gm_response_validation_failed',
      violations: validation.violations,
    }));
    // Use fallback
    gmResponse = {
      narration: getFallbackResponse(),
      choices: ['continue', 'wait'],
    };
  }

  // Build NarrationReady event
  const narration: NarrationReady = {
    type: 'NARRATION_READY',
    eventId: generateEventId(),
    sessionId,
    pttSessionId,
    text: gmResponse.narration,
    choices: gmResponse.choices,
    mode: 'driving',  // Always driving mode for MVP
    ts: Date.now(),
  };

  console.log(JSON.stringify({
    level: 'info',
    msg: 'narration_ready',
    ptt_session_id: pttSessionId,
    text: narration.text.substring(0, 50),
    choices: narration.choices,
  }));

  return narration;
}

// ============================================================================
// Middleware
// ============================================================================

app.use('*', cors());

// ============================================================================
// Health Endpoints
// ============================================================================

// Health check (legacy)
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: Date.now(),
    services: {
      redis: 'pending',
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

    // Idempotency check (scoped by type:eventId)
    if (isDuplicateEvent(event.type, event.eventId)) {
      console.log(JSON.stringify({
        level: 'info',
        msg: 'event_deduped',
        event_id: event.eventId,
        event_type: event.type,
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
        }));
        // TODO: Route to game engine
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
        }));

        // Process command and generate narration
        const narration = processCommand(cmd);
        if (narration) {
          responseData.narration = narration;
        }
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

app.post('/auth/token', async (c) => {
  // TODO: Implement LiveKit token generation
  return c.json({ error: 'NOT_IMPLEMENTED' }, 501);
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || '3000');
console.log(`Dreamweaver server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
