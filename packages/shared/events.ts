/**
 * Dreamweaver Event Contract
 *
 * All events exchanged between mobile, server, and agent.
 * This is the single source of truth for event types.
 */

// ============================================================================
// Command Events (PTT → STT → Game)
// ============================================================================

export interface CommandStart {
  type: 'COMMAND_START';
  sessionId: string;
  identity: string;  // player_id who pressed PTT
  ts: number;        // unix ms
}

export interface CommandText {
  type: 'COMMAND_TEXT';
  sessionId: string;
  identity: string;
  text: string;      // STT output
  ts: number;
}

export interface CommandEnd {
  type: 'COMMAND_END';
  sessionId: string;
  identity: string;
  ts: number;
}

// ============================================================================
// Narration Events (Agent → Clients)
// ============================================================================

export interface NarrationStart {
  type: 'NARRATION_START';
  sessionId: string;
  ts: number;
}

export interface NarrationEnd {
  type: 'NARRATION_END';
  sessionId: string;
  ts: number;
}

export interface NarrationInterrupt {
  type: 'NARRATION_INTERRUPT';
  sessionId: string;
  identity: string;  // who interrupted
  reason: 'ptt' | 'stop_command' | 'system';
  ts: number;
}

// ============================================================================
// State Events (Server → Clients)
// ============================================================================

export interface StatePatch {
  type: 'STATE_PATCH';
  sessionId: string;
  version: number;
  patch: Record<string, unknown>;  // JSON patch or partial state
  ts: number;
}

export interface StateAck {
  type: 'STATE_ACK';
  sessionId: string;
  version: number;  // client acknowledges this version
}

export interface StateSync {
  type: 'STATE_SYNC';
  sessionId: string;
  version: number;
  state: SessionState;
  missedEvents?: DreamweaverEvent[];
  ts: number;
}

// ============================================================================
// Session Events
// ============================================================================

export interface SessionCreated {
  type: 'SESSION_CREATED';
  sessionId: string;
  roomCode: string;
  hostIdentity: string;
  ts: number;
}

export interface PlayerJoined {
  type: 'PLAYER_JOINED';
  sessionId: string;
  identity: string;
  displayName: string;
  ts: number;
}

export interface PlayerLeft {
  type: 'PLAYER_LEFT';
  sessionId: string;
  identity: string;
  reason: 'disconnect' | 'kick' | 'timeout';
  ts: number;
}

export interface PlayerReconnected {
  type: 'PLAYER_RECONNECTED';
  sessionId: string;
  identity: string;
  ts: number;
}

export interface SessionPaused {
  type: 'SESSION_PAUSED';
  sessionId: string;
  reason: 'player_request' | 'phone_call' | 'navigation' | 'timeout';
  ts: number;
}

export interface SessionResumed {
  type: 'SESSION_RESUMED';
  sessionId: string;
  ts: number;
}

export interface SessionEnded {
  type: 'SESSION_ENDED';
  sessionId: string;
  reason: 'completed' | 'host_ended' | 'timeout' | 'error';
  ts: number;
}

// ============================================================================
// Audio State Events (for ducking coordination)
// ============================================================================

export interface PttStart {
  type: 'PTT_START';
  sessionId: string;
  identity: string;
  ts: number;
}

export interface PttEnd {
  type: 'PTT_END';
  sessionId: string;
  identity: string;
  ts: number;
}

// ============================================================================
// Agent Detection Events (internal)
// ============================================================================

export interface PttTrackDetected {
  type: 'PTT_TRACK_DETECTED';
  roomName: string;
  identity: string;       // participant who published
  trackSid: string;       // LiveKit track SID
  trackName: string;      // should be "ptt"
  ts: number;
}

export interface PttTrackEnded {
  type: 'PTT_TRACK_ENDED';
  roomName: string;
  identity: string;
  trackSid: string;
  ts: number;
}

// ============================================================================
// Error Events
// ============================================================================

export interface ErrorEvent {
  type: 'ERROR';
  sessionId: string;
  code: string;
  message: string;
  ts: number;
}

// ============================================================================
// Union Types
// ============================================================================

export type CommandEvent = CommandStart | CommandText | CommandEnd;
export type NarrationEvent = NarrationStart | NarrationEnd | NarrationInterrupt;
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
} as const;
