# Technology Stack Recommendation

## Overview

This document specifies the recommended technology stack for Dreamweaver MVP, optimized for:
- Fast development (14-day timeline)
- Self-hosted deployment (Proxmox homelab)
- Low operational complexity (solo developer)
- Voice-first architecture

## Stack Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DREAMWEAVER STACK                               │
│                                                                         │
│  CLIENT              SERVER               AI SERVICES                   │
│  ────────────────    ────────────────     ────────────────              │
│  React Native        Bun + Hono           Ollama (LLM)                  │
│  Expo                WebSocket            Whisper.cpp (STT)             │
│  WebRTC              Redis                Piper (TTS)                   │
│                      SQLite                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Client: React Native + Expo

### Why React Native

| Factor | React Native | Flutter | Native (Swift/Kotlin) |
|--------|--------------|---------|----------------------|
| Dev speed | ✅ Fast | ✅ Fast | ❌ Slow (2 codebases) |
| Audio APIs | ✅ Good | ⚠️ Decent | ✅ Best |
| WebRTC support | ✅ Mature | ⚠️ Limited | ✅ Mature |
| Expo workflow | ✅ Yes | ❌ No | ❌ No |
| Familiar stack | ✅ TypeScript | ⚠️ Dart | ⚠️ Swift/Kotlin |

### Why Expo

- **Managed workflow**: No native build config needed initially
- **EAS Build**: Cloud builds for iOS/Android without Mac
- **OTA Updates**: Push fixes without app store review
- **Audio module**: expo-av handles recording/playback

### Key Libraries

```json
{
  "dependencies": {
    "expo": "~50.0.0",
    "expo-av": "~13.0.0",
    "react-native-webrtc": "^118.0.0",
    "@stream-io/react-native-webrtc": "^118.0.0",
    "zustand": "^4.5.0",
    "react-native-mmkv": "^2.11.0"
  }
}
```

### Project Structure

```
/app
├── (tabs)/
│   ├── index.tsx        # Home/Join screen
│   └── session.tsx      # Active game screen
├── components/
│   ├── VoiceButton.tsx  # PTT button
│   ├── StatusBar.tsx    # Connection/speaker status
│   └── AudioManager.tsx # Audio routing
├── services/
│   ├── webrtc.ts        # Voice channel
│   ├── websocket.ts     # Game state sync
│   └── audio.ts         # Recording/playback
├── stores/
│   ├── gameStore.ts     # Zustand game state
│   └── settingsStore.ts # User preferences
└── utils/
    └── voiceCommands.ts # Command parsing
```

## Server: Bun + Hono

### Why Bun

| Factor | Bun | Node.js | Deno |
|--------|-----|---------|------|
| Performance | ✅ Fastest | ⚠️ Good | ✅ Fast |
| Startup time | ✅ 10ms | ⚠️ 100ms | ✅ 20ms |
| TypeScript | ✅ Native | ⚠️ Compile step | ✅ Native |
| WebSocket | ✅ Built-in fast | ⚠️ ws package | ✅ Built-in |
| Ecosystem | ⚠️ Growing | ✅ Mature | ⚠️ Growing |
| SQLite | ✅ Built-in | ⚠️ better-sqlite3 | ⚠️ Plugin |

### Why Hono

- **Lightweight**: <20KB, minimal overhead
- **Fast**: Optimized for Bun runtime
- **Familiar**: Express-like API
- **TypeScript**: First-class support
- **WebSocket**: Native support with Bun

### Server Structure

```
/server
├── src/
│   ├── index.ts              # Entry point
│   ├── routes/
│   │   ├── sessions.ts       # Session CRUD
│   │   ├── health.ts         # Health checks
│   │   └── adventures.ts     # Adventure loading
│   ├── ws/
│   │   ├── handler.ts        # WebSocket upgrade
│   │   └── messages.ts       # Message types
│   ├── game/
│   │   ├── engine.ts         # Game state machine
│   │   ├── actions.ts        # Action processor
│   │   └── challenges.ts     # Skill check system
│   ├── voice/
│   │   ├── sfu.ts            # Voice routing
│   │   └── vad.ts            # Voice activity detection
│   ├── ai/
│   │   ├── llm.ts            # LLM client
│   │   ├── stt.ts            # Speech-to-text
│   │   ├── tts.ts            # Text-to-speech
│   │   └── prompts.ts        # System prompts
│   ├── data/
│   │   ├── redis.ts          # Redis client
│   │   └── sqlite.ts         # SQLite client
│   └── utils/
│       ├── logger.ts         # Structured logging
│       └── errors.ts         # Error handling
├── adventures/
│   └── goblin_cave.yaml      # MVP adventure
├── package.json
├── tsconfig.json
└── Dockerfile
```

### Key Dependencies

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "redis": "^4.6.0",
    "zod": "^3.22.0",
    "yaml": "^2.3.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "bun-types": "latest",
    "typescript": "^5.3.0"
  }
}
```

## AI Services

### LLM: Ollama

**Why Ollama:**
- Self-hosted, no API costs
- Simple REST API
- Model hot-swapping
- GPU acceleration

**Recommended Models:**

| Model | VRAM | Speed | Quality | Recommendation |
|-------|------|-------|---------|----------------|
| llama3:8b | 8GB | Fast | Good | ✅ Default |
| mistral:7b | 6GB | Fast | Good | Budget GPU |
| llama3:70b | 40GB | Slow | Excellent | Post-MVP |
| phi3:mini | 4GB | Very Fast | Decent | Fallback |

**Configuration:**
```bash
# Start Ollama
ollama serve

# Pull model
ollama pull llama3:8b

# API endpoint
# POST http://localhost:11434/api/generate
```

### STT: Whisper.cpp / Faster-Whisper

**Why Whisper:**
- Best accuracy for English speech
- Handles accents well
- Runs locally
- Multiple size options

**Recommended Configuration:**

| Model | Size | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| small.en | 500MB | ~2x realtime | Good | ✅ MVP |
| medium.en | 1.5GB | ~1x realtime | Better | Quality mode |
| tiny.en | 75MB | ~10x realtime | Decent | Low-power |

**Deployment:**
```bash
# Using faster-whisper (Python, GPU accelerated)
pip install faster-whisper

# Or whisper.cpp (C++, CPU efficient)
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
```

### TTS: Piper

**Why Piper:**
- Fast local inference
- Good voice quality
- Multiple voices
- Low resource usage

**Voices:**
```bash
# Download voice
wget https://github.com/rhasspy/piper/releases/download/v1.0.0/voice-en_US-lessac-medium.onnx

# Run server
piper --model en_US-lessac-medium.onnx --output_raw | aplay -r 22050 -f S16_LE -t raw -
```

**Alternative (Cloud Fallback):** ElevenLabs API for higher quality when local fails

## Data Layer

### Redis

**Purpose:**
- Session state (ephemeral)
- Pub/sub for real-time events
- Rate limiting
- Cache

**Configuration:**
```
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
```

**Data Structures:**

| Key Pattern | Type | Content |
|-------------|------|---------|
| `session:{code}` | Hash | Session metadata |
| `session:{code}:state` | String | JSON game state |
| `session:{code}:players` | Set | Player IDs |
| `session:{code}:chat` | List | Recent chat history |
| `presence:{playerId}` | String | Connection status (TTL) |

### SQLite

**Purpose:**
- Adventure storage
- User preferences (post-MVP)
- Analytics logging

**Schema (MVP):**
```sql
CREATE TABLE adventures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- YAML content
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE session_logs (
  id INTEGER PRIMARY KEY,
  session_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,  -- JSON
  timestamp INTEGER DEFAULT (unixepoch())
);
```

## Real-Time: WebRTC + WebSocket

### WebSocket (Game State)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET MESSAGES                                   │
│                                                                         │
│  Client → Server:                                                       │
│  • JOIN { roomCode, playerName }                                       │
│  • ACTION { text, timestamp }                                          │
│  • VOICE_START { }                                                     │
│  • VOICE_END { }                                                       │
│  • COMMAND { type: "pause"|"resume"|"recap" }                          │
│                                                                         │
│  Server → Client:                                                       │
│  • SESSION_STATE { full state snapshot }                               │
│  • STATE_DELTA { changes only }                                        │
│  • NARRATION { text, audioUrl }                                        │
│  • PLAYER_JOINED { player }                                            │
│  • PLAYER_LEFT { playerId }                                            │
│  • ERROR { code, message }                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### WebRTC (Voice)

**Configuration:**
```typescript
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Self-hosted TURN for NAT traversal
    {
      urls: 'turn:turn.yourdomain.com:3478',
      username: 'dreamweaver',
      credential: 'secret'
    }
  ]
};
```

**SFU Approach:**
- Server receives all audio streams
- Server selectively forwards to recipients
- Server mixes in AI narration audio
- Lower bandwidth than mesh topology

**Library:** mediasoup or Janus for SFU, or simpler Livekit

## Infrastructure

### Proxmox Deployment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROXMOX CONTAINERS                                   │
│                                                                         │
│  LXC: dreamweaver-app (2 CPU, 4GB RAM)                                 │
│  ├── nginx (reverse proxy, TLS)                                        │
│  ├── Bun server (game logic)                                           │
│  └── Redis (session state)                                             │
│                                                                         │
│  LXC: dreamweaver-ai (4 CPU, 16GB RAM, GPU passthrough)                │
│  ├── Ollama (LLM)                                                      │
│  ├── faster-whisper (STT)                                              │
│  └── Piper (TTS)                                                       │
│                                                                         │
│  LXC: dreamweaver-voice (2 CPU, 2GB RAM)                               │
│  └── TURN server (coturn)                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Docker Alternative

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - redis
      - ollama

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  ollama:
    image: ollama/ollama
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]

  whisper:
    build: ./whisper
    ports:
      - "5001:5001"

  piper:
    build: ./piper
    ports:
      - "5000:5000"

volumes:
  redis_data:
  ollama_data:
```

## Version Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| Bun | 1.1+ | For native SQLite |
| Node (if needed) | 20+ | LTS |
| Redis | 7+ | For Streams |
| Expo | 50+ | For audio improvements |
| React Native | 0.73+ | New architecture |
| Ollama | 0.1.30+ | For model serving |

## Development Environment

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and setup
git clone <repo>
cd dreamweaver

# Server
cd server && bun install && bun run dev

# Client (separate terminal)
cd app && npx expo start

# AI services (separate terminals)
ollama serve
python -m faster_whisper.server --model small.en
piper --model voice.onnx --http-port 5000
```

## Cost Estimate (Self-Hosted)

| Resource | One-Time | Monthly |
|----------|----------|---------|
| Homelab hardware (existing) | $0 | $0 |
| Electricity (AI inference) | - | ~$20 |
| Domain + TLS (Cloudflare) | $10/yr | ~$1 |
| Apple Developer (iOS) | $99/yr | ~$8 |
| **Total** | ~$109/yr | ~$29/mo |

**No recurring API costs for LLM/STT/TTS** (self-hosted)

Optional cloud fallback (if local fails):
- OpenAI GPT-4o-mini: ~$0.15/1M tokens
- ElevenLabs TTS: $5/mo starter
