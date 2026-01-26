# Architecture Options

## Overview

Two architecture options are presented: **Option A (Unified Server)** optimizes for simplicity and fast MVP delivery. **Option B (Microservices)** optimizes for scalability and separation of concerns.

**Recommendation: Option A** for MVP due to reduced complexity and faster iteration.

### Critical Decision: LiveKit for Voice SFU

**MVP uses LiveKit Cloud (free tier) or self-hosted LiveKit server.**

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| LiveKit | Production-ready SFU, free tier, SDK for React Native | Another service to manage | ✅ **Selected** |
| mediasoup | Full control, no vendor | Complex setup, 3+ days alone | ❌ |
| Raw WebRTC mesh | Simple start | Doesn't scale past 3 players | ❌ |
| Twilio | Reliable | Expensive ($0.004/min/participant) | ❌ |

**Rationale:** LiveKit gives us a working SFU in hours, not days. Free tier supports MVP scale. Self-host option available for production.

---

## Option A: Unified Server Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            MOBILE CLIENTS                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Player 1   │  │  Player 2   │  │  Player 3   │  │  Player 4   │    │
│  │  (Host)     │  │  (Local)    │  │  (Remote)   │  │  (Remote)   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                    │
                                    │ WebSocket + WebRTC
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED GAME SERVER                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Dreamweaver Core                            │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │   │
│  │  │  Session  │ │   Voice   │ │    LLM    │ │   State   │        │   │
│  │  │  Manager  │ │  Router   │ │  Gateway  │ │  Machine  │        │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘        │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │   │
│  │  │    STT    │ │    TTS    │ │ Adventure │ │  Presence │        │   │
│  │  │  Worker   │ │  Worker   │ │  Loader   │ │  Tracker  │        │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────┴───────────────────────────────┐   │
│  │                         Data Layer                               │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │   │
│  │  │     Redis       │  │    SQLite       │  │   File Store    │  │   │
│  │  │ (sessions, pub/ │  │ (adventures,    │  │  (audio cache)  │  │   │
│  │  │  sub, ephemeral)│  │  user prefs)    │  │                 │  │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          ┌─────────────────┐             ┌─────────────────┐
          │   LLM Provider  │             │   TTS Provider  │
          │  (OpenAI API    │             │  (Local Piper/  │
          │   or local      │             │   or cloud)     │
          │   Ollama)       │             │                 │
          └─────────────────┘             └─────────────────┘
```

### Network Flows

**1. Player Joins Session**
```
Client                    Server                     Redis
   │                         │                         │
   │──── WS Connect ────────>│                         │
   │──── JOIN {code} ───────>│                         │
   │                         │──── HGET session ──────>│
   │                         │<─── session data ───────│
   │                         │──── HSET add player ───>│
   │<─── SESSION_STATE ──────│                         │
   │<─── PLAYER_LIST ────────│                         │
```

**2. Voice Flow (Player speaks)**
```
Client                    Server                     LLM
   │                         │                         │
   │──── AUDIO_CHUNK ───────>│                         │
   │──── AUDIO_CHUNK ───────>│                         │
   │──── END_SPEECH ────────>│                         │
   │                         │──── STT Process ───────>│ (local)
   │                         │<─── Transcript ─────────│
   │                         │                         │
   │                         │──── LLM Request ───────>│
   │                         │<─── GM Response ────────│
   │                         │                         │
   │                         │──── TTS Generate ──────>│ (local)
   │                         │<─── Audio ──────────────│
   │                         │                         │
   │<─── NARRATION_AUDIO ────│                         │
   │      (streamed)         │                         │
```

**3. Voice Chat (Player-to-Player via LiveKit)**
```
Client A                  LiveKit SFU              Client B
   │                         │                         │
   │──── Publish Track ─────>│                         │
   │                         │──── Subscribe Track ───>│
   │                         │     (sub-100ms latency) │

Server injects AI narration as separate audio track:
Server ──> Publish "gm-narrator" Track ──> LiveKit ──> All Clients
```

**Key LiveKit Integration Points:**
- Clients join LiveKit room with same room code as game session
- Server connects as hidden participant to inject GM audio track
- Client-side: duck GM track volume when local PTT active
- STT runs on server by subscribing to player audio tracks

### Failure Modes & Mitigations

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Client disconnect | WebSocket close / ping timeout | Auto-reconnect with exponential backoff; server holds player slot 60s |
| LLM timeout | 10s request timeout | Fallback to canned "The mists swirl... one moment" + retry |
| LLM error | HTTP 5xx / rate limit | Queue request, retry 3x, then "GM is gathering thoughts" |
| STT failure | Empty/error response | "I didn't catch that, could you repeat?" |
| TTS failure | Generation timeout | Send text transcript, skip audio |
| Redis crash | Connection refused | **SQLite snapshot persistence**: save authoritative state every 30s + on major transitions. Redis is cache only. |
| Server crash | Process exit | systemd auto-restart; clients reconnect; reload from SQLite snapshot |
| **Audio echo/double-talk** | VAD overlap detection | **Client-side ducking**: AI narration track ducks 80% when any player PTT active. LiveKit handles echo cancellation. |
| **AI talks over player** | Player interrupts during narration | **Immediate pause**: Stop TTS playback within 200ms, AI acknowledges or resumes |

### Complexity Estimate

| Component | Complexity | Hard Parts |
|-----------|------------|------------|
| Voice routing | **High** | Low-latency mixing, echo handling |
| State machine | **Medium** | Handling concurrent player actions |
| LLM integration | **Low** | Prompt engineering, context management |
| Reconnection | **Medium** | State diff sync, audio stream resumption |
| Mobile app | **Medium** | Audio permissions, background mode |

**Total Effort: ~14 days for solo developer**

### What Makes It Hard
1. **Voice latency** - Getting sub-200ms audio relay requires careful WebRTC/SFU setup
2. **State consistency** - Multiple players acting "simultaneously" need conflict resolution
3. **Context management** - LLM context window limits vs. conversation history

---

## Option B: Microservices Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            MOBILE CLIENTS                               │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │          API GATEWAY              │
                    │     (Kong / Traefik / nginx)      │
                    └─────────────────┬─────────────────┘
                                      │
        ┌─────────────┬───────────────┼───────────────┬─────────────┐
        │             │               │               │             │
        ▼             ▼               ▼               ▼             ▼
┌───────────┐ ┌───────────┐ ┌───────────────┐ ┌───────────┐ ┌───────────┐
│  Session  │ │   Voice   │ │     Game      │ │    AI     │ │  Media    │
│  Service  │ │  Service  │ │    Engine     │ │  Service  │ │  Service  │
│           │ │           │ │               │ │           │ │           │
│ • Create  │ │ • WebRTC  │ │ • State       │ │ • STT     │ │ • TTS     │
│ • Join    │ │ • SFU     │ │ • Rules       │ │ • LLM     │ │ • Cache   │
│ • Auth    │ │ • Record  │ │ • Adventure   │ │ • Context │ │ • Stream  │
└─────┬─────┘ └─────┬─────┘ └───────┬───────┘ └─────┬─────┘ └─────┬─────┘
      │             │               │               │             │
      └─────────────┴───────────────┴───────────────┴─────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │         Message Bus           │
                    │     (Redis Streams/NATS)      │
                    └───────────────┬───────────────┘
                                    │
        ┌─────────────┬─────────────┴─────────────┬─────────────┐
        ▼             ▼                           ▼             ▼
┌───────────┐ ┌───────────┐               ┌───────────┐ ┌───────────┐
│  Redis    │ │ PostgreSQL│               │   MinIO   │ │  Loki     │
│ (cache,   │ │ (persist) │               │ (objects) │ │ (logs)    │
│  pubsub)  │ │           │               │           │ │           │
└───────────┘ └───────────┘               └───────────┘ └───────────┘
```

### Network Flows

**1. Voice Processing Pipeline**
```
Client ──> Voice Service ──> AI Service (STT) ──> Game Engine
                                                       │
Game Engine ──> AI Service (LLM) ──> Media Service (TTS) ──> Client
```

**2. Service Communication**
```
┌─────────────┐    events    ┌─────────────┐
│   Service   │─────────────>│   Message   │
│      A      │<─────────────│     Bus     │
└─────────────┘   subscribe  └─────────────┘
                                   │
                                   │ publish
                                   ▼
                            ┌─────────────┐
                            │   Service   │
                            │      B      │
                            └─────────────┘
```

### Failure Modes & Mitigations

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Service crash | Health check fail | Kubernetes auto-restart |
| Service overload | Queue depth | Horizontal auto-scale |
| Network partition | Timeout + circuit breaker | Fallback responses, eventual consistency |
| Message bus failure | Connection timeout | Local queue buffer, retry |
| Cross-service latency | Distributed tracing | Circuit breakers, timeouts |

### Complexity Estimate

| Component | Complexity | Hard Parts |
|-----------|------------|------------|
| Service orchestration | **High** | Deployment, networking, secrets |
| Inter-service communication | **High** | Latency, error propagation |
| Distributed state | **Very High** | Consistency, conflict resolution |
| Monitoring/observability | **Medium** | Tracing, log aggregation |
| Each individual service | **Low-Medium** | Focused scope |

**Total Effort: ~30-45 days for solo developer**

### What Makes It Hard
1. **Operational complexity** - 5+ services to deploy, monitor, debug
2. **Distributed state** - Game state lives across services, needs saga pattern
3. **Latency accumulation** - Each hop adds delay (critical for voice)
4. **Testing** - Integration tests require full environment

---

## Architecture Comparison

| Factor | Option A (Unified) | Option B (Microservices) |
|--------|-------------------|-------------------------|
| **MVP Speed** | ✅ Fast (14 days) | ❌ Slow (30+ days) |
| **Operational Load** | ✅ Single process | ❌ 5+ services |
| **Voice Latency** | ✅ Minimal hops | ⚠️ Multiple hops |
| **Debugging** | ✅ Single log stream | ❌ Distributed tracing |
| **Scalability** | ⚠️ Vertical only | ✅ Horizontal |
| **Team Scale** | ✅ Solo friendly | ❌ Needs team |
| **Future Flexibility** | ⚠️ Refactor needed | ✅ Service boundaries |

## Recommendation

**Choose Option A (Unified Server)** for MVP because:

1. **14-day timeline** - Microservices operational overhead alone exceeds this
2. **Solo developer** - No team to parallelize service development
3. **Homelab deployment** - Kubernetes/orchestration adds unnecessary complexity
4. **Voice latency critical** - Fewer hops = lower latency
5. **Iteration speed** - Single codebase = faster changes

**Migration path to Option B:**
- Extract Voice Service first (most isolated)
- Extract AI Service second (stateless)
- Keep Game Engine monolithic longest (most state)

---

## Deployment Architecture (Option A)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROXMOX HOST                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      LXC Container: dreamweaver                   │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │ │
│  │  │   nginx     │  │   Redis     │  │   Dreamweaver Server    │   │ │
│  │  │  (reverse   │  │  (sessions) │  │   (Node.js/Bun)         │   │ │
│  │  │   proxy,    │  │             │  │                         │   │ │
│  │  │   TLS)      │  │             │  │   Port 3000             │   │ │
│  │  │  Port 443   │  │  Port 6379  │  │                         │   │ │
│  │  └──────┬──────┘  └─────────────┘  └─────────────────────────┘   │ │
│  │         │                                      ▲                  │ │
│  │         └──────────────────────────────────────┘                  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      LXC Container: ai-services                   │ │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐    │ │
│  │  │   Ollama (LLM)          │  │   Piper (TTS)               │    │ │
│  │  │   llama3:8b / mistral   │  │   en_US voices              │    │ │
│  │  │   Port 11434            │  │   Port 5000                 │    │ │
│  │  └─────────────────────────┘  └─────────────────────────────┘    │ │
│  │  ┌─────────────────────────┐                                      │ │
│  │  │   Whisper (STT)         │                                      │ │
│  │  │   whisper.cpp / faster  │                                      │ │
│  │  │   Port 5001             │                                      │ │
│  │  └─────────────────────────┘                                      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hardware Requirements (Homelab)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 16 GB | 32 GB |
| GPU | None (CPU inference) | RTX 3060+ (fast inference) |
| Storage | 50 GB SSD | 100 GB NVMe |
| Network | 50 Mbps up | 100 Mbps up |
