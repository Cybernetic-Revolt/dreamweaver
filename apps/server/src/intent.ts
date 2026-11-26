/**
 * Intent Parser with Ollama NLU
 *
 * Parses player commands into structured intents.
 * Uses pattern matching for quick commands, the configured LLM for natural language.
 */

import { generateResponse } from './llm';
import { logger } from './logger';

export type IntentType =
  | 'GO'
  | 'LOOK'
  | 'TAKE'
  | 'TALK'
  | 'INVENTORY'
  | 'STATUS'
  | 'REPEAT'
  | 'HELP'
  | 'STOP'
  | 'FREEFORM'  // New: for open-ended questions/roleplay
  | 'UNKNOWN';

export interface ParsedIntent {
  type: IntentType;
  target?: string;
  rawText: string;
}

// Direction aliases
const DIRECTIONS: Record<string, string> = {
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  forward: 'north',
  back: 'south',
  left: 'west',
  right: 'east',
};

// Quick pattern matching for common commands (fast path)
function quickParse(rawText: string): ParsedIntent | null {
  const text = rawText.toLowerCase().trim();
  const words = text.split(/\s+/);
  const firstWord = words[0] || '';

  // Universal commands (highest priority) - always use fast path
  if (text === 'stop' || text === 'quiet' || text === 'shut up' || text === 'be quiet') {
    return { type: 'STOP', rawText };
  }

  if (text === 'repeat' || text === 'say again' || text === 'what' || text === 'huh') {
    return { type: 'REPEAT', rawText };
  }

  if (text === 'help' || text === 'commands' || text === 'what can i say') {
    return { type: 'HELP', rawText };
  }

  // Bare directions - fast path
  if (DIRECTIONS[firstWord] && words.length === 1) {
    return { type: 'GO', target: DIRECTIONS[firstWord], rawText };
  }

  // Explicit movement commands
  if ((firstWord === 'go' || firstWord === 'move' || firstWord === 'walk' || firstWord === 'run') && words.length <= 2) {
    const direction = words[1];
    if (direction && DIRECTIONS[direction]) {
      return { type: 'GO', target: DIRECTIONS[direction], rawText };
    }
    if (!direction) {
      return { type: 'GO', rawText };
    }
  }

  // Simple look command
  if (text === 'look' || text === 'look around') {
    return { type: 'LOOK', rawText };
  }

  // Simple inventory
  if (text === 'inventory' || text === 'items' || text === 'bag') {
    return { type: 'INVENTORY', rawText };
  }

  // Simple status
  if (text === 'status') {
    return { type: 'STATUS', rawText };
  }

  // Not a quick pattern - needs Ollama
  return null;
}

// Prompt for intent parsing
const INTENT_PARSE_PROMPT = `You are parsing player commands for a text adventure game.

Given a player's input, determine the intent. Respond with ONLY a JSON object, no explanation.

Intents:
- GO: Player wants to move (target = direction: north/south/east/west)
- LOOK: Player wants to see/examine something (target = what they want to look at, or null for general look)
- TAKE: Player wants to pick up an item (target = item name)
- TALK: Player wants to talk to someone (target = person/NPC name)
- INVENTORY: Player wants to check what they're carrying
- STATUS: Player wants to know their current situation, quest, or condition
- FREEFORM: Player is asking a question, roleplaying, or doing something creative that doesn't fit other categories
- UNKNOWN: Completely unintelligible

Examples:
"go north" → {"type":"GO","target":"north"}
"what's in my bag" → {"type":"INVENTORY"}
"look at the sword" → {"type":"LOOK","target":"sword"}
"what am I wearing" → {"type":"FREEFORM"}
"who am I" → {"type":"FREEFORM"}
"hello there" → {"type":"FREEFORM"}
"grab the key" → {"type":"TAKE","target":"key"}
"speak to the old man" → {"type":"TALK","target":"old man"}
"where am I" → {"type":"STATUS"}
"can I climb the tree" → {"type":"FREEFORM"}
"I attack the goblin" → {"type":"FREEFORM"}

Player said: "{INPUT}"

JSON response:`;

/**
 * Parse raw text into a structured intent.
 * Uses quick pattern matching for common commands, Ollama for natural language.
 */
export async function parseIntent(rawText: string): Promise<ParsedIntent> {
  // Try quick pattern matching first
  const quickResult = quickParse(rawText);
  if (quickResult) {
    return quickResult;
  }

  // Use the configured LLM for natural language understanding
  try {
    const prompt = INTENT_PARSE_PROMPT.replace('{INPUT}', rawText.replace(/"/g, '\\"'));
    const result = await generateResponse(prompt, { timeoutMs: 2000 });

    if (result && result.text) {
      // Extract JSON from response
      const jsonMatch = result.text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const type = parsed.type?.toUpperCase() as IntentType;

        if (['GO', 'LOOK', 'TAKE', 'TALK', 'INVENTORY', 'STATUS', 'FREEFORM'].includes(type)) {
          logger.info('llm_intent_parsed', {
            type,
            target: parsed.target,
            rawText,
            latencyMs: result.latencyMs
          });
          return {
            type,
            target: parsed.target || undefined,
            rawText,
          };
        }
      }
    }
  } catch (e) {
    logger.warn('llm_intent_parse_error', { error: String(e), rawText });
  }

  // Fallback: treat as freeform if it's a question or has multiple words
  const text = rawText.toLowerCase();
  if (text.includes('?') || text.startsWith('what') || text.startsWith('who') ||
      text.startsWith('how') || text.startsWith('why') || text.startsWith('can i') ||
      text.startsWith('i ') || rawText.split(/\s+/).length > 3) {
    return { type: 'FREEFORM', rawText };
  }

  return { type: 'UNKNOWN', rawText };
}

/**
 * Synchronous parse for backwards compatibility (no LLM call).
 */
export function parseIntentSync(rawText: string): ParsedIntent {
  const quickResult = quickParse(rawText);
  if (quickResult) {
    return quickResult;
  }

  // Fallback heuristics
  const text = rawText.toLowerCase();
  if (text.includes('?') || text.startsWith('what') || text.startsWith('who') ||
      text.startsWith('how') || text.startsWith('why') || text.startsWith('can i') ||
      text.startsWith('i ')) {
    return { type: 'FREEFORM', rawText };
  }

  return { type: 'UNKNOWN', rawText };
}

/**
 * Get a human-readable description of an intent.
 */
export function describeIntent(intent: ParsedIntent): string {
  switch (intent.type) {
    case 'GO':
      return intent.target ? `go ${intent.target}` : 'go somewhere';
    case 'LOOK':
      return intent.target ? `look at ${intent.target}` : 'look around';
    case 'TAKE':
      return intent.target ? `take ${intent.target}` : 'take something';
    case 'TALK':
      return intent.target ? `talk to ${intent.target}` : 'talk to someone';
    case 'INVENTORY':
      return 'check inventory';
    case 'STATUS':
      return 'check status';
    case 'REPEAT':
      return 'repeat last';
    case 'HELP':
      return 'get help';
    case 'STOP':
      return 'stop narration';
    case 'FREEFORM':
      return 'freeform action';
    default:
      return 'unknown command';
  }
}
