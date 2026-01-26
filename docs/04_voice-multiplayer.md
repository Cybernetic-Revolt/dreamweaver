# Voice & Multiplayer Design

## Overview

Dreamweaver's core experience is a real-time voice "call" where players talk naturally while an AI Game Master narrates the adventure. This document specifies how voice flows between participants and how AI narration interleaves with live conversation.

## How the "Call" Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VOICE TOPOLOGY: SFU                             │
│                                                                         │
│     Player A ─────┐                          ┌───── Player C            │
│     (speaking)    │                          │      (listening)         │
│                   ▼                          │                          │
│              ┌─────────────────────────┐     │                          │
│              │   Selective Forwarding  │     │                          │
│              │        Unit (SFU)       │◄────┘                          │
│              │                         │                                │
│              │  • Receives all streams │                                │
│              │  • Forwards selectively │                                │
│              │  • Mixes AI narration   │                                │
│              │  • Detects active       │                                │
│              │    speaker              │                                │
│              └───────────┬─────────────┘                                │
│                          │                                              │
│     Player B ◄───────────┴───────────────────────► AI Narrator          │
│     (listening)                                    (TTS output)         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Connection Flow

```
1. Host creates session
   └─> Server allocates room
   └─> Server returns room code + WebRTC offer

2. Players join
   └─> Client sends room code
   └─> Server validates, returns WebRTC answer
   └─> ICE candidates exchanged
   └─> Media flows established

3. Voice channel open
   └─> All participants hear each other
   └─> Server can inject AI audio
   └─> Server receives all audio for STT
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
