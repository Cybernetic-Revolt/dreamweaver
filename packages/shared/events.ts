/**
 * Dreamweaver Event Contract
 *
 * All events exchanged between mobile, server, and agent.
 * This is the single source of truth for event types.
 */

// ============================================================================
// Base Event (all events must have these fields)
// ============================================================================

export interface BaseEvent {
  type: string;
  eventId: string;  // uuid v4 - REQUIRED for idempotency
  ts: number;       // unix ms
  traceId?: string; // Optional: correlates events across pipeline (use pttSessionId)
}

// ============================================================================
// Command Events (PTT → STT → Game)
// ============================================================================

export interface CommandStart extends BaseEvent {
  type: 'COMMAND_START';
  sessionId: string;
  identity: string;  // player_id who pressed PTT
}

export interface CommandText extends BaseEvent {
  type: 'COMMAND_TEXT';
  sessionId: string;
  identity: string;
  text: string;      // STT output
}

export interface CommandEnd extends BaseEvent {
  type: 'COMMAND_END';
  sessionId: string;
  identity: string;
}

// Command received from PTT session (placeholder before STT)
export interface CommandReceived extends BaseEvent {
  type: 'COMMAND_RECEIVED';
  sessionId: string;
  pttSessionId: string;  // links to PTT window
  identity: string;
  text: string;          // STT output or "__placeholder__"
}

// Command transcribed by STT (real text from audio)
export interface CommandTranscribed extends BaseEvent {
  type: 'COMMAND_TRANSCRIBED';
  sessionId: string;
  pttSessionId: string;
  roomName: string;       // Room for Redis routing (required for pub/sub)
  identity: string;
  text: string;           // STT output
  confidence?: number;    // 0-1 if available
  latencyMs: number;      // STT processing time
}

// ============================================================================
// Narration Events (Agent → Clients)
// ============================================================================

// GM has prepared narration, ready for TTS
export interface NarrationReady extends BaseEvent {
  type: 'NARRATION_READY';
  sessionId: string;
  pttSessionId: string;   // which command triggered this
  text: string;           // <= 12s of speech
  choices?: string[];     // <= 2 choices for driving mode
  mode: 'driving' | 'stationary';
}

export interface NarrationStart extends BaseEvent {
  type: 'NARRATION_START';
  sessionId: string;
  narrationId: string;    // correlates to audio track segment
}

export interface NarrationEnd extends BaseEvent {
  type: 'NARRATION_END';
  sessionId: string;
  narrationId: string;
  durationMs: number;
}

export interface NarrationInterrupt extends BaseEvent {
  type: 'NARRATION_INTERRUPT';
  sessionId: string;
  narrationId: string;
  identity: string;  // who interrupted
  reason: 'ptt' | 'stop_command' | 'system';
}

// ============================================================================
// State Events (Server → Clients)
// ============================================================================

export interface StatePatch extends BaseEvent {
  type: 'STATE_PATCH';
  sessionId: string;
  version: number;
  patch: Record<string, unknown>;  // JSON patch or partial state
}

export interface StateAck extends BaseEvent {
  type: 'STATE_ACK';
  sessionId: string;
  version: number;  // client acknowledges this version
}

export interface StateSync extends BaseEvent {
  type: 'STATE_SYNC';
  sessionId: string;
  version: number;
  state: SessionState;
  missedEvents?: DreamweaverEvent[];
}

// ============================================================================
// Session Events
// ============================================================================

export interface SessionCreated extends BaseEvent {
  type: 'SESSION_CREATED';
  sessionId: string;
  roomCode: string;
  hostIdentity: string;
}

export interface PlayerJoined extends BaseEvent {
  type: 'PLAYER_JOINED';
  sessionId: string;
  identity: string;
  displayName: string;
}

export interface PlayerLeft extends BaseEvent {
  type: 'PLAYER_LEFT';
  sessionId: string;
  identity: string;
  reason: 'disconnect' | 'kick' | 'timeout';
}

export interface PlayerReconnected extends BaseEvent {
  type: 'PLAYER_RECONNECTED';
  sessionId: string;
  identity: string;
}

export interface SessionPaused extends BaseEvent {
  type: 'SESSION_PAUSED';
  sessionId: string;
  reason: 'player_request' | 'phone_call' | 'navigation' | 'timeout';
}

export interface SessionResumed extends BaseEvent {
  type: 'SESSION_RESUMED';
  sessionId: string;
}

export interface SessionEnded extends BaseEvent {
  type: 'SESSION_ENDED';
  sessionId: string;
  reason: 'completed' | 'host_ended' | 'timeout' | 'error';
}

// ============================================================================
// Audio State Events (for ducking coordination)
// ============================================================================

export interface PttStart extends BaseEvent {
  type: 'PTT_START';
  sessionId: string;
  identity: string;
}

export interface PttEnd extends BaseEvent {
  type: 'PTT_END';
  sessionId: string;
  identity: string;
}

// ============================================================================
// Agent Detection Events (internal)
// ============================================================================

export interface PttTrackDetected extends BaseEvent {
  type: 'PTT_TRACK_DETECTED';
  roomName: string;
  identity: string;       // participant who published
  trackSid: string;       // LiveKit track SID
  trackName: string;      // should be "ptt"
}

export interface PttTrackEnded extends BaseEvent {
  type: 'PTT_TRACK_ENDED';
  roomName: string;
  identity: string;
  trackSid: string;
}

// ============================================================================
// Error Events
// ============================================================================

export interface ErrorEvent extends BaseEvent {
  type: 'ERROR';
  sessionId: string;
  code: string;
  message: string;
}

// ============================================================================
// Union Types
// ============================================================================

export type CommandEvent = CommandStart | CommandText | CommandEnd | CommandReceived | CommandTranscribed;
export type NarrationEvent = NarrationReady | NarrationStart | NarrationEnd | NarrationInterrupt;
export type StateEvent = StatePatch | StateAck | StateSync;
export type SessionEvent = SessionCreated | PlayerJoined | PlayerLeft |
                           PlayerReconnected | SessionPaused | SessionResumed | SessionEnded;
export type AudioEvent = PttStart | PttEnd;
export type AgentEvent = PttTrackDetected | PttTrackEnded;

export type DreamweaverEvent =
  | CommandEvent
  | NarrationEvent
  | StateEvent
  | SessionEvent
  | AudioEvent
  | AgentEvent
  | ErrorEvent;

// ============================================================================
// State Types
// ============================================================================

export type SessionStatus = 'lobby' | 'playing' | 'paused' | 'ended';
export type CharacterArchetype = 'fighter' | 'mage' | 'rogue';
export type HealthStatus = 'healthy' | 'wounded' | 'critical';

export interface Character {
  name: string;
  archetype: CharacterArchetype;
  trait: string;
  health: HealthStatus;
  inventory: Item[];
}

export interface Item {
  id: string;
  name: string;
  properties: string[];
}

export interface Player {
  identity: string;
  displayName: string;
  isHost: boolean;
  isConnected: boolean;
  character: Character | null;
}

export interface SessionState {
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  adventureId: string;
  currentNode: string;
  players: Player[];
  worldFlags: Record<string, unknown>;
  turnCount: number;
  version: number;
}

// ============================================================================
// Track Naming (Decision-Locked)
// ============================================================================

export const TRACK_NAMES = {
  // Canonical track names - NEVER use ad-hoc strings
  MIC: 'mic',           // Open-mic audio track
  PTT: 'ptt',           // Push-to-talk command track
  AI_NARRATION: 'ai_narration',  // GM narration track
} as const;

export const ROOM_PREFIX = 'campaign-';  // Room names: campaign-{code}

export function isValidRoomName(name: string): boolean {
  return name.startsWith(ROOM_PREFIX) && name.length > ROOM_PREFIX.length;
}

export function makeRoomName(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

// ============================================================================
// Constants (Decision-Locked)
// ============================================================================

export const CONSTANTS = {
  // Command capture (D018)
  PTT_MAX_DURATION_MS: 5000,
  PTT_QUEUE_TIMEOUT_MS: 10000,

  // Reconnect contract (D020)
  SLOT_HOLD_SECONDS: 60,
  SESSION_RESUME_MINUTES: 10,

  // Ducking (from spec)
  DUCK_TARGET_DB: -12,
  DUCK_ATTACK_MS: 50,
  DUCK_RELEASE_MS: 300,

  // Driving UX
  MAX_NARRATION_SECONDS: 12,
  MAX_NARRATION_WORDS: 60,
  MAX_CHOICES: 2,
  SILENCE_CHECK_SECONDS: 60,

  // LiveKit
  TOKEN_TTL_SECONDS: 3600,
  TOKEN_REFRESH_AT_SECONDS: 3000,  // Refresh at 50 min

  // Event deduplication
  EVENT_DEDUP_TTL_MS: 60000,  // 1 minute TTL for seen event IDs

  // Day 4 hardening: caps and timeouts
  MAX_PTT_SECONDS: 5,                    // Hard cap on PTT duration
  MAX_AUDIO_BYTES: 48000 * 5 * 2 * 1,    // sample_rate * seconds * bytes_per_sample * channels
  STT_TIMEOUT_SECONDS: 8,                // Max time for STT processing
  GM_TIMEOUT_SECONDS: 3,                 // Max time for GM response
  TTS_TIMEOUT_SECONDS: 5,                // Max time for TTS generation

  // Audio normalization
  TARGET_LUFS: -16,                      // Target loudness for narration
  TARGET_RMS_DB: -18,                    // Target RMS level

  // Redis pub/sub channels
  REDIS_NARRATION_CHANNEL_PREFIX: 'dreamweaver:narration:',  // + roomName
} as const;

// ============================================================================
// Event Utilities
// ============================================================================

/**
 * Generate a UUID v4 for event IDs.
 * Uses crypto.randomUUID() in modern runtimes.
 */
export function generateEventId(): string {
  // crypto.randomUUID() available in Node 19+, Bun, Deno, browsers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
