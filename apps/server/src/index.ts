/**
 * Dreamweaver Game Server
 *
 * Handles:
 * - Session management (create, join, leave)
 * - LiveKit token generation
 * - Game state persistence (SQLite)
 * - WebSocket events
 * - Event ingestion from agent
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CONSTANTS, type DreamweaverEvent } from '@dreamweaver/shared';

const app = new Hono();

// Middleware
app.use('*', cors());

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

// Event ingestion endpoint
// Agent POSTs events here when detecting PTT tracks, etc.
app.post('/events', async (c) => {
  try {
    const event = await c.req.json<DreamweaverEvent>();

    // Validate event has required fields
    if (!event.type || !event.ts) {
      return c.json({ error: 'INVALID_EVENT', message: 'Missing type or ts' }, 400);
    }

    // Log event receipt (structured logging for observability)
    console.log(JSON.stringify({
      level: 'info',
      msg: 'event_received',
      event_type: event.type,
      ts: event.ts,
      ...('sessionId' in event && { session_id: event.sessionId }),
      ...('identity' in event && { identity: event.identity }),
      ...('roomName' in event && { room_name: event.roomName }),
    }));

    // TODO: Route event to appropriate handler (state machine, broadcast, persist)

    return c.json({ status: 'accepted', event_type: event.type });
  } catch (err) {
    console.error('event_parse_error', err);
    return c.json({ error: 'PARSE_ERROR', message: 'Invalid JSON' }, 400);
  }
});

// API routes
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

// LiveKit token endpoint
app.post('/auth/token', async (c) => {
  // TODO: Implement LiveKit token generation
  return c.json({ error: 'NOT_IMPLEMENTED' }, 501);
});

// Start server
const port = parseInt(process.env.PORT || '3000');
console.log(`Dreamweaver server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
