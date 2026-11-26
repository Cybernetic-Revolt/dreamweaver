# Day 9: Character Creation Flow

Day 9 adds a short voice-driven dialogue that runs once per room before the adventure starts: name, archetype, trait.

## Features Implemented

### 1. Deterministic Creation Dialogue

**Problem:** The GM needs to know who the player is before narrating, and this has to work over flaky STT without an LLM round-trip for every step.

**Solution:**
- `creationStep` on `GameState`: `intro -> name -> archetype -> trait -> done`
- Pure pattern matching, no LLM call:
  - `name`: strips "my name is / call me / I'm" prefixes, falls back to raw text
  - `archetype`: substring match against `fighter | mage | rogue`; re-prompts on no match
  - `trait`: takes the raw utterance verbatim
- Runs *before* `parseIntent`/`processIntent` so "I'm a Fighter" is never misparsed as a GO/TALK command

**Files:**
- `packages/shared/state.ts` - `Character`, `CreationStep`, `characterDraft` on `GameState`
- `apps/server/src/character.ts` - `isCreatingCharacter()`, `handleCharacterCreation()`
- `apps/server/src/index.ts` - routes commands to creation while `creationStep !== 'done'`

### 2. Character Referenced In Play

**Problem:** Acceptance check requires the AI to reference character details after creation, not just store them.

**Solution:**
- `buildPrompt()` now includes `Player character: {name}, a {archetype} known for being {trait}.` in every LLM prompt once `state.character` is set
- FREEFORM guidance updated to describe the real character instead of a generic placeholder

**Files:**
- `apps/server/src/prompts.ts`

## Creation Flow

```
Player: (any first command)
GM: "Welcome, adventurer. What shall I call you?"
Player: "My name is Theron"
GM: "Theron. Are you a Fighter, skilled in combat? A Mage, wielding
     arcane power? Or a Rogue, master of shadows?"
Player: "I'm a Fighter"
GM: "A warrior's path. What's one thing everyone notices about you?"
Player: "I have a scar across my left eye"
GM: "Theron the fighter, I have a scar across my left eye. Your legend begins."
```

## Scope Note

The current architecture holds one `GameState` per room (not per player identity) — this is a single shared character per room, matching the existing walking-skeleton scope rather than a per-player roster. Multi-character parties are deferred, consistent with the sprint's "defer anything beyond the walking skeleton" rule.

## Acceptance Tests

| Test | Expected Result |
|------|-----------------|
| Full creation flow | Name → archetype → trait → "Your legend begins." |
| Unrecognized archetype | Re-prompts without advancing |
| Creation blocks normal commands | "look"/"go north" during creation are consumed as answers, not parsed |
| GM references character after creation | Narration/FREEFORM answers use the real name/archetype/trait |

## Next Steps (Day 10+)

- Adventure content expansion (per 14-day sprint plan)
- Per-player characters if multiplayer parties become a requirement
