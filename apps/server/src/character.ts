/**
 * Day 9: Voice-Driven Character Creation
 *
 * A short deterministic dialogue that runs once per room before the
 * adventure starts: name -> archetype -> trait -> done. Entirely
 * pattern-matched (no LLM) so it's fast and never derails into the
 * normal GO/LOOK/TAKE intent parser.
 */

import type { NarrationReady } from '@dreamweaver/shared';
import { generateEventId } from '@dreamweaver/shared';
import type { GameState, CharacterArchetype } from '@dreamweaver/shared/state';
import type { GMResult } from './gm';
import { logger } from './logger';

const ARCHETYPES: CharacterArchetype[] = ['fighter', 'mage', 'rogue'];

export function isCreatingCharacter(state: GameState): boolean {
  return state.creationStep !== 'done';
}

/**
 * Extract a name from free speech like "my name is Theron" or "call me Theron".
 * Falls back to the raw text (title-cased, first few words) if no pattern matches.
 */
function extractName(rawText: string): string {
  const match = rawText.match(/(?:my name is|i'm|im|call me|i am)\s+([a-z'-]+)/i);
  const raw = match ? match[1] : rawText.trim().split(/\s+/).slice(0, 2).join(' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function extractArchetype(rawText: string): CharacterArchetype | null {
  const lower = rawText.toLowerCase();
  return ARCHETYPES.find((a) => lower.includes(a)) || null;
}

const ARCHETYPE_FLAVOR: Record<CharacterArchetype, string> = {
  fighter: "A warrior's path.",
  mage: 'The arcane calls to you.',
  rogue: 'The shadows suit you well.',
};

export function handleCharacterCreation(
  state: GameState,
  rawText: string,
  pttSessionId: string,
  traceId: string,
): GMResult {
  switch (state.creationStep) {
    case 'intro':
      return narrate(
        state,
        pttSessionId,
        traceId,
        'Welcome, adventurer. What shall I call you?',
        { creationStep: 'name' },
      );

    case 'name': {
      const name = extractName(rawText);
      logger.info('character_name_set', { name, traceId });
      return narrate(
        state,
        pttSessionId,
        traceId,
        `${name}. Are you a Fighter, skilled in combat? A Mage, wielding arcane power? Or a Rogue, master of shadows?`,
        { creationStep: 'archetype', characterDraft: { ...state.characterDraft, name } },
      );
    }

    case 'archetype': {
      const archetype = extractArchetype(rawText);
      if (!archetype) {
        return narrate(
          state,
          pttSessionId,
          traceId,
          "I didn't catch that. Are you a Fighter, a Mage, or a Rogue?",
          {},
        );
      }
      logger.info('character_archetype_set', { archetype, traceId });
      return narrate(
        state,
        pttSessionId,
        traceId,
        `${ARCHETYPE_FLAVOR[archetype]} What's one thing everyone notices about you?`,
        { creationStep: 'trait', characterDraft: { ...state.characterDraft, archetype } },
      );
    }

    case 'trait': {
      const trait = rawText.trim();
      const draft = state.characterDraft;
      const character = {
        name: draft.name || 'Adventurer',
        archetype: draft.archetype || 'fighter',
        trait,
      };
      logger.info('character_created', { character, traceId });
      return narrate(
        state,
        pttSessionId,
        traceId,
        `${character.name} the ${character.archetype}, ${character.trait}. Your legend begins.`,
        { creationStep: 'done', character, characterDraft: {} },
      );
    }

    default:
      // Already done - should not be routed here.
      return narrate(state, pttSessionId, traceId, 'Your legend continues.', {});
  }
}

function narrate(
  state: GameState,
  pttSessionId: string,
  traceId: string,
  text: string,
  stateUpdates: Partial<GameState>,
): GMResult {
  const narration: NarrationReady = {
    type: 'NARRATION_READY',
    eventId: generateEventId(),
    sessionId: state.sessionId,
    pttSessionId,
    text,
    mode: state.mode,
    ts: Date.now(),
    traceId,
  };

  return {
    narration,
    stateUpdates: { ...stateUpdates, updatedAt: Date.now() },
    questAdvanced: false,
  };
}
