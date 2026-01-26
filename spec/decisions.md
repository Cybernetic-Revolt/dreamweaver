# Decision Log

## Overview

This document records key architectural and design decisions made during Dreamweaver planning. Each decision follows the ADR (Architecture Decision Record) format.

---

## D001: Unified Server vs Microservices

**Date:** Planning Phase
**Status:** Accepted

### Context

We need to choose between a unified monolithic server or a microservices architecture for the MVP.

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A: Unified Server** | Fast dev, simple ops, low latency | Limited scalability |
| **B: Microservices** | Scalable, separation of concerns | Complex ops, higher latency |

### Decision

**Option A: Unified Server**

### Rationale

1. 14-day timeline makes microservices infeasible
2. Solo developer cannot parallelize service development
3. Voice latency critical—fewer network hops better
4. Homelab deployment doesn't need horizontal scaling
5. Can extract services later if needed

### Consequences

- Single deployment unit
- Must refactor to scale beyond ~10 concurrent sessions
- All code in single codebase (simpler debugging)

---

## D002: Push-to-Talk vs Always-On Voice

**Date:** Planning Phase
**Status:** Accepted

### Context

For speaker identification, we need to decide between push-to-talk (PTT), always-on with diarization, or hybrid approach.

### Options Considered

| Option | Accuracy | Complexity | UX |
|--------|----------|------------|-----|
| **A: PTT + Identity** | 100% | Low | Requires button |
| **B: Always-on + Diarization** | 70-85% | High | Seamless |
| **C: Hybrid** | 85-95% | Very High | Best of both |

### Decision

**Option A: Push-to-Talk with Identity**

### Rationale

1. 100% speaker accuracy is critical for game logic
2. No ML models needed for speaker ID
3. Driving-safe—works with steering wheel button or earbud tap
4. Battery efficient (no always-on processing)
5. Low latency (no diarization delay)

### Consequences

- Players must actively hold button to speak
- Simplifies audio pipeline significantly
- May feel less natural than conversation
- Post-MVP can add diarization for non-game chatter

---

## D003: Freeform vs Strict Turn System

**Date:** Planning Phase
**Status:** Accepted

### Context

Multiplayer voice interactions need structure. Options range from strict turn-based to freeform conversation.

### Options Considered

| Option | Natural Feel | Clarity | Implementation |
|--------|--------------|---------|----------------|
| **A: Strict turns** | Low | High | Medium |
| **B: Freeform** | High | Low | Simple |
| **C: Freeform + PTT** | Medium-High | Medium-High | Medium |

### Decision

**Option C: Freeform with Push-to-Talk**

### Rationale

1. PTT provides clear "I'm speaking" signal
2. Multiple players can speak simultaneously (like real conversation)
3. AI moderates if needed ("One at a time, adventurers")
4. Matches HarmonQuest style (hosted but not rigid)
5. Natural feel without losing control

### Consequences

- Crosstalk possible (acceptable)
- AI may need to ask for clarification
- Works well with PTT decision (D002)

---

## D004: LLM Provider Selection

**Date:** Planning Phase
**Status:** Accepted

### Context

Need to choose LLM provider for AI Game Master. Options include local (Ollama) or cloud (OpenAI, Anthropic).

### Options Considered

| Option | Cost | Latency | Quality | Privacy |
|--------|------|---------|---------|---------|
| **A: Ollama (local)** | Free | Low | Good | High |
| **B: OpenAI API** | $$$ | Medium | Excellent | Low |
| **C: Anthropic API** | $$$ | Medium | Excellent | Low |

### Decision

**Option A: Ollama (local) with cloud fallback**

### Rationale

1. No recurring API costs (self-hosted goal)
2. Privacy (voice data stays local)
3. Lower latency (no round-trip to cloud)
4. Llama 3 8B quality sufficient for MVP
5. Can add cloud fallback if local fails

### Consequences

- Requires GPU for reasonable speed (or accept slower CPU)
- Model quality may be lower than GPT-4
- More control over model behavior
- No surprise API bills

---

## D005: TTS Engine Selection

**Date:** Planning Phase
**Status:** Accepted

### Context

Need text-to-speech engine for AI narration. Options include local (Piper, Coqui) or cloud (ElevenLabs, Google).

### Options Considered

| Option | Quality | Latency | Cost | Voices |
|--------|---------|---------|------|--------|
| **A: Piper** | Good | Low | Free | Limited |
| **B: ElevenLabs** | Excellent | Medium | $$$ | Many |
| **C: Google TTS** | Good | Medium | $ | Many |

### Decision

**Option A: Piper (local) with ElevenLabs fallback**

### Rationale

1. Local = no cost, low latency
2. Piper quality sufficient for MVP (not perfect)
3. Can upgrade to ElevenLabs post-MVP for better voices
4. Keeps voice data local

### Consequences

- Voice quality "good enough" not "amazing"
- Single narrator voice for MVP
- Can mix in cloud TTS for NPCs later

---

## D006: STT Engine Selection

**Date:** Planning Phase
**Status:** Accepted

### Context

Need speech-to-text for player voice input. Options include Whisper variants or cloud services.

### Decision

**Whisper (faster-whisper or whisper.cpp) running locally**

### Rationale

1. Whisper accuracy is excellent
2. faster-whisper has GPU acceleration
3. Local processing = no cloud costs
4. Handles accents well
5. Can use small model for speed

### Consequences

- Requires GPU for best speed
- ~500ms-1s processing per utterance
- English-only for MVP (can add languages)

---

## D007: Mobile Framework Selection

**Date:** Planning Phase
**Status:** Accepted

### Context

Need cross-platform mobile app for iOS and Android.

### Options Considered

| Option | Dev Speed | Audio Support | Familiarity |
|--------|-----------|---------------|-------------|
| **A: React Native + Expo** | Fast | Good | TypeScript |
| **B: Flutter** | Fast | Decent | Dart (new) |
| **C: Native** | Slow | Best | Swift/Kotlin |

### Decision

**Option A: React Native with Expo**

### Rationale

1. Single codebase for iOS + Android
2. TypeScript (same as server)
3. expo-av handles audio well
4. Expo builds without Mac
5. OTA updates for quick fixes

### Consequences

- Some audio edge cases may need native modules
- Slightly larger app size
- Familiar stack reduces learning curve

---

## D008: State Storage Selection

**Date:** Planning Phase
**Status:** Accepted

### Context

Need to store session state (ephemeral) and persistent data (adventures).

### Decision

**Redis for sessions, SQLite for persistence**

### Rationale

1. Redis: Fast, pub/sub, natural TTLs for sessions
2. SQLite: Zero-config, embedded, sufficient for adventure storage
3. No need for heavy databases like PostgreSQL for MVP
4. Both well-supported in Bun

### Consequences

- Session state lost if Redis crashes (acceptable for MVP)
- Can add persistence layer later
- Simple operational model

---

## D009: Adventure Structure Format

**Date:** Planning Phase
**Status:** Accepted

### Context

Need a format for defining adventures (story, nodes, transitions).

### Decision

**YAML with hybrid node-procedural structure**

### Rationale

1. YAML is human-readable and writable
2. Nodes define key story beats (authored)
3. Between nodes, LLM fills in (procedural)
4. Balances narrative control with flexibility
5. Easy to edit without code changes

### Consequences

- Adventure authors need to understand YAML
- LLM must stay within node constraints
- Some training needed for good adventures

---

## D010: Voice Topology

**Date:** Planning Phase
**Status:** Accepted

### Context

Need to route voice between multiple players. Options: mesh, SFU, MCU.

### Options Considered

| Option | Bandwidth | Server Load | Latency |
|--------|-----------|-------------|---------|
| **A: Mesh** | High (O(n²)) | Low | Lowest |
| **B: SFU** | Medium (O(n)) | Medium | Low |
| **C: MCU** | Low | High | Higher |

### Decision

**Option B: Selective Forwarding Unit (SFU)**

### Rationale

1. Scales better than mesh (critical for 5 players)
2. Lower latency than MCU (no server mixing)
3. Server can inject AI audio easily
4. Well-supported by mediasoup/Janus/Livekit

### Consequences

- Need SFU server component
- Server sees all audio (can process for STT)
- Moderate server bandwidth usage

---

## D011: Character System Complexity

**Date:** Planning Phase
**Status:** Accepted

### Context

Need to decide how complex character sheets are for MVP.

### Decision

**Minimal: Name, archetype, trait, health, 5-item inventory**

### Rationale

1. Complex stats require UI (violates driving-safe)
2. Players can't manage detailed sheets by voice
3. Archetype gives mechanical differentiation
4. Trait provides roleplay hook
5. Can expand post-MVP

### Consequences

- Less tactical depth
- Simpler for new players
- GM makes most mechanical decisions

---

## D012: Session Duration Handling

**Date:** Planning Phase
**Status:** Accepted

### Context

Adventures may run long or short. Need to handle session persistence.

### Decision

**MVP: Single-session adventures only, no save/load**

### Rationale

1. Save/load adds complexity
2. Adventures designed for 30-45 minutes
3. Can pause within session
4. Campaign persistence is post-MVP feature

### Consequences

- Can't resume tomorrow
- Adventure must be completable in one sitting
- Simpler state management

---

## D013: Runtime Selection

**Date:** Planning Phase
**Status:** Accepted

### Context

Need JavaScript/TypeScript runtime for server.

### Options Considered

| Option | Speed | DX | Ecosystem |
|--------|-------|-----|-----------|
| **A: Bun** | Fastest | Good | Growing |
| **B: Node.js** | Good | Mature | Largest |
| **C: Deno** | Fast | Good | Moderate |

### Decision

**Option A: Bun**

### Rationale

1. Fastest startup and runtime
2. Native TypeScript
3. Built-in SQLite
4. Fast WebSocket server
5. Good enough ecosystem for needs

### Consequences

- Newer runtime, some edge cases
- Most npm packages work
- Faster development iteration

---

## D014: Driving Mode Enforcement

**Date:** Planning Phase
**Status:** Accepted

### Context

Need to enforce driving-safe UX. Options range from honor system to technical enforcement.

### Decision

**Technical enforcement via code + conservative defaults**

### Rationale

1. No features that require screen
2. No touch-only interactions
3. Default to driving mode
4. Can't guarantee user compliance, but code doesn't offer unsafe paths

### Consequences

- Some features harder to implement
- Cleaner UX overall
- May feel limiting in non-driving contexts (post-MVP parked mode addresses)

---

## Decision Index

| ID | Decision | Date | Status |
|----|----------|------|--------|
| D001 | Unified Server Architecture | Planning | Accepted |
| D002 | Push-to-Talk for Speaker ID | Planning | Accepted |
| D003 | Freeform with PTT Turn System | Planning | Accepted |
| D004 | Ollama for LLM | Planning | Accepted |
| D005 | Piper for TTS | Planning | Accepted |
| D006 | Whisper for STT | Planning | Accepted |
| D007 | React Native + Expo | Planning | Accepted |
| D008 | Redis + SQLite | Planning | Accepted |
| D009 | YAML Adventure Format | Planning | Accepted |
| D010 | SFU Voice Topology | Planning | Accepted |
| D011 | Minimal Character System | Planning | Accepted |
| D012 | Single-Session Adventures | Planning | Accepted |
| D013 | Bun Runtime | Planning | Accepted |
| D014 | Technical Driving Safety | Planning | Accepted |

---

## Pending Decisions

| Topic | Options | Decide By |
|-------|---------|-----------|
| App store vs sideload for MVP | TestFlight, sideload, both | Day 12 |
| TURN server: coturn vs commercial | coturn (free) vs Twilio/Xirsys | Day 3 |
| Voice wake word implementation | Hey Dreamweaver vs PTT only | Post-MVP |
