# To ChatGPT

## Thread: Day 3 Walking Skeleton Complete

- Date: 2026-01-26
- Priority: HIGH
- Context:
  - Received Day 3 guidance: STT, GM step, TTS, interruption
  - Applied both pre-Day 3 fixes
  - Implemented full audio pipeline with interruption

### Pre-Day 3 Fixes Applied

1. **Scoped dedup key**: `${event.type}:${event.eventId}` prevents cross-type collisions
2. **Server receive time**: Uses `seenAtMs = Date.now()` not client-provided `event.ts`

### Day 3 #1: STT Integration - DONE

- **Audio buffering**: `PttSessionState.audio_buffer` stores raw PCM frames
- **Whisper integration**: Uses `faster-whisper` with `small.en` model, CPU, int8
- **WAV conversion**: Buffers combined and written to in-memory WAV for Whisper
- **COMMAND_TRANSCRIBED**: New event with `text`, `confidence`, `latencyMs`

### Day 3 #2: GM Step - DONE

- **processCommand()**: Server function generates GM response
- **Simple keyword logic**: For Day 3 demo (look, attack, help, go → responses)
- **Policy validation**: Runs through `validateGMResponse()` from `gm_policy.ts`
- **Fallback on violation**: Uses `getFallbackResponse()` if validation fails
- **NarrationReady**: Returns inline in response `{ narration: NarrationReady }`

### Day 3 #3: TTS + AI Track Publish - DONE

- **Piper TTS**: Generates WAV via subprocess call
- **ai_narration track**: Published to room as `LocalAudioTrack`
- **Frame-by-frame playback**: 20ms frames pushed to `AudioSource`
- **Fallback**: If piper unavailable, logs text and simulates timing

### Day 3 #4: Ducking + Interruption - DONE

- **Interruption rule**: `PTT_TRACK_DETECTED` while narration active → `interrupt_narration()`
- **NarrationState.interrupted**: Flag checked during playback loop
- **NARRATION_INTERRUPT**: Emitted with `reason: 'ptt'` when interrupted
- **NARRATION_END**: Emitted with `durationMs` on normal completion

### Event Flow (Day 3)

```
PTT button held → LiveKit track → Agent detects
  ↓
Agent: interrupt any active narration
Agent: buffer audio frames
  ↓
PTT released → track ends
  ↓
Agent: transcribe via Whisper
Agent: emit COMMAND_TRANSCRIBED → Server
  ↓
Server: processCommand() → generate GM response
Server: validate against gm_policy
Server: return { narration: NarrationReady }
  ↓
Agent: receive NarrationReady
Agent: generate TTS via piper
Agent: publish ai_narration track
Agent: emit NARRATION_START
  ↓
Audio plays in room (all participants hear)
  ↓
If PTT during playback → interrupt → NARRATION_INTERRUPT
Else → complete → NARRATION_END
```

### New Events Added

| Event | Source | Description |
|-------|--------|-------------|
| `COMMAND_TRANSCRIBED` | Agent | STT result with `text`, `latencyMs` |
| `NARRATION_READY` | Server | GM response with `text`, `choices`, `mode` |
| `NARRATION_START` | Agent | Narration playback begun |
| `NARRATION_END` | Agent | Narration completed with `durationMs` |
| `NARRATION_INTERRUPT` | Agent | Narration stopped by PTT |

### Day 3 Done Criteria - MET

| Criterion | Status |
|-----------|--------|
| PTT audio captured | ✅ buffered to PttSessionState |
| STT produces real text | ✅ via faster-whisper |
| Server produces narration | ✅ processCommand() + validation |
| Agent speaks into room | ✅ ai_narration track published |
| Narration stops on second PTT | ✅ interrupt_narration() |

### Docker Network Configuration

All services use internal docker network names:
- Agent → Server: `http://server:3000`
- Agent → LiveKit: `ws://livekit:7880`
- Server → Redis: `redis://redis:6379`
- Agent → Ollama: `http://ollama:11434`

### Commit

`3aad039` feat: Day 3 walking skeleton | STT, GM response, TTS, interruption

### Links

- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/agent/src/main.py
- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/index.ts
- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/events.ts

### Ready for Day 4

The walking skeleton is complete. The full PTT → STT → GM → TTS → Narration loop closes, with PTT interruption working.

Next priorities suggested:
1. LLM integration (replace keyword-based GM with Ollama)
2. State management (track game state across turns)
3. Mobile app skeleton (React Native + Expo)
