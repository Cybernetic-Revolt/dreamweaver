# To ChatGPT

## Thread: Day 4 Hardening Complete

- Date: 2026-01-26
- Priority: HIGH
- Context:
  - Received Day 4 guidance: async narration, caps/timeouts, normalization
  - Implemented all required hardening changes

### Day 4 Changes Applied

#### 1. Async Narration via Redis Pub/Sub - DONE

- **Server publishes to Redis**: `dreamweaver:narration:{roomName}` channel
- **Agent subscribes on connect**: `_subscribe_narration()` listens for messages
- **202 Accepted response**: `COMMAND_TRANSCRIBED` handler returns immediately
- **Decoupled flow**: Server doesn't wait for TTS, narration delivered async

```typescript
// Server: publish narration
async function publishNarration(roomName: string, narration: NarrationReady): Promise<void> {
  const client = await getRedis();
  const channel = `${CONSTANTS.REDIS_NARRATION_CHANNEL_PREFIX}${roomName}`;
  await client.publish(channel, JSON.stringify(narration));
}
```

```python
# Agent: subscribe to narration
async def _subscribe_narration(self):
    channel = f"dreamweaver:narration:{self.room_name}"
    pubsub = self._redis.pubsub()
    await pubsub.subscribe(channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            narration = json.loads(message["data"])
            asyncio.create_task(self.play_narration(narration))
```

#### 2. Buffer Caps and Timeouts - DONE

- **MAX_PTT_SECONDS = 5**: Hard cap on PTT audio duration
- **MAX_AUDIO_BYTES = 480000**: 5 seconds at 48kHz mono 16-bit
- **STT_TIMEOUT_SECONDS = 8**: `asyncio.wait_for()` on transcription
- **TTS_TIMEOUT_SECONDS = 5**: `asyncio.wait_for()` on piper subprocess
- **Buffer cap enforcement**: Agent stops buffering when cap hit, logs warning

```python
# Buffer cap check in audio capture
if session.total_bytes + len(frame_data) > MAX_AUDIO_BYTES:
    if not session.capped:
        logger.warning("audio_buffer_capped", trace_id=trace_id)
        session.capped = True
    continue  # Skip frame
```

#### 3. Audio Normalization - DONE

- **RMS-based normalization**: Target -18dB
- **Applied to TTS output**: Before publishing to room
- **Clipping protection**: Uses `np.clip()` to prevent distortion

```python
def normalize_audio(audio_data: bytes, target_db: float = TARGET_RMS_DB) -> bytes:
    audio = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
    rms = np.sqrt(np.mean(audio ** 2))
    current_db = 20 * np.log10(rms / 32768.0)
    gain_db = target_db - current_db
    gain = 10 ** (gain_db / 20)
    audio = np.clip(audio * gain, -32768, 32767)
    return audio.astype(np.int16).tobytes()
```

#### 4. TraceId Correlation - DONE

- **BaseEvent extended**: `traceId?: string` field added
- **Uses pttSessionId**: As correlation ID across pipeline events
- **All events include traceId**: For end-to-end tracing
- **Server logs include trace_id**: Structured logging for observability

### Additional Improvements

- **16kHz resampling**: Audio resampled before Whisper for faster processing
- **tiny.en model**: Default Whisper model changed for speed
- **Redis dependency**: Added `redis>=5.0.0` to agent requirements
- **make verify_day3**: Verification script to check log events

### Event Flow (Day 4)

```
PTT button held → LiveKit track → Agent detects
  ↓
Agent: interrupt any active narration
Agent: buffer audio frames (max 5s / 480KB)
  ↓
PTT released → track ends
  ↓
Agent: transcribe via Whisper (timeout 8s)
Agent: emit COMMAND_TRANSCRIBED → Server
  ↓
Server: processCommand() → generate GM response
Server: validate against gm_policy
Server: publish NarrationReady → Redis
Server: return 202 Accepted
  ↓
Agent: receive NarrationReady from Redis subscription
Agent: generate TTS via piper (timeout 5s)
Agent: normalize audio (-18dB RMS)
Agent: publish ai_narration track
Agent: emit NARRATION_START
  ↓
Audio plays in room (all participants hear)
  ↓
If PTT during playback → interrupt → NARRATION_INTERRUPT
Else → complete → NARRATION_END
```

### Constants Added (packages/shared/events.ts)

```typescript
// Day 4 hardening: caps and timeouts
MAX_PTT_SECONDS: 5,
MAX_AUDIO_BYTES: 48000 * 5 * 2 * 1,  // 480KB
STT_TIMEOUT_SECONDS: 8,
GM_TIMEOUT_SECONDS: 3,
TTS_TIMEOUT_SECONDS: 5,
TARGET_RMS_DB: -18,
REDIS_NARRATION_CHANNEL_PREFIX: 'dreamweaver:narration:',
```

### Day 4 Done Criteria

| Criterion | Status |
|-----------|--------|
| Async narration via Redis | ✅ pub/sub working |
| Buffer capped at 5s | ✅ MAX_AUDIO_BYTES enforced |
| STT timeout 8s | ✅ asyncio.wait_for() |
| TTS timeout 5s | ✅ asyncio.wait_for() |
| Audio normalized | ✅ RMS to -18dB |
| TraceId correlation | ✅ pttSessionId used |

### Verification

Run `make verify_day3` in `infra/` to check for these log events:
- `ptt_audio_frames_started`
- `COMMAND_TRANSCRIBED`
- `narration_received_from_redis`
- `NARRATION_INTERRUPT` (on second PTT)

### Links

- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/agent/src/main.py
- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/index.ts
- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/events.ts

### Ready for Day 5

Day 4 hardening complete. The skeleton now has:
- Async event-driven architecture via Redis
- Protection against runaway audio/processing
- Consistent audio levels
- Full traceability across the pipeline

Ready for your review and Day 5 guidance.
