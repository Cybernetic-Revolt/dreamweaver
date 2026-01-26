/**
 * Dreamweaver Game Server
 *
 * Handles:
 * - Session management (create, join, leave)
 * - LiveKit token generation
 * - Game state persistence (SQLite)
 * - WebSocket events
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CONSTANTS } from '@dreamweaver/shared';

const app = new Hono();

// Middleware
app.use('*', cors());

// Health check
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
