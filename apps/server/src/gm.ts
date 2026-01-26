/**
 * Deterministic Micro-GM
 *
 * Day 5: Rule-based game master that maintains world state.
 * No LLM - pure deterministic responses.
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

export interface GMResult {
  narration: NarrationReady;
  stateUpdates: Partial<GameState>;
  questAdvanced: boolean;
}

/**
 * Process an intent and generate narration + state updates.
 */
export function processIntent(
  state: GameState,
  intent: ParsedIntent,
  pttSessionId: string,
  traceId: string,
): GMResult {
  const location = getLocation(state.locationId);
  if (!location) {
    return errorResult(state, pttSessionId, traceId, 'You are lost in the void.');
  }

  switch (intent.type) {
    case 'LOOK':
      return handleLook(state, location, intent.target, pttSessionId, traceId);

    case 'GO':
      return handleGo(state, location, intent.target, pttSessionId, traceId);

    case 'TAKE':
      return handleTake(state, location, intent.target, pttSessionId, traceId);

    case 'TALK':
      return handleTalk(state, location, intent.target, pttSessionId, traceId);

    case 'INVENTORY':
      return handleInventory(state, pttSessionId, traceId);

    case 'STATUS':
      return handleStatus(state, location, pttSessionId, traceId);

    case 'HELP':
      return handleHelp(state, pttSessionId, traceId);

    case 'REPEAT':
      return handleRepeat(state, pttSessionId, traceId);

    case 'STOP':
      return handleStop(state, pttSessionId, traceId);

    case 'UNKNOWN':
    default:
      return handleUnknown(state, pttSessionId, traceId);
  }
}

// ============================================================================
// Intent Handlers
// ============================================================================

function handleLook(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  target: string | undefined,
  pttSessionId: string,
  traceId: string,
): GMResult {
  // Look at specific thing
  if (target) {
    if (location.items.includes(target)) {
      return successResult(
        state,
        pttSessionId,
        traceId,
        `The ${target} looks interesting. You could take it.`,
        ['take ' + target, 'look around'],
      );
    }
    if (location.npcs.includes(target) || location.npcs.includes(target.replace(' ', '_'))) {
      const npc = target.replace(' ', '_');
      return successResult(
        state,
        pttSessionId,
        traceId,
        `The ${target.replace('_', ' ')} watches you expectantly.`,
        ['talk to ' + target.replace('_', ' '), 'look around'],
      );
    }
    return successResult(
      state,
      pttSessionId,
      traceId,
      `You don't see any ${target} here.`,
      ['look around', 'help'],
    );
  }

  // General look
  const detail = location.lookDetails[Math.floor(Math.random() * location.lookDetails.length)];
  const exits = getExitDescription(location);
  const items = getItemsDescription(location);
  const npcs = getNpcsDescription(location);

  let text = `${location.description} ${detail}`;
  if (npcs) text += ` ${npcs}`;
  if (items) text += ` ${items}`;
  text += ` ${exits}`;

  // Determine good choices based on what's available
  const choices: string[] = [];
  if (Object.keys(location.exits).length > 0) {
    choices.push('go ' + Object.keys(location.exits)[0]);
  }
  if (location.npcs.length > 0) {
    choices.push('talk to ' + location.npcs[0].replace('_', ' '));
  } else if (location.items.length > 0) {
    choices.push('take ' + location.items[0]);
  } else {
    choices.push('check inventory');
  }

  return successResult(state, pttSessionId, traceId, text, choices);
}

function handleGo(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  direction: string | undefined,
  pttSessionId: string,
  traceId: string,
): GMResult {
  if (!direction) {
    const exits = Object.keys(location.exits);
    if (exits.length === 0) {
      return successResult(state, pttSessionId, traceId, 'There is nowhere to go from here.', ['look', 'help']);
    }
    return successResult(
      state,
      pttSessionId,
      traceId,
      `Which way? ${getExitDescription(location)}`,
      exits.slice(0, 2).map(d => 'go ' + d),
    );
  }

  const newLocationId = location.exits[direction];
  if (!newLocationId) {
    return successResult(
      state,
      pttSessionId,
      traceId,
      `You can't go ${direction} from here. ${getExitDescription(location)}`,
      Object.keys(location.exits).slice(0, 2).map(d => 'go ' + d),
    );
  }

  const newLocation = getLocation(newLocationId);
  if (!newLocation) {
    return errorResult(state, pttSessionId, traceId, 'That path leads nowhere.');
  }

  // Check for quest advancement
  let questAdvanced = false;
  let questNarration = '';
  if (state.step === 1 && newLocationId === 'ancient_ruins') {
    questAdvanced = true;
    questNarration = ' ' + (QUEST_STEPS[2]?.narration || '');
  }

  const text = `You head ${direction}. ${newLocation.description}${questNarration}`;
  const exits = Object.keys(newLocation.exits);
  const choices = exits.length > 0
    ? [exits[0] === direction ? 'look' : 'go ' + exits[0], 'look']
    : ['look', 'help'];

  return {
    narration: buildNarration(state, pttSessionId, traceId, text, choices),
    stateUpdates: {
      locationId: newLocationId,
      step: questAdvanced ? 2 : state.step,
      updatedAt: Date.now(),
    },
    questAdvanced,
  };
}

function handleTake(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  item: string | undefined,
  pttSessionId: string,
  traceId: string,
): GMResult {
  if (!item) {
    if (location.items.length === 0) {
      return successResult(state, pttSessionId, traceId, 'There is nothing to take here.', ['look', 'help']);
    }
    return successResult(
      state,
      pttSessionId,
      traceId,
      `What do you want to take? ${getItemsDescription(location)}`,
      location.items.slice(0, 2).map(i => 'take ' + i),
    );
  }

  if (!location.items.includes(item)) {
    return successResult(
      state,
      pttSessionId,
      traceId,
      `There is no ${item} here.`,
      ['look', 'inventory'],
    );
  }

  // Check for quest advancement
  let questAdvanced = false;
  let questNarration = '';
  if (item === 'ancient_artifact' && state.step === 2) {
    questAdvanced = true;
    questNarration = ' ' + (QUEST_STEPS[3]?.narration || '');
  }

  const text = `You pick up the ${item}.${questNarration}`;
  const newInventory = [...state.inventory, item];
  const newItems = location.items.filter(i => i !== item);

  return {
    narration: buildNarration(state, pttSessionId, traceId, text, ['inventory', 'look']),
    stateUpdates: {
      inventory: newInventory,
      step: questAdvanced ? 3 : state.step,
      updatedAt: Date.now(),
    },
    questAdvanced,
  };
}

function handleTalk(
  state: GameState,
  location: ReturnType<typeof getLocation> & {},
  npc: string | undefined,
  pttSessionId: string,
  traceId: string,
): GMResult {
  if (!npc) {
    if (location.npcs.length === 0) {
      return successResult(state, pttSessionId, traceId, 'There is no one to talk to here.', ['look', 'help']);
    }
    return successResult(
      state,
      pttSessionId,
      traceId,
      `Who do you want to talk to? ${getNpcsDescription(location)}`,
      location.npcs.slice(0, 2).map(n => 'talk to ' + n.replace('_', ' ')),
    );
  }

  const npcId = npc.replace(' ', '_');
  if (!location.npcs.includes(npcId)) {
    return successResult(
      state,
      pttSessionId,
      traceId,
      `${npc} is not here.`,
      ['look', 'help'],
    );
  }

  // Check for quest advancement
  let questAdvanced = false;
  let questNarration = '';
  if (npcId === 'old_hermit' && state.step === 0) {
    questAdvanced = true;
    questNarration = QUEST_STEPS[1]?.narration || '';
  } else {
    questNarration = `The ${npc.replace('_', ' ')} greets you warmly.`;
  }

  return {
    narration: buildNarration(state, pttSessionId, traceId, questNarration, ['look', 'go north']),
    stateUpdates: {
      step: questAdvanced ? 1 : state.step,
      updatedAt: Date.now(),
    },
    questAdvanced,
  };
}

function handleInventory(
  state: GameState,
  pttSessionId: string,
  traceId: string,
): GMResult {
  if (state.inventory.length === 0) {
    return successResult(state, pttSessionId, traceId, 'Your inventory is empty.', ['look', 'help']);
  }

  // Keep narration under 12 seconds - limit to 5 items max in speech
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

  // Re-emit the last narration exactly
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
  // Set quietUntil to suppress narration for 60 seconds
  return {
    narration: buildNarration(state, pttSessionId, traceId, 'Okay.', undefined),
    stateUpdates: {
      quietUntil: Date.now() + 60000,
      updatedAt: Date.now(),
    },
    questAdvanced: false,
  };
}

function handleUnknown(
  state: GameState,
  pttSessionId: string,
  traceId: string,
): GMResult {
  // 2 choices max, no lecture
  return successResult(
    state,
    pttSessionId,
    traceId,
    "I didn't understand that.",
    ['help', 'look'],
  );
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
    choices: choices?.slice(0, 2),  // Max 2 choices
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
