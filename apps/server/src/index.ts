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
} from '@dreamweaver/shared';

const app = new Hono();

// ============================================================================
// Event Deduplication Cache (in-memory, will move to Redis)
// ============================================================================

interface SeenEvent {
  eventId: string;
  ts: number;
}

const seenEvents = new Map<string, SeenEvent>();

function cleanupSeenEvents(): void {
  const now = Date.now();
  const ttl = CONSTANTS.EVENT_DEDUP_TTL_MS;
  for (const [eventId, seen] of seenEvents) {
    if (now - seen.ts > ttl) {
      seenEvents.delete(eventId);
    }
  }
}

// Cleanup every 30 seconds
setInterval(cleanupSeenEvents, 30000);

function isDuplicateEvent(eventId: string): boolean {
  return seenEvents.has(eventId);
}

function markEventSeen(eventId: string): void {
  seenEvents.set(eventId, { eventId, ts: Date.now() });
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

    // Idempotency check
    if (isDuplicateEvent(event.eventId)) {
      console.log(JSON.stringify({
        level: 'info',
        msg: 'event_deduped',
        event_id: event.eventId,
        event_type: event.type,
      }));
      return c.json({ status: 'accepted', deduped: true, event_type: event.type });
    }

    // Mark as seen
    markEventSeen(event.eventId);

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
