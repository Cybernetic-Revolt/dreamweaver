# Driving UX Contract

## Overview

This document defines the non-negotiable constraints and contracts for Dreamweaver's driving-safe user experience. Every feature must comply with these rules. No exceptions.

## Core Principle

**If it requires eyes or hands, it doesn't ship.**

The driver must be able to:
- Start/join a game without looking at the screen
- Play entire sessions without touching the device
- Handle interrupts without unsafe behavior
- End/pause at any moment

---

## Hard Rules (Non-Negotiable)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DRIVING UX HARD RULES                                │
│                                                                         │
│  1. MAX NARRATION: 12 seconds per chunk (6-12s preferred)              │
│     - Longer content split with natural pauses                         │
│     - Player can always interrupt                                       │
│                                                                         │
│  2. INTERRUPTIONS ALWAYS WIN                                            │
│     - Phone call → instant pause, duck audio                           │
│     - Navigation prompt → duck, wait, resume                           │
│     - Player "pause" → immediate stop                                   │
│                                                                         │
│  3. NO BACK-AND-FORTH CONFIRMATIONS                                     │
│     - Bad: "Did you say attack? Say yes to confirm."                   │
│     - Good: "Theron attacks!" (just do it, player can undo)            │
│                                                                         │
│  4. TINY COMMAND SET (memorizable)                                      │
│     - repeat, pause, resume                                             │
│     - choice 1/2/3 (for decisions)                                      │
│     - inventory, status                                                 │
│     - help                                                              │
│                                                                         │
│  5. FAIL GRACEFULLY                                                     │
│     - Unclear command → "I didn't catch that" (not error)              │
│     - Timeout → auto-pause (not abandon)                                │
│     - Disconnect → hold state, welcome back                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Allowed Commands (Voice Only)

### Session Commands

| Command | Aliases | Response |
|---------|---------|----------|
| "Start game" | "New adventure", "Begin" | Creates session, reads room code |
| "Join game" | "Join session", "Enter room" | Prompts for room code verbally |
| "Room code [X]" | "[code]" | Confirms joining |
| "Pause" | "Pause game", "Hold on" | Pauses, notifies party |
| "Resume" | "Continue", "Unpause" | Resumes from pause |
| "End game" | "Stop", "Quit", "End session" | Confirms, then ends |
| "Who's here" | "Players", "Party" | Lists connected players |
| "Recap" | "What happened", "Summary" | Summarizes recent events |

### Gameplay Commands

| Command | Effect |
|---------|--------|
| "[Action description]" | Player takes described action |
| "I [verb]..." | Interpreted as character action |
| "We [verb]..." | Party action (GM may confirm) |
| "[Character name] [action]" | Specific character action |
| "What can I do?" | GM lists obvious options |
| "Where am I?" | GM describes location |
| "What do I have?" | GM lists inventory |
| "Help" | Lists available commands |

### Meta Commands

| Command | Effect |
|---------|--------|
| "Repeat that" | Replays last GM narration |
| "Slower" | Decreases TTS speed |
| "Faster" | Increases TTS speed |
| "Louder" / "Quieter" | Adjusts volume |
| "Skip intro" | Skips to gameplay (character creation) |

## Output Style Constraints

### Narration Rules

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NARRATION STYLE GUIDE                                │
│                                                                         │
│  LENGTH:                                                                │
│  • Maximum: 30 seconds when read at normal TTS speed                   │
│  • Preferred: 15-20 seconds                                            │
│  • Minimum: 5 seconds (acknowledges, prompts next)                     │
│                                                                         │
│  STRUCTURE:                                                             │
│  • Short sentences (8-15 words)                                        │
│  • Active voice                                                        │
│  • Concrete nouns, vivid verbs                                         │
│  • No complex subclauses                                               │
│                                                                         │
│  RHYTHM:                                                                │
│  • Vary sentence length                                                │
│  • Natural pause points (commas, periods)                              │
│  • Dramatic pauses with "..." sparingly                                │
│                                                                         │
│  AVOID:                                                                 │
│  • Lists of more than 3 items                                          │
│  • Visual descriptions requiring imagination of complex scenes         │
│  • Numbers beyond single digits                                        │
│  • Proper nouns without prior introduction                             │
│  • Homophone confusion (their/there, knight/night - use context)       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Example Narrations

**Too Long (BAD):**
> "You enter the grand hall of the ancient castle, where towering marble columns stretch up toward a ceiling painted with scenes of legendary battles between dragons and knights, while along the walls hang tapestries depicting the lineage of seventeen generations of the Valdris family, and in the center of the room stands an ornate throne carved from a single piece of obsidian, upon which sits an elderly figure draped in crimson robes embroidered with golden sigils of power, flanked by two armored guards holding ceremonial halberds."

**Driving-Safe (GOOD):**
> "You enter a grand hall. Marble columns rise to a painted ceiling. An old figure sits on a black throne ahead, guards at either side. The figure speaks: 'Adventurers. I've been expecting you.'"

### Predictable Patterns

Players should develop expectations about:

| Element | Pattern |
|---------|---------|
| Scene description | Location → Notable features → Inhabitants → Prompt |
| Combat | Setup → Tension → Resolution → Consequence |
| Dialogue | Speaker name → Quote → Reaction → Player prompt |
| Skill check | Challenge → "Roll..." → Beat → Outcome |

## Interruption Rules

### Priority Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    INTERRUPT PRIORITY (highest first)                   │
│                                                                         │
│  1. SYSTEM CRITICAL                                                     │
│     • Incoming phone call                                              │
│     • Navigation voice prompt                                          │
│     • Emergency alert (Amber, weather)                                 │
│     → Action: Immediate pause, duck audio, save state                  │
│                                                                         │
│  2. SYSTEM WARNING                                                      │
│     • Low battery (<10%)                                               │
│     • Poor connection                                                  │
│     → Action: Brief notification, continue play                        │
│                                                                         │
│  3. PLAYER INTERRUPT                                                    │
│     • "Pause" command                                                  │
│     • Player disconnect                                                │
│     → Action: Graceful pause with party notification                   │
│                                                                         │
│  4. GAME EVENT                                                          │
│     • New player join                                                  │
│     • Player reconnect                                                 │
│     → Action: Brief acknowledgment, continue flow                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phone Call Handling

```
[Phone rings]
→ Dreamweaver audio ducks to 20%
→ GM: "The mists swirl... [pausing]"
→ Session auto-pauses
→ Other players: "[Name] has a call, game paused"

[Call ends]
→ GM: "Welcome back. Ready to continue?"
→ Player: "Resume" or "Recap"
```

### Navigation Prompt Handling

```
[Nav: "In 500 feet, turn right"]
→ Dreamweaver audio ducks for nav duration
→ Narration pauses if mid-sentence
→ Resumes automatically after nav complete
```

## Attention Budget

### Cognitive Load Limits

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ATTENTION BUDGET                                     │
│                                                                         │
│  RULE: Never exceed 30% of driver's cognitive capacity                 │
│                                                                         │
│  METRIC                          │ LIMIT         │ ENFORCEMENT          │
│  ───────────────────────────────┼───────────────┼─────────────────────  │
│  Continuous narration            │ 30 seconds    │ Hard cutoff + chunk  │
│  Decision prompts per minute     │ 2 maximum     │ GM throttles pace    │
│  Rapid-fire events              │ None          │ Batch into summary   │
│  Complex choices (>3 options)   │ Discouraged   │ Binary or recap      │
│  New proper nouns per scene     │ 2 maximum     │ Introduce gradually  │
│  Silence check interval         │ 60 seconds    │ GM offers pause      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pacing Examples

**High-Intensity Scene (Combat):**
```
GM: "The goblin swings! Do you block or dodge?"
Player: "Block!"
GM: "Your shield catches the blow. The goblin stumbles. Strike back?"
Player: "Yes, I attack!"
GM: "Your blade finds its mark. The goblin falls. Combat ends."
[3 second pause]
GM: "The chamber is quiet now. A door lies ahead."
```

**Low-Intensity Scene (Exploration):**
```
GM: "You follow the river north. Trees give way to rocky terrain.
     The air grows cool. Ahead, a cave mouth in the hillside."
[Natural pause point - 5+ seconds for driver processing]
GM: "What would you like to do?"
```

### Silence Protocol

Every 60 seconds of GM speech, check for engagement:

```
IF: No player input for 60 seconds
AND: Not waiting for obvious decision
THEN: "The dream shimmers. Still with us, adventurers?"

IF: No response in 10 more seconds
THEN: Auto-pause, "Session paused. Say 'resume' when ready."
```

## Mode Switching

### Driving Mode (Default)

- Enabled: App launch while phone moving OR manual toggle
- Constraints: Full driving-safe UX enforced
- UI: Minimal (single pulsing indicator, no text)
- Input: Voice only

### Parked Mode (Post-MVP Enhancement)

- Enabled: Vehicle stopped for 30+ seconds OR manual toggle
- Constraints: Relaxed but not abandoned
- UI: Optional visual enhancements (character portraits, map)
- Input: Voice primary, touch supplementary

### Mode Detection

```typescript
interface MotionState {
  isMoving: boolean;
  speedEstimate: "stationary" | "slow" | "driving";
  confidence: number;
}

// Sources:
// - GPS speed (if permitted)
// - Accelerometer patterns
// - Explicit user toggle

// Conservative default: Assume driving unless clearly stationary
```

## Accessibility

### Voice Output Requirements

| Requirement | Implementation |
|-------------|----------------|
| Speed adjustment | 0.75x - 1.5x TTS speed |
| Volume normalization | Consistent levels across all audio |
| Clear diction | TTS voice optimized for clarity |
| Contrast (hearing impaired) | No whispering, no background noise |

### Voice Input Requirements

| Requirement | Implementation |
|-------------|----------------|
| Noise tolerance | Car noise filtering in VAD/STT |
| Accent tolerance | Whisper model handles accents |
| Repeat option | "Repeat" command always available |
| Confirmation | Critical actions confirmed verbally |

## Anti-Patterns (Never Do These)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FORBIDDEN PATTERNS                                   │
│                                                                         │
│  ❌ "Look at the map on your screen"                                   │
│  ❌ "Tap to confirm your choice"                                       │
│  ❌ "You have 10 seconds to decide!"                                   │
│  ❌ "Read the scroll to learn the spell" [implies reading]             │
│  ❌ "The symbols are: triangle, circle, square, star, moon..."         │
│  ❌ [Sudden loud sound effect]                                         │
│  ❌ "Shake your phone to cast the spell"                               │
│  ❌ "Quick, before the timer runs out!"                                │
│  ❌ Multiple simultaneous speakers in TTS                               │
│  ❌ Narration over 45 seconds                                          │
│  ❌ Requiring response during navigation prompt                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Driving Mode GM Policy

### Policy Constraints (Machine-Checkable)

These constraints are enforced in code. The LLM system prompt includes them, and output is validated.

```typescript
// DRIVING_MODE_POLICY - must be unit testable
const DRIVING_POLICY = {
  // Narration limits
  MAX_NARRATION_SECONDS: 12,
  MAX_NARRATION_WORDS: 60,

  // Choice limits
  MAX_CHOICES: 2,  // Plus implicit "repeat" and "pause"
  CHOICE_FORMAT: "simple",  // "one" or "two", not A/B/C

  // Forbidden content
  FORBIDDEN_PATTERNS: [
    /spell.*these.*words/i,
    /choose.*from.*\d+.*options/i,
    /remember.*the.*sequence/i,
    /look.*at.*screen/i,
    /tap|swipe|touch|press.*button/i,
    /timer|countdown|hurry|quick/i,
  ],

  // Memory/recall limits
  MAX_ITEMS_TO_REMEMBER: 0,  // No memory puzzles
  MAX_SEQUENCE_LENGTH: 0,    // No sequences

  // Confirmation behavior
  REQUIRE_CONFIRMATION: false,  // Never "say yes to confirm"

  // Fail-safe
  ON_VIOLATION: "rephrase",  // LLM must rephrase, not send
};
```

### GM System Prompt Additions (Driving Mode)

```
DRIVING MODE ACTIVE - STRICT CONSTRAINTS:

1. NEVER ask player to remember sequences or lists
2. NEVER offer more than 2 choices at once
3. NEVER use numbered options (1/2/3); use "this or that"
4. NEVER require confirmation ("say yes to confirm")
5. NEVER mention screen, touch, or visual elements
6. NEVER create time pressure ("hurry", "quick", "before it's too late")
7. ALWAYS phrase choices as simple alternatives:
   ✓ "Do you fight or flee?"
   ✓ "Left path or right path?"
   ✗ "Choose: 1) fight, 2) flee, 3) negotiate, 4) hide"
8. ALWAYS assume player may be distracted; be forgiving
9. ALWAYS offer "repeat" implicitly (player can always ask)
10. IF uncertain about player intent, make a reasonable choice and narrate it
    (player can undo/redirect on next turn)
```

### Validation Examples

| GM Output | Valid? | Reason |
|-----------|--------|--------|
| "Fight or run?" | ✅ | 2 choices, simple |
| "Pick 1, 2, or 3" | ❌ | >2 choices, numbered |
| "Remember: red, blue, green, red" | ❌ | Memory puzzle |
| "Quick, decide now!" | ❌ | Time pressure |
| "The door opens. A torch-lit hall extends north." | ✅ | Description, no pressure |
| "Say 'yes' to confirm attack" | ❌ | Confirmation required |
| "Theron attacks! The blade strikes true." | ✅ | Action, no confirm |

### Policy Enforcement Flow

```
LLM Response ──> Policy Validator ──> Pass? ──> TTS ──> Player
                      │
                      └──> Fail? ──> Request Rephrase ──> LLM
                                          │
                                          └──> 3 attempts ──> Fallback
                                                              "The mists
                                                               swirl..."
```

---

## Compliance Checklist

Before any feature ships:

- [ ] Can it be used without looking at screen?
- [ ] Can it be used without touching device?
- [ ] Does narration stay under 12 seconds?
- [ ] Are there clear verbal prompts?
- [ ] Does it handle interrupts gracefully?
- [ ] Is there a voice command equivalent?
- [ ] Max 2 choices per decision point?
- [ ] No memory/sequence puzzles?
- [ ] No confirmation dialogs?
- [ ] Has it been tested while driving (safely)?
