/**
 * Prompt Templates for Ollama Game Master
 *
 * Builds context-aware prompts for dynamic narrative generation.
 */

import type { GameState } from '@dreamweaver/shared/state';
import type { ParsedIntent } from './intent';
import { getLocation, QUEST_STEPS } from './locations';

// Intent-specific guidance
const INTENT_GUIDANCE: Record<string, string> = {
  LOOK: 'Describe what the player sees. Mention interesting things they could interact with.',
  GO: 'Describe the journey and arrival at the new location briefly.',
  TAKE: 'Describe picking up the item. Make it feel rewarding.',
  TALK: 'Provide brief dialogue from the NPC. Stay in character.',
  INVENTORY: 'List the items naturally, as if the player is checking their pack.',
  STATUS: 'Summarize the current situation and quest progress.',
  HELP: 'List available commands in a friendly, in-character way.',
  FREEFORM: 'Answer the player\'s question or respond to their roleplay. Stay in character as the narrator. Be creative but consistent with the game world. If they ask about themselves, describe their character (a wandering adventurer in simple traveling clothes).',
  UNKNOWN: 'Gently redirect the player. Suggest what they might try instead.',
};

// Driving mode constraints - CRITICAL for safety
const DRIVING_CONSTRAINTS = `
CRITICAL RULES (you must follow these exactly):
- Maximum 50 words total
- No memory puzzles, riddles, or sequences to remember
- No numbered lists or multiple choice
- End with at most ONE simple suggestion like "You could go north or look around."
- No urgency words like "hurry", "quick", "timer", "run"
- Be atmospheric but extremely concise
`;

/**
 * Build a complete prompt for Ollama based on game state and intent.
 */
export function buildPrompt(
  state: GameState,
  intent: ParsedIntent,
): string {
  const location = getLocation(state.locationId);
  const quest = QUEST_STEPS[state.step];

  // Build location context
  const locationContext = location
    ? `
Location: ${location.name}
${location.description}

Exits: ${Object.keys(location.exits).join(', ') || 'none'}
Items here: ${location.items.join(', ') || 'none'}
NPCs here: ${location.npcs.map((n) => n.replace('_', ' ')).join(', ') || 'none'}`
    : 'Location: Unknown';

  // Build player context
  const playerContext = `
Player inventory: ${state.inventory.length > 0 ? state.inventory.join(', ') : 'empty'}
Quest: ${quest?.description || 'Explore the world'}`;

  // Build intent context
  const intentContext = `
Player said: "${intent.rawText}"
Intent: ${intent.type}${intent.target ? ` targeting "${intent.target}"` : ''}

${INTENT_GUIDANCE[intent.type] || 'Respond appropriately.'}`;

  // Combine into full prompt
  const prompt = `You are a Game Master for a fantasy text adventure called "The Lost Artifact".
${state.mode === 'driving' ? DRIVING_CONSTRAINTS : 'Keep responses under 100 words.'}

CURRENT SCENE:
${locationContext}

PLAYER STATE:
${playerContext}

PLAYER ACTION:
${intentContext}

Respond with ONLY the narration text. No meta-commentary. No "As a GM..." preambles.
Be atmospheric and immersive but concise.`;

  return prompt;
}

/**
 * Build a simpler prompt for quick responses (HELP, STATUS, INVENTORY).
 */
export function buildSimplePrompt(
  state: GameState,
  intent: ParsedIntent,
): string {
  const quest = QUEST_STEPS[state.step];

  if (intent.type === 'INVENTORY') {
    if (state.inventory.length === 0) {
      return 'Respond naturally that the player\'s pack is empty. One sentence only.';
    }
    return `The player checks their inventory. They have: ${state.inventory.join(', ')}.
Describe this naturally in one brief sentence, as if narrating them looking through their pack.`;
  }

  if (intent.type === 'STATUS') {
    const location = getLocation(state.locationId);
    return `Briefly summarize: Player is at "${location?.name || 'unknown location'}".
Quest: "${quest?.description || 'Explore'}". Items: ${state.inventory.length}.
One or two sentences maximum.`;
  }

  if (intent.type === 'HELP') {
    return `In character as a mystical narrator, briefly tell the player they can:
look around, go (direction), take items, talk to people, check inventory, or ask for status.
Keep it under 30 words and atmospheric.`;
  }

  return buildPrompt(state, intent);
}

/**
 * Extract choices from location for post-LLM suggestion.
 */
export function suggestChoices(state: GameState): string[] {
  const location = getLocation(state.locationId);
  if (!location) return ['look', 'help'];

  const choices: string[] = [];

  // Suggest an exit
  const exits = Object.keys(location.exits);
  if (exits.length > 0) {
    choices.push(`go ${exits[0]}`);
  }

  // Suggest an interaction
  if (location.npcs.length > 0) {
    choices.push(`talk to ${location.npcs[0].replace('_', ' ')}`);
  } else if (location.items.length > 0) {
    choices.push(`take ${location.items[0]}`);
  } else {
    choices.push('look');
  }

  return choices.slice(0, 2);
}
