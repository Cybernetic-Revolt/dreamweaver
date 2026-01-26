# Dreamweaver: Project Overview

> Voice-first, multiplayer, AI-driven RPG experience inspired by HarmonQuest.
> Safe for driving. Hands-free. Eyes-free.

## Last Updated
- **Date:** 2026-01-26
- **Status:** ChatGPT review integrated, LiveKit decisions added
- **LLM Index:** [llms.txt](https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/llms.txt)

---

## Quick Links

| Document | Description |
|----------|-------------|
| [Problem & Success](./01_problem-success.md) | Why we're building this, success criteria |
| [MVP Scope](./02_mvp-scope.md) | What's in/out for the 14-day sprint |
| [Architecture](./03_architecture.md) | System design, two options compared |
| [Voice & Multiplayer](./04_voice-multiplayer.md) | How voice chat and AI narration work |
| [Game Engine](./05_game-engine.md) | State model, narrative structure, GM rules |
| [Driving UX](./06_driving-ux.md) | Safety contract, allowed commands, attention budget |
| [Tech Stack](./07_stack.md) | Recommended technologies |
| [Security & Data](./08_security-data.md) | Privacy, security, data handling |

### Planning & Specs

| Document | Description |
|----------|-------------|
| [14-Day Sprint](../plans/14_day_sprint.md) | Day-by-day build plan |
| [Risks](../spec/risks.md) | Risk assessment and mitigations |
| [Acceptance Tests](../spec/acceptance-tests.md) | MVP acceptance criteria |
| [Decisions](../spec/decisions.md) | Architecture decision log |
| [OpenAPI Spec](../api/openapi.yaml) | API specification |

---

## What is Dreamweaver?

Dreamweaver is a **voice-only multiplayer RPG** where an AI Game Master narrates adventures while players talk naturally, like a podcast-style tabletop game.

**Key differentiator:** Designed for **safe use while driving**—no screens, no buttons, just voice.

### The Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│    🚗 Driver starts app                                                 │
│         │                                                               │
│         ▼                                                               │
│    🎙️  "Start new game"                                                 │
│         │                                                               │
│         ▼                                                               │
│    🤖  AI: "Welcome, adventurer. Room code: WYRM-42"                   │
│         │                                                               │
│         ▼                                                               │
│    📱  Friends join from their phones                                   │
│         │                                                               │
│         ▼                                                               │
│    🎭  30-45 minutes of collaborative storytelling                     │
│         │                                                               │
│         ├── Natural voice conversation                                 │
│         ├── AI narrates scenes, NPCs, challenges                       │
│         └── Players make choices, shape the story                      │
│         │                                                               │
│         ▼                                                               │
│    🏆  Adventure concludes                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### 1. Driving Safety First
- **Zero screen dependency** during gameplay
- **Zero required touch** interactions
- **Voice-only** input and output
- **Interruptible** for navigation, calls, emergencies

### 2. Natural Voice Interaction
- Talk to the AI GM like a real person
- Talk to other players in real-time
- Push-to-talk for clear speaker identification
- AI waits for you, never talks over players

### 3. Simple but Deep
- Easy to join (room codes)
- Easy to play (just talk)
- Rich narrative possibilities
- Server keeps everything in sync

### 4. Self-Hosted & Private
- Runs on your homelab
- No cloud dependencies for core features
- Your voice data stays local
- No recurring API costs

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DREAMWEAVER                                  │
│                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│   │   Mobile    │     │   Mobile    │     │   Mobile    │              │
│   │   App 1     │     │   App 2     │     │   App 3     │              │
│   │  (Host)     │     │  (Player)   │     │  (Player)   │              │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘              │
│          │                   │                   │                      │
│          └───────────────────┼───────────────────┘                      │
│                              │                                          │
│                    WebSocket + WebRTC                                   │
│                              │                                          │
│                              ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      GAME SERVER                                 │  │
│   │                                                                   │  │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │  │
│   │   │ Session │  │  Voice  │  │  Game   │  │   AI    │            │  │
│   │   │ Manager │  │ Router  │  │ Engine  │  │ Gateway │            │  │
│   │   └─────────┘  └─────────┘  └─────────┘  └────┬────┘            │  │
│   │                                               │                  │  │
│   └───────────────────────────────────────────────┼──────────────────┘  │
│                                                   │                      │
│                              ┌────────────────────┼────────────────┐    │
│                              │                    │                │    │
│                              ▼                    ▼                ▼    │
│                        ┌─────────┐          ┌─────────┐      ┌────────┐│
│                        │ Ollama  │          │ Whisper │      │ Piper  ││
│                        │  (LLM)  │          │  (STT)  │      │ (TTS)  ││
│                        └─────────┘          └─────────┘      └────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## MVP Scope Summary

### In (Day 14)
- ✅ 2-5 players voice chat
- ✅ AI Game Master (narration + responses)
- ✅ One complete adventure (30-45 min)
- ✅ Voice-driven character creation
- ✅ Basic commands (pause, resume, recap)
- ✅ Reconnection handling
- ✅ Push-to-talk speaker identification

### Out (Post-MVP)
- ❌ Persistent campaigns
- ❌ Rich UI mode
- ❌ App store distribution
- ❌ Custom adventures
- ❌ Complex character sheets

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Mobile | React Native + Expo |
| Server | Bun + Hono |
| Real-time | WebSocket + WebRTC |
| LLM | Ollama (Llama 3 8B) |
| STT | Whisper (faster-whisper) |
| TTS | Piper |
| State | Redis |
| Storage | SQLite |
| Infrastructure | Proxmox (self-hosted) |

---

## 14-Day Sprint Milestones

| Day | Milestone |
|-----|-----------|
| 3 | **Walking skeleton** - Voice chat + basic server |
| 5 | **AI integration** - STT + LLM + TTS working |
| 7 | **Multiplayer demo** - 3+ players, AI GM responds |
| 10 | **Adventure playable** - Full game loop works |
| 12 | **Reliability** - Reconnection, error handling |
| 14 | **MVP Complete** - Deployed, tested, playable |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Unified server | Fast MVP, simple ops |
| Speaker ID | Push-to-talk | 100% accuracy, driving-safe |
| Turn system | Freeform + PTT | Natural but controlled |
| LLM | Local (Ollama) | No API costs, privacy |
| Voice topology | SFU | Scales to 5 players |

See [Decision Log](../spec/decisions.md) for full details.

---

## Getting Started (Development)

```bash
# Clone repo
git clone https://github.com/Cybernetic-Revolt/dreamweaver.git
cd dreamweaver

# Start server
cd server && bun install && bun run dev

# Start mobile app (separate terminal)
cd app && npx expo start

# Start AI services (separate terminals)
ollama serve
# Whisper and Piper setup per docs/07_stack.md
```

---

## Repository Structure

```
dreamweaver/
├── docs/                    # Planning & design docs
│   ├── 00_overview.md       # This file
│   ├── 01_problem-success.md
│   ├── 02_mvp-scope.md
│   ├── 03_architecture.md
│   ├── 04_voice-multiplayer.md
│   ├── 05_game-engine.md
│   ├── 06_driving-ux.md
│   ├── 07_stack.md
│   └── 08_security-data.md
├── spec/                    # Specifications
│   ├── decisions.md
│   ├── risks.md
│   └── acceptance-tests.md
├── plans/                   # Project planning
│   └── 14_day_sprint.md
├── api/                     # API specifications
│   └── openapi.yaml
├── messages/                # LLM collaboration mailbox
│   ├── to-chatgpt.md        # Claude → ChatGPT messages
│   └── to-claude.md         # ChatGPT → Claude messages
├── llms.txt                 # Curated file index for LLMs
├── llms-full.txt            # Complete file manifest
├── server/                  # Backend (to be created)
└── app/                     # Mobile app (to be created)
```

---

## Contact & Contributions

- **Repository:** https://github.com/Cybernetic-Revolt/dreamweaver
- **Issues:** GitHub Issues for bugs and features

---

## Appendix: Document Changelog

| Date | Change |
|------|--------|
| 2026-01-26 | ChatGPT review: LiveKit, hybrid voice, driving UX hardening |
| 2026-01-26 | Added LLM collaboration protocol (llms.txt, messages/) |
| 2026-01-26 | Initial planning session complete |
