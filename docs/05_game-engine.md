# Game Engine & Narrative Model

## Overview

The Dreamweaver game engine maintains authoritative game state, processes player actions through an AI Game Master, and ensures narrative coherence across multiplayer sessions. This document defines the state model, narrative structure, and safety systems.

## State Model

### Entity-Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GAME STATE SCHEMA                               │
│                                                                         │
│  Session                                                                │
│  ├── id: string                                                        │
│  ├── roomCode: string                                                  │
│  ├── status: "lobby" | "playing" | "paused" | "ended"                  │
│  ├── adventure: AdventureRef                                           │
│  ├── currentNode: string                                               │
│  ├── worldFlags: Map<string, any>                                      │
│  ├── turnCount: number                                                 │
│  └── players: Player[]                                                 │
│                                                                         │
│  Player                                                                 │
│  ├── id: string                                                        │
│  ├── connectionStatus: "connected" | "disconnected"                    │
│  └── character: Character | null                                       │
│                                                                         │
│  Character                                                              │
│  ├── name: string                                                      │
│  ├── archetype: "fighter" | "mage" | "rogue"                          │
│  ├── trait: string (freeform descriptor)                               │
│  ├── health: "healthy" | "wounded" | "critical"                        │
│  └── inventory: Item[] (max 5)                                         │
│                                                                         │
│  Item                                                                   │
│  ├── id: string                                                        │
│  ├── name: string                                                      │
│  └── properties: string[] ("weapon", "magical", "consumable")          │
│                                                                         │
│  WorldFlags (examples)                                                  │
│  ├── "door_unlocked": boolean                                          │
│  ├── "guard_bribed": boolean                                           │
│  ├── "dragon_mood": "hostile" | "neutral" | "friendly"                 │
│  └── "visited_tavern": boolean                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STATE UPDATE FLOW                                  │
│                                                                         │
│  Player Action ──> Validate ──> LLM Process ──> State Mutation         │
│       │               │              │               │                  │
│       │               │              │               └──> Broadcast     │
│       │               │              │                                  │
│       │               │              └──> Narration                     │
│       │               │                                                 │
│       │               └──> Reject if invalid                           │
│       │                                                                 │
│       └──> Log for context                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution

When multiple players act simultaneously:

```typescript
// Server processes actions in arrival order
// But LLM sees them as "simultaneous" in prompt
const conflictingActions = [
  { player: "Marcus", action: "I open the door" },
  { player: "Theron", action: "I attack the guard" }
];

// LLM prompt includes both:
// "Marcus reaches for the door handle while Theron draws his sword..."
// LLM determines narrative outcome
// State updates reflect LLM decision
```

## Narrative Structure

### Hybrid Node-Procedural Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ADVENTURE STRUCTURE                                  │
│                                                                         │
│  Adventure                                                              │
│  ├── metadata (title, duration, difficulty)                            │
│  ├── opening (scripted intro narration)                                │
│  ├── nodes: StoryNode[] (key story beats)                              │
│  └── ending_conditions: Condition[]                                     │
│                                                                         │
│  StoryNode                                                              │
│  ├── id: string                                                        │
│  ├── type: "scene" | "encounter" | "puzzle" | "social"                 │
│  ├── description: string (GM context, not read verbatim)               │
│  ├── npcs: NPC[]                                                       │
│  ├── challenges: Challenge[]                                           │
│  ├── transitions: Transition[]                                         │
│  └── freeform_allowed: boolean                                         │
│                                                                         │
│  Transition                                                             │
│  ├── trigger: Condition                                                │
│  ├── target_node: string                                               │
│  └── narration_hint: string                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Example Adventure Snippet

```yaml
# adventures/goblin_cave.yaml
id: goblin_cave
title: "The Goblin's Bargain"
estimated_duration: 30
difficulty: beginner

opening: |
  The road to Millbrook has grown dangerous. Goblins, once mere nuisances,
  have become bold—raiding caravans and kidnapping travelers. The village
  elder has offered a reward to anyone who can end this threat.

nodes:
  - id: cave_entrance
    type: scene
    description: |
      The cave mouth yawns before the party. Crude goblin totems flank
      the entrance. Inside, flickering torchlight suggests activity.
    transitions:
      - trigger: { action_contains: ["enter", "go in", "sneak"] }
        target_node: outer_cavern
      - trigger: { action_contains: ["call out", "shout", "announce"] }
        target_node: goblin_ambush

  - id: outer_cavern
    type: encounter
    description: |
      A large cavern with two goblins playing dice. They haven't noticed
      the party yet. A tunnel leads deeper. A cage holds a human prisoner.
    npcs:
      - id: goblin_guards
        count: 2
        disposition: unaware
      - id: prisoner
        name: "Elara"
        disposition: desperate
    challenges:
      - type: stealth
        difficulty: easy
        success_hint: "Party can position for advantage"
        failure_hint: "Goblins alert, call for reinforcements"
    freeform_allowed: true
```

### Procedural Fill-In

Between nodes, the LLM generates:
- Transitional narration
- Minor encounters (random tables in adventure file)
- NPC dialogue
- Environmental details
- Response to unexpected player actions

**Node = Authored checkpoint. Between nodes = LLM improvisation within guardrails.**

## GM Policy Rules

### Core Directives

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GM POLICY (System Prompt)                            │
│                                                                         │
│  ROLE: You are a Game Master running a voice-based tabletop RPG.       │
│        Your tone is like a HarmonQuest GM: engaging, dramatic,         │
│        occasionally humorous, always fair.                              │
│                                                                         │
│  RULES:                                                                 │
│  1. NEVER require players to look at a screen or use their hands       │
│  2. Keep narration under 30 seconds when read aloud                    │
│  3. Respond to player actions, don't railroad                          │
│  4. Maintain world consistency with adventure context                  │
│  5. Use player character names and traits                              │
│  6. Ask clarifying questions if action is ambiguous                    │
│  7. Handle "impossible" actions gracefully (don't break immersion)     │
│  8. Signal skill checks verbally: "Roll for strength..."               │
│  9. Track inventory changes explicitly                                  │
│  10. Move story forward—avoid stalling                                  │
│                                                                         │
│  SAFETY:                                                                │
│  - Never describe content requiring visual attention                   │
│  - Never encourage physical actions (reaching, grabbing, looking)      │
│  - If player seems distracted, offer to pause                          │
│  - Keep content PG-13 (violence OK, gore/sexual content no)           │
│                                                                         │
│  OUTPUT FORMAT:                                                         │
│  - Short sentences                                                     │
│  - Clear speaker attribution for NPC dialogue                          │
│  - Pause indicators: "..." for dramatic pauses                         │
│  - End with implied or explicit prompt for player action               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Action Processing

```typescript
interface ActionResult {
  narration: string;           // What GM says
  stateChanges: StateChange[]; // World mutations
  challengeRoll?: {            // If skill check needed
    type: string;
    difficulty: number;
    result: "success" | "failure" | "critical";
  };
  nextPrompt?: string;         // Implicit "what do you do?"
}
```

### Challenge System (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SKILL CHECK SYSTEM                                   │
│                                                                         │
│  Archetype Bonuses:                                                     │
│  - Fighter: +2 strength, combat                                        │
│  - Mage: +2 knowledge, magic                                           │
│  - Rogue: +2 stealth, dexterity                                        │
│                                                                         │
│  Difficulty Thresholds (d20 + bonus):                                  │
│  - Easy: 8+                                                            │
│  - Medium: 12+                                                         │
│  - Hard: 16+                                                           │
│  - Very Hard: 20+                                                      │
│                                                                         │
│  Roll is simulated server-side, narrated by GM:                        │
│  "Theron, test your strength... [pause] A solid effort! You succeed." │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Memory Strategy

### Context Window Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM CONTEXT STRUCTURE                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ SYSTEM PROMPT (fixed)                              ~800 tokens  │   │
│  │ GM rules, safety guidelines, output format                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ADVENTURE CONTEXT (fixed per adventure)            ~1000 tokens │   │
│  │ Current node description, NPCs, available transitions           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ WORLD STATE (dynamic)                              ~300 tokens  │   │
│  │ Character summaries, inventory, key world flags                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ CONVERSATION HISTORY (rolling)                     ~2000 tokens │   │
│  │ Last 15-20 turns of player actions + GM responses              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ SESSION SUMMARY (compressed)                       ~500 tokens  │   │
│  │ Key events from earlier in session (if long)                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TOTAL: ~4600 tokens input budget (leaves room for output)             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Short-Term Memory (Within Session)

- Rolling conversation buffer (last 20 turns)
- When buffer exceeds limit, oldest turns summarized and compressed
- Critical events marked and preserved longer

### Campaign Memory (Post-MVP)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CAMPAIGN MEMORY (Future)                             │
│                                                                         │
│  Campaign                                                               │
│  ├── characters: Character[] (persistent)                              │
│  ├── sessions: SessionSummary[]                                        │
│  ├── world_state: Map<string, any> (persistent flags)                  │
│  ├── relationships: NPCRelationship[]                                  │
│  └── quest_log: Quest[]                                                │
│                                                                         │
│  SessionSummary                                                         │
│  ├── date: timestamp                                                   │
│  ├── key_events: string[]                                              │
│  ├── decisions: string[]                                               │
│  └── consequences: string[]                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Anti-Derail Safeguards

### Problem

Players may attempt to:
- Break the fourth wall
- Pursue absurd actions ("I build a nuclear reactor")
- Grief other players
- Bypass story content entirely

### Solutions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DERAIL PREVENTION                                    │
│                                                                         │
│  1. SOFT REDIRECT                                                       │
│     Player: "I fly to the moon"                                        │
│     GM: "You leap mightily into the air... and land gracefully.       │
│          The moon remains distant. What do you actually do?"           │
│                                                                         │
│  2. WORLD CONSISTENCY                                                   │
│     Player: "I pull out my machine gun"                                │
│     GM: "You reach for your belt, but find only your trusty           │
│          sword. No such weapon exists in this realm."                  │
│                                                                         │
│  3. CONSEQUENCE ESCALATION                                              │
│     Player: "I attack the king in his throne room"                     │
│     GM: "Bold. The royal guards immediately surround you.              │
│          Fifty spears point at your throat. Reconsider?"              │
│                                                                         │
│  4. META ACKNOWLEDGMENT (last resort)                                   │
│     Player: "This is stupid, I'm going to break the game"             │
│     GM: "The dreamweaver senses your frustration. Perhaps              │
│          a different path would be more satisfying? What               │
│          would you actually enjoy doing?"                              │
│                                                                         │
│  5. PARTY PROTECTION                                                    │
│     Player A: "I kill Player B's character"                            │
│     GM: "Your blade stops inches from [Name]. A mysterious             │
│          force prevents harm between companions. The curse             │
│          of the dreamweaver binds your fates together."               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Griefing Detection

```typescript
const griefIndicators = [
  "attack party member",
  "steal from party",
  "betray",
  "player vs player",
  "kill [other player name]"
];

// Flag for soft intervention
// Never hard-block, but redirect narratively
```

## Driving Safety Integration

### Hard Rules (Enforced in System Prompt)

```
DRIVING SAFETY RULES (NEVER VIOLATE):

1. Never describe anything requiring visual processing:
   ❌ "You see a map with three paths marked..."
   ✅ "Three paths lie before you: one north, one east, one steep climb west"

2. Never prompt physical interaction:
   ❌ "Tap to select your spell"
   ✅ "Say the name of the spell you wish to cast"

3. Never create urgency requiring attention:
   ❌ "Quick! You have 5 seconds to decide!"
   ✅ "The situation is urgent. What do you do?"

4. Never simulate dangerous sounds:
   ❌ [Loud crash sound effect]
   ✅ "A tremendous crash echoes through the chamber"

5. If player seems distracted, offer pause:
   "You seem thoughtful. Shall we pause the adventure?"
```

### Attention Budget

| Metric | Limit |
|--------|-------|
| Max continuous narration | 30 seconds |
| Min pause between narrations | 3 seconds |
| Max decision points per minute | 2 |
| Required silence check | Every 60 seconds |

### Emergency Handling

```typescript
interface SystemInterrupt {
  type: "phone_call" | "navigation" | "emergency" | "low_battery";
  action: "auto_pause" | "notify_party" | "save_state";
}

// On phone call detection:
// GM: "The mists of dream envelop you... [session paused]"
// State persisted, other players notified
```
