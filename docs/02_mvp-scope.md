# MVP Scope Definition

## In Scope (Must Have for Day 14)

### Core Gameplay
- [x] Single pre-written adventure scenario (30-45 min playtime)
- [x] 2-5 players + AI Game Master
- [x] Simplified character creation via voice (name, class archetype, one trait)
- [x] Basic inventory (3-5 items max, no management UI)
- [x] Theater-of-mind combat (no grid, no minis)
- [x] Binary skill checks (success/fail with narrative flavor)

### Voice & Audio
- [x] Real-time voice chat between all players
- [x] AI narration via TTS interleaved with player voice
- [x] Push-to-talk for player speech (simplifies speaker ID)
- [x] "Hey Dreamweaver" wake word OR always-listening with push-to-talk
- [x] Voice activity detection to avoid talking over players

### Multiplayer
- [x] Room code join system (4-6 character codes)
- [x] Same-room + remote players in single session
- [x] Host player creates session, others join
- [x] Basic presence (who's connected, who's speaking)

### Connectivity & State
- [x] Server-authoritative game state
- [x] Automatic reconnection with state sync
- [x] Graceful handling of 1-10 second network gaps
- [x] Session state persists if host disconnects briefly

### Safety & UX
- [x] No required screen interactions during gameplay
- [x] Short, predictable AI responses (< 30 seconds narration)
- [x] "Pause game" voice command
- [x] "Recap" command for returning players or attention lapses
- [x] Emergency interrupt detection (incoming calls)

## Out of Scope (Post-MVP)

### Deferred Features
- [ ] Persistent campaign saves across sessions
- [ ] Complex character sheets (stats, levels, detailed inventory)
- [ ] Custom adventure creation tools
- [ ] Rich UI mode when parked
- [ ] App store distribution
- [ ] Multiple simultaneous adventures
- [ ] Spectator mode
- [ ] Recording/replay of sessions
- [ ] Achievement system
- [ ] Character artwork generation

### Explicitly Excluded from MVP
- ❌ Browser-based client (native app only)
- ❌ Web dashboard for game management
- ❌ Voice cloning for NPCs
- ❌ Background music/sound effects (adds complexity)
- ❌ Integration with existing RPG systems (D&D, Pathfinder rules)
- ❌ AI-generated adventures (pre-written only)

## MVP User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                      DREAMWEAVER MVP FLOW                       │
└─────────────────────────────────────────────────────────────────┘

1. HOST CREATES SESSION
   └─> Opens app → "Start new adventure" → Gets room code "WYRM42"

2. PLAYERS JOIN
   └─> Opens app → "Join game" → Says "WYRM42" → Connected

3. CHARACTER CREATION (Voice-driven, 60 seconds each)
   └─> GM: "What's your name, adventurer?"
   └─> Player: "I'm Theron"
   └─> GM: "Are you a Fighter, Mage, or Rogue?"
   └─> Player: "Fighter"
   └─> GM: "What's one thing everyone notices about you?"
   └─> Player: "A scar across my left eye"
   └─> GM: "Theron the scarred Fighter. Ready."

4. ADVENTURE BEGINS
   └─> GM narrates opening scene (< 30 sec)
   └─> Players discuss freely (voice chat)
   └─> Any player: "We go north" or "I search the room"
   └─> GM processes, narrates outcome

5. GAMEPLAY LOOP
   ┌──────────────────────────────────────┐
   │  GM Narrates (TTS) ──────────────┐   │
   │         │                        │   │
   │         ▼                        │   │
   │  Players Discuss (live voice)    │   │
   │         │                        │   │
   │         ▼                        │   │
   │  Player States Action ───────────┤   │
   │         │                        │   │
   │         ▼                        │   │
   │  Server Processes + LLM ─────────┘   │
   └──────────────────────────────────────┘

6. SESSION END
   └─> Natural story conclusion OR "End session" command
   └─> Brief summary of adventure
   └─> Session ends (no save in MVP)
```

## MVP Feature Matrix

| Feature | Priority | Complexity | Day Target |
|---------|----------|------------|------------|
| Voice chat infrastructure | P0 | High | Day 1-3 |
| Room join system | P0 | Medium | Day 2 |
| Push-to-talk + speaker ID | P0 | Medium | Day 3 |
| LLM integration (GM brain) | P0 | Medium | Day 3-4 |
| TTS narration | P0 | Low | Day 4 |
| Game state machine | P0 | High | Day 4-5 |
| Pre-written adventure | P0 | Medium | Day 5-6 |
| Reconnection logic | P0 | High | Day 6-7 |
| Basic mobile app shell | P0 | Medium | Day 1-2 |
| Voice commands (pause/recap) | P1 | Low | Day 8 |
| Character creation flow | P1 | Medium | Day 8-9 |
| Playtesting & polish | P1 | - | Day 10-14 |

## Technical Boundaries

### Performance Budgets
- App cold start: < 5 seconds
- Join room: < 3 seconds
- Voice-to-AI-response: < 2 seconds (p95)
- TTS generation: < 1 second for 30 words
- State sync on reconnect: < 2 seconds

### Resource Limits
- Max concurrent sessions per server: 10
- Max players per session: 5
- Max session duration: 2 hours
- Max adventure script size: 50KB
- Max chat history in context: 20 turns
