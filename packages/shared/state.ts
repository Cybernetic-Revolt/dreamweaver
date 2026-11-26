/**
 * Dreamweaver Game State Model
 *
 * Minimum viable state for Day 5 deterministic game loop.
 * Stored server-side in SQLite keyed by roomName.
 */

export type GameMode = 'driving' | 'stationary';

export type CharacterArchetype = 'fighter' | 'mage' | 'rogue';

export interface Character {
  name: string;
  archetype: CharacterArchetype;
  trait: string;
}

// Day 9: character creation runs once per room, before the adventure starts.
// 'intro' = nobody has spoken yet, the next command triggers the welcome prompt.
export type CreationStep = 'intro' | 'name' | 'archetype' | 'trait' | 'done';

export interface GameState {
  sessionId: string;
  roomName: string;
  mode: GameMode;
  locationId: string;
  questId: string;
  step: number;
  flags: Record<string, boolean>;
  inventory: string[];
  character: Character | null;
  creationStep: CreationStep;
  characterDraft: Partial<Character>;
  lastNarration?: {
    narrationId: string;
    text: string;
    choices?: string[];
  };
  quietUntil?: number;  // Timestamp when STOP was issued
  updatedAt: number;
}

/**
 * Create initial game state for a new session.
 */
export function createInitialState(sessionId: string, roomName: string): GameState {
  return {
    sessionId,
    roomName,
    mode: 'driving',
    locationId: 'forest_entrance',
    questId: 'find_the_artifact',
    step: 0,
    flags: {},
    inventory: [],
    character: null,
    creationStep: 'intro',
    characterDraft: {},
    updatedAt: Date.now(),
  };
}

/**
 * Serialize state to JSON for SQLite storage.
 */
export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize state from SQLite storage.
 */
export function deserializeState(json: string): GameState {
  return JSON.parse(json) as GameState;
}
