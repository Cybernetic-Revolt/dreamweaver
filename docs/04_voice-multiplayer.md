# Voice & Multiplayer Design

## Overview

Dreamweaver's core experience is a real-time voice "call" where players talk naturally while an AI Game Master narrates the adventure. This document specifies how voice flows between participants and how AI narration interleaves with live conversation.

---

## Explicit MVP Decisions (Non-Negotiable)

### Decision 1: LiveKit for SFU
**Choice:** LiveKit Cloud (free tier) for MVP, self-hosted LiveKit for production.

**Why:** Production-ready SFU with React Native SDK. Free tier supports 100 monthly active users. Handles WebRTC complexity, TURN, echo cancellation. Alternative (mediasoup) would cost 3+ days of setup alone.

### Decision 2: Hybrid Voice Model
**Choice:** Open-mic for social chat + Push-to-talk for game commands.

| Mode | When | How |
|------|------|-----|
| **Open-mic** | Default state | Players chat freely, LiveKit handles all audio |
| **PTT command** | Player holds button | Audio routed to STT for game action processing |

**Why:** Solves "who is talking" without diarization. Social chat doesn't need attribution. Only game commands (actions, choices) need speaker ID, and PTT gives us that with 100% accuracy.

### Decision 3: AI Narration as Separate Track
**Choice:** Server publishes GM narration as dedicated LiveKit audio track. Clients apply local ducking.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI NARRATION INJECTION                               │
│                                                                         │
│  Server                         LiveKit                    Clients      │
│    │                               │                          │         │
│    │── Publish "gm-narrator" ─────>│                          │         │
│    │   track with TTS audio        │── Distribute track ─────>│         │
│    │                               │                          │         │
│    │                               │   Client-side logic:     │         │
│    │                               │   - Duck GM 80% when     │         │
│    │                               │     local PTT active     │         │
│    │                               │   - Pause TTS on any     │         │
│    │                               │     player interrupt     │         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why:** Clean separation. GM audio is just another track—LiveKit handles distribution. Client-side ducking is simple gain adjustment.

### Decision 4: Command Detection via PTT Button
**Choice:** Client button (screen tap, earbud tap, Bluetooth button) starts command capture. No always-on diarization.

**Flow:**
1. Player holds PTT button
2. Client captures audio chunk
3. Audio sent to server
4. Server runs STT → action text
5. Action processed by game engine

**Why:** Always-on diarization is too expensive (compute, battery) and too inaccurate (70-85%) for MVP. PTT is simple, accurate, driving-safe.

---

## Command Capture Arbitration Rules

### PTT Command Stream Specification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMMAND CAPTURE RULES (DETERMINISTIC)                │
│                                                                         │
│  RULE 1: Command mode is PTT-only                                       │
│  • No wake word, no voice activation                                   │
│  • PTT = press and hold physical/virtual button                        │
│  • Wake word deferred to post-MVP                                      │
│                                                                         │
│  RULE 2: PTT creates dedicated audio stream                            │
│  • Client publishes separate "ptt" track to LiveKit                    │
│  • Only PTT track is fed to STT                                        │
│  • Open-mic track is NEVER transcribed                                 │
│                                                                         │
│  RULE 3: Command window hard stop                                       │
│  • Max capture: 5 seconds                                              │
│  • After 5s, PTT auto-releases                                         │
│  • Trailing chatter after release: ignored                             │
│                                                                         │
│  RULE 4: Barge-in precedence                                            │
│  • PTT stream ALWAYS wins over narration                               │
│  • Narration pauses within 100ms of PTT start                          │
│  • No audio overlap between PTT and narration                          │
│                                                                         │
│  RULE 5: One PTT at a time per session                                  │
│  • If Player A holds PTT, Player B's PTT queued                        │
│  • Queue timeout: 10 seconds                                           │
│  • Prevents crosstalk in command stream                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Priority Order (Highest First)

| Priority | Source | Action |
|----------|--------|--------|
| 1 | Any PTT active | Mute narration, capture command |
| 2 | "Stop" command detected | Kill narration, no resume |
| 3 | Phone call / nav interrupt | Pause session |
| 4 | Narration playing | Duck open-mic slightly |
| 5 | Open-mic chat | Normal volume, no transcription |

### Timeouts

| Event | Timeout | Behavior |
|-------|---------|----------|
| PTT held | 5 seconds max | Auto-release, submit to STT |
| PTT queued | 10 seconds | Drop from queue, notify player |
| No PTT after prompt | 30 seconds | GM prompts "still with us?" |
| No response to prompt | 10 seconds | Auto-pause session |

---

## Audio Ducking Specification

### Ducking Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Duck target | -12 dB | Applied to non-priority tracks |
| Attack time | 50 ms | How fast ducking applies |
| Release time | 300 ms | How fast ducking releases |
| Narration volume | 0 dB | Full volume when speaking |
| Open-mic during narration | -6 dB | Slight duck, still audible |

### Ducking State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUDIO STATE MACHINE (6 States)                       │
│                                                                         │
│                         ┌─────────────┐                                 │
│               ┌────────>│    IDLE     │<────────┐                       │
│               │         │ (silence)   │         │                       │
│               │         └──────┬──────┘         │                       │
│               │                │                │                       │
│               │    chat starts │ narration      │ all done              │
│               │                │ ready          │                       │
│               │                ▼                │                       │
│               │         ┌──────┴──────┐         │                       │
│               │    ┌────│    CHAT     │────┐    │                       │
│               │    │    │ (open mic)  │    │    │                       │
│               │    │    └─────────────┘    │    │                       │
│               │    │                       │    │                       │
│               │    │ PTT              narrate   │                       │
│               │    │ pressed         starts     │                       │
│               │    ▼                       ▼    │                       │
│         ┌─────┴────────┐           ┌───────────┴┐                       │
│         │ PTT-COMMAND  │           │  NARRATING │                       │
│         │ (capturing)  │           │ (GM audio) │                       │
│         └──────┬───────┘           └─────┬──────┘                       │
│                │                         │                              │
│                │ PTT ends                │ PTT pressed                  │
│                │                         │ or "stop"                    │
│                ▼                         ▼                              │
│         ┌──────────────┐           ┌─────────────┐                      │
│         │  PROCESSING  │           │ INTERRUPTED │                      │
│         │  (STT+LLM)   │           │ (cut audio) │                      │
│         └──────┬───────┘           └──────┬──────┘                      │
│                │                          │                             │
│                │ response ready           │ 500ms                       │
│                └─────────────┬────────────┘                             │
│                              ▼                                          │
│                       ┌─────────────┐                                   │
│                       │ RECOVERING  │                                   │
│                       │ (fade back) │                                   │
│                       └──────┬──────┘                                   │
│                              │ 300ms release                            │
│                              └──────> (back to IDLE or NARRATING)       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Transitions

| From | To | Trigger | Audio Action |
|------|-----|---------|--------------|
| IDLE | CHAT | Any open-mic activity | None |
| IDLE | NARRATING | GM response ready | Play GM track |
| CHAT | PTT-COMMAND | PTT pressed | Duck all, capture |
| CHAT | NARRATING | GM response ready | Duck chat -6dB |
| NARRATING | INTERRUPTED | PTT or "stop" | Hard mute GM in 50ms |
| PTT-COMMAND | PROCESSING | PTT released | Submit audio |
| PROCESSING | NARRATING | LLM+TTS done | Play response |
| INTERRUPTED | RECOVERING | 500ms | Prepare resume |
| RECOVERING | IDLE/NARRATING | 300ms | Fade volumes back |

---

## Speaker Attribution (MVP Scope)

### Attribution Rules

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ATTRIBUTION SCOPE (MVP)                              │
│                                                                         │
│  COMMAND ATTRIBUTION: ✅ Required, 100% accurate                        │
│  • Source: Authenticated participant identity from LiveKit token       │
│  • When: Whoever held PTT when audio captured                          │
│  • Result: COMMAND_RECEIVED(identity, text, timestamp)                 │
│                                                                         │
│  OPEN-MIC ATTRIBUTION: ❌ Deferred (optional, best-effort)             │
│  • No diarization for MVP                                              │
│  • Social chat doesn't need "who said what"                            │
│  • Post-MVP: add speaker labels for transcript/replay                  │
│                                                                         │
│  WHY: Diarization is 70-85% accurate, too unreliable for commands.     │
│       PTT gives 100% accuracy with zero ML overhead.                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How the "Call" Works

### Architecture (LiveKit-Based)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VOICE TOPOLOGY: LiveKit SFU                     │
│                                                                         │
│     Player A ─────┐                          ┌───── Player C            │
│     (speaking)    │                          │      (listening)         │
│                   ▼                          │                          │
│              ┌─────────────────────────┐     │                          │
│              │      LiveKit Server     │     │                          │
│              │    (Cloud or Self-Host) │◄────┘                          │
│              │                         │                                │
│              │  • Receives all streams │                                │
│              │  • Forwards selectively │                                │
│              │  • Sub-100ms latency    │                                │
│              │  • Built-in echo cancel │                                │
│              └───────────┬─────────────┘                                │
│                          │                                              │
│     Player B ◄───────────┤                                              │
│     (listening)          │                                              │
│                          │                                              │
│     Dreamweaver Server ──┴──> Publishes "gm-narrator" audio track       │
│     (hidden participant)                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Connection Flow (LiveKit)

```
1. Host creates session
   └─> Server creates game session + LiveKit room (same room code)
   └─> Server returns room code + LiveKit access token

2. Players join
   └─> Client sends room code to game server
   └─> Server validates, returns LiveKit access token
   └─> Client connects to LiveKit with token
   └─> Audio flows established automatically

3. Voice channel open
   └─> All participants hear each other (LiveKit handles)
   └─> Server joins as hidden participant
   └─> Server publishes "gm-narrator" audio track
   └─> Server subscribes to player tracks for STT

4. Command flow (PTT)
   └─> Player holds PTT button
   └─> Client sends audio to game server (separate from LiveKit)
   └─> Server runs STT → game action
   └─> Server generates response → TTS → publishes to GM track
```

### Protocol Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Transport | WebRTC DataChannel + MediaStream | Low-latency bidirectional |
| Signaling | WebSocket | Session setup, game state |
| Audio Codec | Opus | Optimized for voice |
| Encryption | DTLS-SRTP | End-to-end media encryption |

## AI Narration Interleaving

### The Challenge

AI narration must blend naturally with player conversation without:
- Talking over players
- Creating awkward silences
- Missing player input during narration

### Solution: Voice Activity Detection + Queuing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NARRATION STATE MACHINE                              │
│                                                                         │
│  ┌──────────┐    player speaks    ┌──────────┐                         │
│  │  IDLE    │ ──────────────────> │ LISTENING│                         │
│  │          │ <────────────────── │          │                         │
│  └────┬─────┘    2s silence       └──────────┘                         │
│       │                                                                 │
│       │ narration ready                                                 │
│       ▼                                                                 │
│  ┌──────────┐    player speaks    ┌──────────┐                         │
│  │NARRATING │ ──────────────────> │  PAUSED  │                         │
│  │          │ <────────────────── │          │                         │
│  └──────────┘    1s silence       └──────────┘                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interleaving Rules

1. **AI waits for silence** - Narration only starts after 2 seconds of no player speech
2. **Players can interrupt** - Any player voice pauses narration within 200ms
3. **Smart resume** - After interruption, AI either:
   - Resumes from pause point (if interruption was brief exclamation)
   - Acknowledges interruption (if player asked question)
4. **Chunked narration** - Long narration split into 15-second segments with natural pause points

### Timing Budget

| Event | Max Latency |
|-------|-------------|
| Player stops speaking → AI starts | 2000ms |
| Player interrupts → AI stops | 200ms |
| AI narration chunk | ≤15 seconds |
| Silence between chunks | 500ms |

## Handling Crosstalk

### Problem

Multiple players speaking simultaneously creates:
- Garbled audio
- Failed STT transcription
- Confused AI context

### Solution: Turn Indicator + Soft Enforcement

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CROSSTALK HANDLING                                   │
│                                                                         │
│  1. Detect crosstalk (>1 speaker for >500ms)                           │
│                                                                         │
│  2. AI gently intervenes:                                               │
│     "I heard multiple voices - Theron, what were you saying?"          │
│                                                                         │
│  3. Visual indicator (optional UI):                                     │
│     [🎤 Speaking: Marcus]  [⏳ Waiting: Theron, Luna]                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### MVP Approach: Accept Some Crosstalk

For MVP, we:
- Allow natural crosstalk (like real conversation)
- STT processes loudest speaker
- AI asks for clarification if transcript unclear
- No hard turn enforcement

Post-MVP enhancement: Optional "formal turns" mode for cleaner play.

## Turn System: Freeform (MVP Decision)

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Strict turns** | Clean audio, clear attribution | Unnatural, slow, frustrating |
| **Push-to-talk turns** | Clear speaker ID | Button fatigue, breaks immersion |
| **Freeform + moderation** | Natural conversation | Crosstalk, harder attribution |
| **Freeform + PTT** | Natural with clear boundaries | Balance of control/freedom |

### MVP Choice: Freeform with Push-to-Talk

**Justification:**
1. Push-to-talk solves speaker identification (critical for driving safety - no hand movements except initial button hold)
2. But within PTT, players speak naturally (not waiting for "your turn")
3. AI moderates if needed ("One at a time, adventurers")
4. Matches HarmonQuest style (natural but hosted)

**Implementation:**
- Player holds button (or uses voice activation phrase) to speak
- Multiple players CAN hold simultaneously (crosstalk allowed)
- AI attributes speech to whoever is holding button
- Works on steering wheel button, earbuds tap, or screen hold

## Speaker Identification

### Options Analyzed

#### Option A: Push-to-Talk + Identity
```
Player holds button → Server knows who's speaking → Direct attribution
```
- **Accuracy:** 100%
- **Complexity:** Low
- **UX Impact:** Requires conscious action

#### Option B: Always-on + Diarization
```
Audio stream → ML diarization model → Identify speaker segments
```
- **Accuracy:** 70-85% (degrades with crosstalk)
- **Complexity:** High (needs speaker enrollment, ML inference)
- **UX Impact:** Seamless but error-prone

#### Option C: Hybrid
```
Default: Always-on with diarization
Fallback: PTT when uncertain
```
- **Accuracy:** 85-95%
- **Complexity:** Very High
- **UX Impact:** Best of both, but complex

### MVP Choice: Option A (Push-to-Talk + Identity)

**Justification:**
1. **100% accuracy** - Critical for game logic ("Marcus attacks" vs "Theron attacks")
2. **Simple to implement** - No ML models, no enrollment
3. **Driving safe** - Single steering wheel button or earbud tap
4. **Low latency** - No diarization processing delay
5. **Battery friendly** - No always-on ML inference on mobile

**Post-MVP upgrade path:**
- Add voice enrollment during character creation
- Use diarization for passive listening (who laughed, side comments)
- Keep PTT as authoritative source for game actions

### PTT Activation Methods

| Method | Driving Safe | Complexity |
|--------|--------------|------------|
| Steering wheel Bluetooth button | ✅ Yes | Low |
| Earbud tap/squeeze | ✅ Yes | Medium |
| Screen hold (parked only) | ❌ No | Low |
| Wake word "Hey Dreamweaver" | ✅ Yes | High |
| Continuous + wake word per-command | ✅ Yes | Medium |

**MVP Implementation:**
- Primary: Earbud tap or Bluetooth button
- Fallback: Screen hold (warns if driving mode active)
- Stretch: "Hey Dreamweaver" wake word

## Voice Technical Specifications

### Audio Format

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Sample Rate | 16kHz | STT optimized |
| Bit Depth | 16-bit | Standard |
| Channels | Mono | Voice only |
| Codec | Opus | WebRTC standard, low latency |
| Bitrate | 24-32 kbps | Balance quality/bandwidth |

### Voice Activity Detection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VAD PIPELINE                                    │
│                                                                         │
│  Raw Audio ──> Energy Threshold ──> WebRTC VAD ──> Speech/Silence      │
│                    │                     │                              │
│                    │                     └──> ML-based if needed        │
│                    │                                                    │
│                    └──> Noise gate (car noise rejection)               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### STT Configuration

| Parameter | Value |
|-----------|-------|
| Model | Whisper small.en / faster-whisper |
| Language | English (MVP) |
| Processing | Streaming with 1s chunks |
| Latency Target | <500ms per chunk |

### TTS Configuration

| Parameter | Value |
|-----------|-------|
| Engine | Piper (local) or ElevenLabs (cloud fallback) |
| Voice | Neutral narrator, clear diction |
| Speed | 1.0-1.1x (slightly fast for engagement) |
| Format | Opus stream |

## Multiplayer Session Management

### Room Lifecycle

```
CREATE ──> LOBBY ──> PLAYING ──> ENDED
             │          │
             │          └──> PAUSED ──> PLAYING
             │
             └──> CANCELLED
```

### Player States

```
CONNECTING ──> CONNECTED ──> DISCONNECTED
                   │              │
                   │              └──> RECONNECTING ──> CONNECTED
                   │
                   └──> SPECTATING (post-MVP)
```

### Reconnection Protocol

```
1. Client detects disconnect
2. Client attempts reconnect (exponential backoff: 1s, 2s, 4s, 8s, 16s)
3. Server holds player slot for 60 seconds
4. On reconnect:
   a. Client sends last known state hash
   b. Server sends state delta
   c. Server sends last 30s of narration audio (optional replay)
   d. Client rejoins voice channel
5. AI acknowledges: "Welcome back, [name]. You missed: [brief recap]"
```

### Bandwidth Requirements

| Scenario | Download | Upload |
|----------|----------|--------|
| Idle (connected) | ~1 kbps | ~1 kbps |
| Listening to narration | ~32 kbps | ~1 kbps |
| Speaking | ~32 kbps | ~32 kbps |
| Full session (4 players) | ~100 kbps | ~32 kbps |

Minimum viable connection: 3G / poor LTE (500 kbps+)
