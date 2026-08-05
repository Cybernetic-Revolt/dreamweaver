/**
 * Ollama-Powered Game Master
 *
 * Dynamic narrative generation with LLM, with deterministic fallback.
 * Maintains game state and enforces driving mode safety constraints.
 */

import type { NarrationReady } from '@dreamweaver/shared';
import { generateEventId } from '@dreamweaver/shared';
import type { GameState } from '@dreamweaver/shared/state';
import type { ParsedIntent } from './intent';
import {
  getLocation,
  getExitDescription,
  getItemsDescription,
  getNpcsDescription,
  QUEST_STEPS,
} from './locations';
import { generateResponse } from './deepseek';
import { buildPrompt, suggestChoices } from './prompts';
import { logger } from './logger';

export interface GMResult {
  narration: NarrationReady;
  stateUpdates: Partial<GameState>;
  questAdvanced: boolean;
  ollamaUsed?: boolean;
  ollamaMs?: number;
}

// Intents that use LLM for dynamic responses
const LLM_INTENTS = new Set(['LOOK', 'GO', 'TAKE', 'TALK', 'FREEFORM', 'UNKNOWN']);

/**
 * Process an intent and generate narration + state updates.
 * Uses Ollama for narrative intents, with fallback to deterministic responses.
 */
export async function processIntent(
  state: GameState,
  intent: ParsedIntent,
  pttSessionId: string,
  traceId: string,
): Promise<GMResult> {
  const location = getLocation(state.locationId);
  if (!location) {
    return errorResult(state, pttSessionId, traceId, 'You are lost in the void.');
  }

  // Deterministic intents - no LLM needed
  switch (intent.type) {
    case 'REPEAT':
      return handleRepeat(state, pttSessionId, traceId);
    case 'STOP':
      return handleStop(state, pttSessionId, traceId);
    case 'HELP':
      return handleHelp(state, pttSessionId, traceId);
    case 'INVENTORY':
      return handleInventory(state, pttSessionId, traceId);
    case 'STATUS':
      return handleStatus(state, location, pttSessionId, traceId);
  }

  // Narrative intents - try LLM first
  // First compute state changes (these are deterministic)
  const stateResult = computeStateChanges(state, location, intent);

  // Try to get dynamic narration from Ollama
  let narrationText: string | null = null;
  let ollamaMs = 0;
  let ollamaUsed = false;

  if (LLM_INTENTS.has(intent.type)) {
    const prompt = buildPrompt(state, intent);
    const ollamaResult = await generateResponse(prompt);

    if (ollamaResult && ollamaResult.text.length > 0) {
      // Validate response length for driving mode
      const wordCount = ollamaResult.text.split(/\s+/).length;
      if (state.mode === 'driving' && wordCount > 60) {
        logger.warn('ollama_response_too_long', { wordCount, traceId });
      } else {
        narrationText = ollamaResult.text;
        ollamaMs = ollamaResult.latencyMs;
        ollamaUsed = true;
        logger.info('ollama_used', { intent: intent.type, latencyMs: ollamaMs, traceId });
      }
    } else {
      logger.info('ollama_fallback', { intent: intent.type, traceId });
    }
  }

  // Fallback to deterministic narration if LLM failed
  if (!narrationText) {
    narrationText = getDeterministicNarration(state, location, intent, stateResult);
  }

  const choices = suggestChoices(stateResult.newState || state);

  return {
    narration: buildNarration(state, pttSessionId, traceId, narrationText, choices),
    stateUpdates: stateResult.updates,
    questAdvanced: stateResult.questAdvanced,
    ollamaUsed,
    ollamaMs,
  };
}

// ============================================================================
// State Change Computation (Deterministic)
// ============================================================================

interface StateChangeResult {
  updates: Partial<GameState>;
  questAdvanced: boolean;
  newState?: GameState;
  context?: {
    newLocation?: ReturnType<typeof getLocation>;
    takenItem?: string;
    npcTalkedTo?: string;
  };
}

function computeStateChanges(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  intent: ParsedIntent,
): StateChangeResult {
  switch (intent.type) {
    case 'GO': {
      const direction = intent.target;
      if (!direction) return { updates: {}, questAdvanced: false };

      const newLocationId = location.exits[direction];
      if (!newLocationId) return { updates: {}, questAdvanced: false };

      const newLocation = getLocation(newLocationId);
      if (!newLocation) return { updates: {}, questAdvanced: false };

      let questAdvanced = false;
      if (state.step === 1 && newLocationId === 'ancient_ruins') {
        questAdvanced = true;
      }

      return {
        updates: {
          locationId: newLocationId,
          step: questAdvanced ? 2 : state.step,
          updatedAt: Date.now(),
        },
        questAdvanced,
        newState: { ...state, locationId: newLocationId },
        context: { newLocation },
      };
    }

    case 'TAKE': {
      const item = intent.target;
      if (!item || !location.items.includes(item)) {
        return { updates: {}, questAdvanced: false };
      }

      let questAdvanced = false;
      if (item === 'ancient_artifact' && state.step === 2) {
        questAdvanced = true;
      }

      const newInventory = [...state.inventory, item];
      return {
        updates: {
          inventory: newInventory,
          step: questAdvanced ? 3 : state.step,
          updatedAt: Date.now(),
        },
        questAdvanced,
        newState: { ...state, inventory: newInventory },
        context: { takenItem: item },
      };
    }

    case 'TALK': {
      const npc = intent.target;
      if (!npc) return { updates: {}, questAdvanced: false };

      const npcId = npc.replace(' ', '_');
      if (!location.npcs.includes(npcId)) {
        return { updates: {}, questAdvanced: false };
      }

      let questAdvanced = false;
      if (npcId === 'old_hermit' && state.step === 0) {
        questAdvanced = true;
      }

      return {
        updates: {
          step: questAdvanced ? 1 : state.step,
          updatedAt: Date.now(),
        },
        questAdvanced,
        context: { npcTalkedTo: npcId },
      };
    }

    default:
      return { updates: { updatedAt: Date.now() }, questAdvanced: false };
  }
}

// ============================================================================
// Deterministic Fallback Narration
// ============================================================================

function getDeterministicNarration(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  intent: ParsedIntent,
  stateResult: StateChangeResult,
): string {
  switch (intent.type) {
    case 'LOOK': {
      if (intent.target) {
        if (location.items.includes(intent.target)) {
          return `The ${intent.target} looks interesting. You could take it.`;
        }
        if (location.npcs.includes(intent.target) || location.npcs.includes(intent.target.replace(' ', '_'))) {
          return `The ${intent.target.replace('_', ' ')} watches you expectantly.`;
        }
        return `You don't see any ${intent.target} here.`;
      }

      const detail = location.lookDetails[Math.floor(Math.random() * location.lookDetails.length)];
      const exits = getExitDescription(location);
      const items = getItemsDescription(location);
      const npcs = getNpcsDescription(location);

      let text = `${location.description} ${detail}`;
      if (npcs) text += ` ${npcs}`;
      if (items) text += ` ${items}`;
      text += ` ${exits}`;
      return text;
    }

    case 'GO': {
      if (!intent.target) {
        const exits = Object.keys(location.exits);
        if (exits.length === 0) return 'There is nowhere to go from here.';
        return `Which way? ${getExitDescription(location)}`;
      }

      if (!location.exits[intent.target]) {
        return `You can't go ${intent.target} from here. ${getExitDescription(location)}`;
      }

      const newLocation = stateResult.context?.newLocation;
      if (!newLocation) return 'That path leads nowhere.';

      let text = `You head ${intent.target}. ${newLocation.description}`;
      if (stateResult.questAdvanced) {
        text += ' ' + (QUEST_STEPS[2]?.narration || '');
      }
      return text;
    }

    case 'TAKE': {
      if (!intent.target) {
        if (location.items.length === 0) return 'There is nothing to take here.';
        return `What do you want to take? ${getItemsDescription(location)}`;
      }

      if (!location.items.includes(intent.target)) {
        return `There is no ${intent.target} here.`;
      }

      let text = `You pick up the ${intent.target}.`;
      if (stateResult.questAdvanced) {
        text += ' ' + (QUEST_STEPS[3]?.narration || '');
      }
      return text;
    }

    case 'TALK': {
      if (!intent.target) {
        if (location.npcs.length === 0) return 'There is no one to talk to here.';
        return `Who do you want to talk to? ${getNpcsDescription(location)}`;
      }

      const npcId = intent.target.replace(' ', '_');
      if (!location.npcs.includes(npcId)) {
        return `${intent.target} is not here.`;
      }

      if (stateResult.questAdvanced) {
        return QUEST_STEPS[1]?.narration || `The ${intent.target.replace('_', ' ')} greets you.`;
      }
      return `The ${intent.target.replace('_', ' ')} greets you warmly.`;
    }

    case 'FREEFORM':
      // Fallback for freeform questions when Ollama fails
      return "Hmm, that's an interesting thought. Perhaps you should look around or explore further.";

    case 'UNKNOWN':
    default:
      return "I didn't understand that. Try 'look' or 'help'.";
  }
}

// ============================================================================
// Deterministic Intent Handlers
// ============================================================================

function handleInventory(
  state: GameState,
  pttSessionId: string,
  traceId: string,
): GMResult {
  if (state.inventory.length === 0) {
    return successResult(state, pttSessionId, traceId, 'Your inventory is empty.', ['look', 'help']);
  }

  const items = state.inventory.slice(0, 5);
  const moreCount = state.inventory.length - 5;
  let text = `You have: ${items.join(', ')}.`;
  if (moreCount > 0) {
    text += ` And ${moreCount} more items.`;
  }

  return successResult(state, pttSessionId, traceId, text, ['look', 'status']);
}

function handleStatus(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  pttSessionId: string,
  traceId: string,
): GMResult {
  const quest = QUEST_STEPS[state.step];
  const questDesc = quest?.description || 'Unknown';
  const itemCount = state.inventory.length;

  const text = `You are at ${location.name}. Quest: ${questDesc}. You have ${itemCount} items.`;
  return successResult(state, pttSessionId, traceId, text, ['look', 'inventory']);
}

function handleHelp(
  state: GameState,
  pttSessionId: string,
  traceId: string,
): GMResult {
  const text = 'You can: look, go north south east west, take, talk, inventory, status, repeat, or stop.';
  return successResult(state, pttSessionId, traceId, text, ['look', 'status']);
}

function handleRepeat(
  state: GameState,
  pttSessionId: string,
  traceId: string,
): GMResult {
  if (!state.lastNarration) {
    return successResult(state, pttSessionId, traceId, 'There is nothing to repeat.', ['look', 'help']);
  }

  return {
    narration: buildNarration(
      state,
      pttSessionId,
      traceId,
      state.lastNarration.text,
      state.lastNarration.choices,
    ),
    stateUpdates: {},
    questAdvanced: false,
  };
}

function handleStop(
  state: GameState,
  pttSessionId: string,
  traceId: string,
): GMResult {
  return {
    narration: buildNarration(state, pttSessionId, traceId, 'Okay.', undefined),
    stateUpdates: {
      quietUntil: Date.now() + 60000,
      updatedAt: Date.now(),
    },
    questAdvanced: false,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildNarration(
  state: GameState,
  pttSessionId: string,
  traceId: string,
  text: string,
  choices?: string[],
): NarrationReady {
  return {
    type: 'NARRATION_READY',
    eventId: generateEventId(),
    sessionId: state.sessionId,
    pttSessionId,
    text,
    choices: choices?.slice(0, 2),
    mode: state.mode,
    ts: Date.now(),
    traceId,
  };
}

function successResult(
  state: GameState,
  pttSessionId: string,
  traceId: string,
  text: string,
  choices: string[],
): GMResult {
  return {
    narration: buildNarration(state, pttSessionId, traceId, text, choices),
    stateUpdates: { updatedAt: Date.now() },
    questAdvanced: false,
  };
}

function errorResult(
  state: GameState,
  pttSessionId: string,
  traceId: string,
  text: string,
): GMResult {
  return {
    narration: buildNarration(state, pttSessionId, traceId, text, ['help', 'look']),
    stateUpdates: {},
    questAdvanced: false,
  };
}
