/**
 * Intent Parser (No LLM)
 *
 * Parses player commands into structured intents.
 * Day 5: strict pattern matching, no ambiguity.
 */

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
  | 'UNKNOWN';

export interface ParsedIntent {
  type: IntentType;
  target?: string;  // For GO, TAKE, TALK
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

/**
 * Parse raw text into a structured intent.
 */
export function parseIntent(rawText: string): ParsedIntent {
  const text = rawText.toLowerCase().trim();
  const words = text.split(/\s+/);
  const firstWord = words[0] || '';

  // Universal commands (highest priority)
  if (text === 'stop' || text === 'quiet' || text === 'shut up' || text === 'be quiet') {
    return { type: 'STOP', rawText };
  }

  if (text === 'repeat' || text === 'say again' || text === 'what' || text === 'huh') {
    return { type: 'REPEAT', rawText };
  }

  if (text === 'help' || text === 'commands' || text === 'what can i say') {
    return { type: 'HELP', rawText };
  }

  if (text === 'status' || text === 'where am i' || text === 'how am i doing') {
    return { type: 'STATUS', rawText };
  }

  if (text === 'inventory' || text === 'items' || text === 'what do i have' || text === 'bag') {
    return { type: 'INVENTORY', rawText };
  }

  // Movement
  if (firstWord === 'go' || firstWord === 'move' || firstWord === 'walk' || firstWord === 'run') {
    const direction = words[1];
    if (direction && DIRECTIONS[direction]) {
      return { type: 'GO', target: DIRECTIONS[direction], rawText };
    }
    // Just "go" without direction
    return { type: 'GO', rawText };
  }

  // Bare direction
  if (DIRECTIONS[firstWord]) {
    return { type: 'GO', target: DIRECTIONS[firstWord], rawText };
  }

  // Look/examine
  if (firstWord === 'look' || firstWord === 'examine' || firstWord === 'inspect' || firstWord === 'search') {
    const target = words.slice(1).join(' ') || undefined;
    return { type: 'LOOK', target, rawText };
  }

  // Take/pick up
  if (firstWord === 'take' || firstWord === 'grab' || firstWord === 'pick' || firstWord === 'get') {
    const target = words.slice(1).filter(w => w !== 'up' && w !== 'the').join(' ');
    return { type: 'TAKE', target: target || undefined, rawText };
  }

  // Talk/speak
  if (firstWord === 'talk' || firstWord === 'speak' || firstWord === 'ask' || firstWord === 'greet') {
    const target = words.slice(1).filter(w => w !== 'to' && w !== 'with' && w !== 'the').join(' ');
    return { type: 'TALK', target: target || undefined, rawText };
  }

  // Unknown intent
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
    default:
      return 'unknown command';
  }
}
