/**
 * Constants for mobile app.
 * Mirrors packages/shared/events.ts TRACK_NAMES.
 */

// Track names (must match server/agent)
export const TRACK_NAMES = {
  MIC: 'mic',
  PTT: 'ptt',
  AI_NARRATION: 'ai_narration',
} as const;

// Room name prefix
export const ROOM_PREFIX = 'campaign-';

// API endpoints
export const API = {
  TOKEN: '/auth/token',
  HEALTH: '/healthz',
} as const;

// Default config
export const DEFAULTS = {
  ROOM_NAME: 'campaign-dev',
  IDENTITY_PREFIX: 'player-',
} as const;
