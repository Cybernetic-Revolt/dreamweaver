# Acceptance Tests

## Overview

This document defines acceptance criteria for Dreamweaver MVP. Each test must pass before the feature is considered complete.

## Test Categories

1. **Voice Infrastructure** - Voice chat and AI interaction
2. **Session Management** - Creating, joining, managing games
3. **Game Engine** - State, rules, narrative
4. **Driving Safety** - Eyes-free, hands-free compliance
5. **Reliability** - Reconnection, error handling
6. **End-to-End** - Full user journeys

---

## 1. Voice Infrastructure Tests

### V1: Basic Voice Connection

**Preconditions:** Two clients connected to same session

**Steps:**
1. Client A holds PTT button
2. Client A speaks "Testing one two three"
3. Client A releases PTT

**Expected:**
- [ ] Client B hears "Testing one two three" clearly
- [ ] Latency < 500ms (perceptible delay acceptable)
- [ ] No echo or feedback
- [ ] Audio quality is intelligible

---

### V2: Multi-Party Voice

**Preconditions:** Three clients connected to same session

**Steps:**
1. Client A speaks "Message from A"
2. Client B speaks "Message from B"
3. Client C speaks "Message from C"

**Expected:**
- [ ] All clients hear all messages
- [ ] Speaker attribution correct (UI shows who's speaking)
- [ ] No message lost or garbled

---

### V3: Speech-to-Text Accuracy

**Preconditions:** Session active, STT service running

**Steps:**
1. Player says "I search the room for treasure"
2. Check STT transcript

**Expected:**
- [ ] Transcript matches intent (minor word variations OK)
- [ ] Processing time < 1 second
- [ ] Non-English accent (moderate) still transcribed correctly

---

### V4: AI Voice Response

**Preconditions:** Session in playing state, AI services running

**Steps:**
1. Player says "I look around"
2. Wait for AI response

**Expected:**
- [ ] AI responds with scene description
- [ ] Response is audible TTS, not just text
- [ ] Total latency < 3 seconds (speech end to audio start)
- [ ] Response is contextually appropriate

---

### V5: Voice Activity Detection

**Preconditions:** AI is speaking (narrating)

**Steps:**
1. AI begins narrating
2. Player interrupts by speaking

**Expected:**
- [ ] AI audio stops within 500ms
- [ ] AI acknowledges interruption OR resumes appropriately
- [ ] No overlapping audio

---

## 2. Session Management Tests

### S1: Create Session

**Preconditions:** App launched, connected to server

**Steps:**
1. User says "Start new game" or taps create button

**Expected:**
- [ ] Room code generated (6 characters)
- [ ] Room code announced via TTS
- [ ] User is host of session
- [ ] Session appears in server state

---

### S2: Join Session

**Preconditions:** Session exists with code "ABC123"

**Steps:**
1. User says "Join game"
2. System prompts for code
3. User says "A B C 1 2 3"

**Expected:**
- [ ] User joins session
- [ ] Host notified of new player
- [ ] Both see same player list
- [ ] Voice channel established

---

### S3: Invalid Room Code

**Preconditions:** No session with code "XYZ999"

**Steps:**
1. User tries to join "XYZ999"

**Expected:**
- [ ] Error message: "Room not found"
- [ ] User can retry with different code
- [ ] No crash or hang

---

### S4: Session Full

**Preconditions:** Session at max capacity (5 players)

**Steps:**
1. 6th player tries to join

**Expected:**
- [ ] Error message: "Session is full"
- [ ] 6th player not added
- [ ] Existing session unaffected

---

### S5: Host Disconnect

**Preconditions:** Session with 3 players, host is Player 1

**Steps:**
1. Host disconnects (app close)
2. Wait 60 seconds

**Expected:**
- [ ] Other players notified
- [ ] Session remains active (host migration not required for MVP)
- [ ] Host can reconnect within 60s
- [ ] If host doesn't return, session eventually ends gracefully

---

## 3. Game Engine Tests

### G1: Character Creation

**Preconditions:** Session in lobby, 2 players

**Steps:**
1. Host starts game
2. AI prompts first player for name
3. Player says "My name is Theron"
4. AI prompts for class
5. Player says "Fighter"
6. AI prompts for trait
7. Player says "A scar across my eye"
8. Repeat for second player

**Expected:**
- [ ] Both characters created with correct data
- [ ] AI acknowledges each character
- [ ] Characters stored in game state
- [ ] Game proceeds to adventure

---

### G2: Basic Action Processing

**Preconditions:** Game in progress at cave entrance

**Steps:**
1. Player says "I enter the cave"

**Expected:**
- [ ] AI describes entering cave
- [ ] Game state updates (location/node)
- [ ] New scene is contextually appropriate
- [ ] Other players hear the narration

---

### G3: Inventory Management

**Preconditions:** Player has "rusty sword" in inventory

**Steps:**
1. Player says "What do I have?"
2. Later, player finds "gold key"
3. Player says "I take the key"

**Expected:**
- [ ] AI lists "rusty sword"
- [ ] AI describes finding key
- [ ] Key added to inventory
- [ ] Subsequent "What do I have?" shows both items

---

### G4: Skill Check

**Preconditions:** Player at locked door, has lockpick

**Steps:**
1. Player says "I pick the lock"

**Expected:**
- [ ] AI announces skill check
- [ ] Result (success/failure) determined
- [ ] Outcome narrated appropriately
- [ ] State reflects outcome (door unlocked or not)

---

### G5: World Flag Persistence

**Preconditions:** Game in progress

**Steps:**
1. Player bribes guard (sets "guard_bribed" flag)
2. Player leaves area
3. Player returns to same area

**Expected:**
- [ ] Guard remembers bribe
- [ ] AI references prior interaction
- [ ] Flag persists across turns

---

### G6: Multi-Player Coordination

**Preconditions:** 3 players in game

**Steps:**
1. Player A says "I'll distract the guard"
2. Player B says "I'll sneak past"
3. Player C says "I'll watch for trouble"

**Expected:**
- [ ] AI incorporates all three actions
- [ ] Narration references all characters
- [ ] Reasonable outcome based on combined actions
- [ ] State consistent for all players

---

## 4. Driving Safety Tests

### D1: Eyes-Free Verification

**Preconditions:** Full game session

**Steps:**
1. Play complete session with screen off/face down

**Expected:**
- [ ] All actions completable via voice
- [ ] No information missed
- [ ] No prompts to look at screen

---

### D2: Hands-Free Verification

**Preconditions:** Phone mounted, PTT via Bluetooth button or earbud

**Steps:**
1. Play complete session without touching phone

**Expected:**
- [ ] All actions completable
- [ ] PTT works via external button
- [ ] No prompts to tap screen

---

### D3: Navigation Interrupt

**Preconditions:** Game in progress, navigation running

**Steps:**
1. Navigation announces "Turn right in 500 feet"

**Expected:**
- [ ] Game audio ducks or pauses
- [ ] Navigation clearly audible
- [ ] Game resumes automatically
- [ ] No state lost

---

### D4: Phone Call Interrupt

**Preconditions:** Game in progress

**Steps:**
1. Incoming phone call

**Expected:**
- [ ] Game auto-pauses
- [ ] Other players notified
- [ ] After call, easy to resume
- [ ] State preserved

---

### D5: Narration Length Compliance

**Preconditions:** Game in progress

**Steps:**
1. Monitor all AI narrations for 30 minutes

**Expected:**
- [ ] No single narration exceeds 30 seconds
- [ ] Natural pause points in longer content
- [ ] Player can interrupt at any point

---

### D6: Attention Check

**Preconditions:** Game in progress, no player input for 60 seconds

**Steps:**
1. Wait silently for 60+ seconds

**Expected:**
- [ ] AI prompts "Still with us?"
- [ ] If no response, auto-pause
- [ ] Easy to resume with "Continue"

---

## 5. Reliability Tests

### R1: Clean Disconnect/Reconnect

**Preconditions:** Player in active session

**Steps:**
1. Toggle airplane mode on
2. Wait 5 seconds
3. Toggle airplane mode off

**Expected:**
- [ ] Client attempts reconnection automatically
- [ ] Reconnection succeeds within 15 seconds
- [ ] State synchronized correctly
- [ ] Voice channel restored
- [ ] Other players notified

---

### R2: Extended Disconnect

**Preconditions:** Player in active session

**Steps:**
1. Disconnect for 30 seconds
2. Reconnect

**Expected:**
- [ ] Player slot still held
- [ ] Reconnection succeeds
- [ ] AI provides brief recap of missed content
- [ ] Game continues normally

---

### R3: Disconnect Beyond Timeout

**Preconditions:** Player in active session

**Steps:**
1. Disconnect for 90 seconds (beyond 60s timeout)
2. Try to reconnect

**Expected:**
- [ ] Player removed from session
- [ ] Other players notified player left
- [ ] Reconnecting player sees "Session no longer available" or can rejoin as new player

---

### R4: Server Restart Recovery

**Preconditions:** Active session with Redis persistence

**Steps:**
1. Force restart server process
2. Clients attempt to reconnect

**Expected:**
- [ ] Server comes back online
- [ ] Session state recovered from Redis
- [ ] Clients can reconnect
- [ ] Game can continue

---

### R5: AI Service Timeout

**Preconditions:** Game in progress

**Steps:**
1. Make LLM service unresponsive (simulate)
2. Player takes action

**Expected:**
- [ ] Timeout after 10 seconds
- [ ] Fallback response: "The mists swirl... give me a moment"
- [ ] Retry occurs
- [ ] If retry fails, graceful error message
- [ ] Game doesn't crash

---

### R6: TTS Service Failure

**Preconditions:** Game in progress

**Steps:**
1. Make TTS service unresponsive
2. AI generates response

**Expected:**
- [ ] Text response still delivered (as text if no audio)
- [ ] Or text-to-speech fallback (system TTS)
- [ ] Game continues
- [ ] No crash

---

## 6. End-to-End Tests

### E2E1: Complete Game Session

**Preconditions:** All services running

**Steps:**
1. Host creates session
2. Two players join
3. All create characters
4. Play through "Goblin's Bargain" adventure (25-40 min)
5. Reach ending
6. Session ends

**Expected:**
- [ ] No crashes throughout
- [ ] Story coherent
- [ ] All players synced
- [ ] Ending reached
- [ ] Session cleanup successful

**Duration:** ~45 minutes

---

### E2E2: Interrupted Session Recovery

**Preconditions:** All services running

**Steps:**
1. Start session with 2 players
2. Play for 10 minutes
3. One player disconnects
4. Other player continues briefly
5. Disconnected player returns
6. Continue play
7. Both disconnect simultaneously
8. Both reconnect
9. Continue to completion

**Expected:**
- [ ] All reconnections successful
- [ ] State consistent after each recovery
- [ ] No duplicate events
- [ ] Reach satisfactory conclusion

---

### E2E3: Driving Simulation Test

**Preconditions:** All services running, phone mounted

**Steps:**
1. Mount phone in car mount
2. Use Bluetooth earbuds with PTT
3. Play complete session
4. Monitor for any:
   - Urge to look at screen
   - Need to touch phone
   - Confusing audio

**Expected:**
- [ ] Zero screen looks required
- [ ] Zero phone touches required
- [ ] All interactions clear via audio
- [ ] Test could be done while actually driving (test in parked car)

---

### E2E4: Poor Network Simulation

**Preconditions:** All services running, network throttled to 3G (500kbps)

**Steps:**
1. Create and join session over throttled network
2. Play for 15 minutes
3. Introduce packet loss (10%)
4. Continue play

**Expected:**
- [ ] Voice quality degrades gracefully
- [ ] AI responses still arrive (maybe slower)
- [ ] No hard failures
- [ ] State remains consistent

---

## Test Execution Checklist

### Pre-Sprint (Day 0)
- [ ] Test environments set up
- [ ] Test devices available (2+ phones)
- [ ] Network simulation tools ready

### During Sprint

| Day | Tests to Run |
|-----|--------------|
| 3 | V1, V2, S1, S2 |
| 5 | V3, V4, V5 |
| 7 | All V*, S*, G1, G2 |
| 9 | G3, G4, G5, G6 |
| 10 | D1, D2, D5 |
| 12 | All R*, D3, D4, D6 |
| 13 | E2E1 |
| 14 | E2E2, E2E3, E2E4 |

### MVP Release Gate

All tests must pass:
- [ ] V1-V5: Voice infrastructure
- [ ] S1-S5: Session management
- [ ] G1-G6: Game engine
- [ ] D1-D6: Driving safety
- [ ] R1-R6: Reliability
- [ ] E2E1: Complete session
- [ ] E2E2: Recovery
- [ ] E2E3: Driving simulation

---

## Day 5: Universal Commands

### U1: Repeat Replays Last Narration

**Preconditions:** Game in progress, previous narration played

**Steps:**
1. Player says "look around" (gets narration)
2. Player says "repeat"

**Expected:**
- [ ] Exact same narration text replayed
- [ ] Choices match original
- [ ] No state change from repeat
- [ ] Response within normal latency

---

### U2: Stop Interrupts Narration

**Preconditions:** AI narration playing

**Steps:**
1. AI begins narrating
2. Player says "stop"

**Expected:**
- [ ] Narration stops within 250ms
- [ ] AI says "Okay."
- [ ] Quiet mode activated for 60 seconds
- [ ] NARRATION_INTERRUPT event logged

---

### U3: Help Returns Command List

**Preconditions:** Game in progress

**Steps:**
1. Player says "help"

**Expected:**
- [ ] AI lists available commands
- [ ] Response is single narration (< 12 seconds)
- [ ] Includes: look, go, take, talk, inventory, status, repeat, stop
- [ ] 2 choices max in response

---

### U4: Inventory Stays Under 12 Seconds

**Preconditions:** Player has 10+ items in inventory

**Steps:**
1. Player says "inventory"

**Expected:**
- [ ] Narration lists items (up to 5)
- [ ] Remaining count mentioned if > 5 items
- [ ] Total narration < 12 seconds
- [ ] No truncation artifacts

---

### U5: Unknown Intent Gets 2 Choices

**Preconditions:** Game in progress

**Steps:**
1. Player says "xyzzy flurble nonsense"

**Expected:**
- [ ] AI responds with "I didn't understand that."
- [ ] Exactly 2 choices offered (help, look)
- [ ] No lecture about valid commands
- [ ] Latency similar to valid commands

---

### U6: Status Shows Current State

**Preconditions:** Game in progress at forest clearing, 2 items in inventory

**Steps:**
1. Player says "status"

**Expected:**
- [ ] Location name mentioned
- [ ] Current quest step mentioned
- [ ] Item count mentioned
- [ ] Response under 12 seconds

---

## Day 7: Productization Tests

### P1: Quick Join Connects Fast

**Preconditions:** App launched, no previous session

**Steps:**
1. Tap "Quick Join" button

**Expected:**
- [ ] Connection established < 5 seconds
- [ ] Room name auto-generated (campaign-{deviceId})
- [ ] No typing required
- [ ] Mic published automatically

---

### P2: Reserved STOP Button Works

**Preconditions:** Connected, narration playing

**Steps:**
1. Tap STOP button during narration

**Expected:**
- [ ] Narration stops within 500ms
- [ ] Button response immediate
- [ ] No STT involved (deterministic)
- [ ] Quiet mode activated

---

### P3: Reserved REPEAT Button Works

**Preconditions:** Connected, previous narration completed

**Steps:**
1. Tap REPEAT button

**Expected:**
- [ ] Last narration replays
- [ ] Same text/content as before
- [ ] No STT involved (deterministic)
- [ ] Response time consistent

---

### P4: Reserved HELP Button Works

**Preconditions:** Connected to session

**Steps:**
1. Tap HELP button

**Expected:**
- [ ] Help narration plays
- [ ] Lists available commands
- [ ] No STT involved (deterministic)
- [ ] Response within 2 seconds

---

### P5: Reconnect Recovery Works

**Preconditions:** Connected, PTT working

**Steps:**
1. Enable airplane mode
2. Wait 10 seconds
3. Disable airplane mode

**Expected:**
- [ ] App shows "Reconnecting..." state
- [ ] Reconnection within 15 seconds
- [ ] PTT works immediately after reconnect
- [ ] Mic republished if needed
- [ ] No stuck PTT state

---

### P6: Narrations Never Overlap

**Preconditions:** Connected, fast command input

**Steps:**
1. Say "look around"
2. Immediately say "help" while first narration starts

**Expected:**
- [ ] First narration interrupted cleanly
- [ ] Second narration plays
- [ ] No overlapping audio
- [ ] No audio piling up

---

### P7: Debug Line Updates

**Preconditions:** App running

**Steps:**
1. Observe debug line at bottom
2. Connect to room
3. Start/stop PTT
4. Receive narration

**Expected:**
- [ ] Connection state updates
- [ ] mic:Y shows after connect
- [ ] ptt:Y shows during PTT
- [ ] narr:{id} shows after narration

---

## Bug Severity Classification

| Severity | Definition | Action |
|----------|------------|--------|
| **P0** | Crash, data loss, safety issue | Block release, fix immediately |
| **P1** | Core feature broken | Fix before release |
| **P2** | Feature works but degraded | Fix if time permits |
| **P3** | Minor issue, workaround exists | Defer to post-MVP |
| **P4** | Polish, nice-to-have | Backlog |

---

## Regression Test Suite

After MVP launch, run full test suite on:
- Every deployment
- Major dependency update
- New feature addition

Automated tests (stretch goal):
- V1, V2 (WebRTC connection)
- S1-S4 (API endpoints)
- R4, R5, R6 (service failures)
