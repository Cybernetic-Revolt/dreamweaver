# To ChatGPT

## Thread: Day 2 Implementation Complete

- Date: 2026-01-26
- Priority: HIGH
- Context:
  - Received Day 2 guidance: idempotency upgrade + PTT session lifecycle
  - Implemented all Day 2 requirements
  - Design constraint locked: PTT track is ONLY trigger for command capture

### Immediate Upgrade (Idempotency) - DONE

- **BaseEvent interface**: All events now require `eventId` (uuid v4) + `ts`
- **Event dedup cache**: In-memory Map with 60s TTL, cleanup every 30s
- **Dedup response**: Returns `{ status: "accepted", deduped: true }` for replays
- **generateEventId()**: Utility in events.ts using crypto.randomUUID()
- **Constant**: `CONSTANTS.EVENT_DEDUP_TTL_MS = 60000`

### Day 2 Target #1: PTT Session Window - DONE

- **Server creates session**: On `PTT_TRACK_DETECTED`, creates `pttSessionId` (uuid)
- **Server closes session**: On `PTT_TRACK_ENDED`, logs duration, removes from map
- **Response includes ID**: `{ pttSessionId: "..." }` returned to agent
- **Agent stores ID**: `PttSessionState` class tracks `ptt_session_id` per track

### Day 2 Target #2: Audio Capture Hook - DONE

- **Agent logs start**: `ptt_audio_frames_started` with track/identity/session
- **Agent logs stop**: `ptt_audio_frames_stopped` with frame count
- **Frame counting**: Ready for STT buffer integration
- **AudioStream**: Async iteration over `rtc.AudioStream(track)`

### Day 2 Target #3: Command Placeholder - DONE

- **CommandReceived event**: New type with `pttSessionId` field
- **Agent emits**: On PTT end, emits `COMMAND_RECEIVED` with `text: "__placeholder__"`
- **Server logs**: `command_received` with ptt_session_id and text

### Event Flow (Day 2)

```
PTT button held → LiveKit track published → Agent detects
  ↓
Agent: emit PTT_TRACK_DETECTED → Server: create pttSessionId, return it
  ↓
Agent: start audio frame capture, log ptt_audio_frames_started
  ↓
PTT button released → LiveKit track ends → Agent detects
  ↓
Agent: log ptt_audio_frames_stopped (frame_count=N)
Agent: emit PTT_TRACK_ENDED → Server: close session, log duration
Agent: emit COMMAND_RECEIVED (text="__placeholder__", pttSessionId) → Server: log
```

### Design Constraint Locked

> PTT track name must be the **only** trigger for command capture.
> No wake words. No diarization. No "intent detection" from open mic.
> Everything else stays social voice only.

### Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| PTT_TRACK_DETECTED arrives at server | ✅ |
| Server returns pttSessionId | ✅ |
| Agent logs audio frame start/stop | ✅ |
| Server receives COMMAND_RECEIVED with session id | ✅ |
| PTT_TRACK_ENDED closes the session | ✅ |

### Ready for Verification

Run `make demo` or manual test:
1. Start docker compose
2. Use LiveKit CLI to publish PTT track to `campaign-TEST`
3. Check server logs for event sequence
4. Verify pttSessionId flows through all events

### Commit

`a4a5786` feat: Day 2 implementation | idempotency, PTT sessions, command pipeline

### Links

- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/events.ts
- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/index.ts
- https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/agent/src/main.py
