# Day 8: Quality, Stability & Packaging

Day 8 focuses on making the system reliable, observable, and easy to demo. No new features - just polish.

## Features Implemented

### 1. End-to-End Trace Timeline (TRACE_SUMMARY)

Every command emits a final `TRACE_SUMMARY` event with complete timing:

```json
{
  "type": "TRACE_SUMMARY",
  "traceId": "abc123",
  "roomName": "campaign-xyz",
  "identity": "player-abc",
  "intent": "look around",
  "ptt_ms": 0,
  "stt_ms": 150,
  "gm_ms": 12,
  "tts_ms": 450,
  "publish_ms": 25,
  "total_ms": 640,
  "result": "ok"
}
```

**Result values:**
- `ok` - Command completed successfully
- `timeout` - TTS or other service timed out
- `capped` - Narration was capped for driving safety
- `rejected` - Room was busy, command dropped
- `interrupted` - Narration was interrupted by STOP or new command
- `skipped` - Command was empty or in quiet mode

**Files:**
- `packages/shared/events.ts` - `TraceSummary` event type
- `apps/server/src/index.ts` - Server-side timing, TRACE_SUMMARY handler
- `apps/agent/src/main.py` - `_emit_trace_summary()` method

### 2. Single Active Command Per Room Lock

Prevents command interleaving when multiple users speak simultaneously:

```
Command 1 → [LOCK] → Process → [UNLOCK]
Command 2 → [BUSY] → 429 "One at a time."
```

**Behavior:**
- Room lock acquired when command processing starts
- Lock times out after 10 seconds (safety)
- Rejected commands return HTTP 429 with `reason: "busy"`

**Files:**
- `apps/server/src/index.ts` - `tryAcquireRoomLock()`, `releaseRoomLock()`

### 3. State Snapshot Durability Test

Verify SQLite state persists across container restart:

```bash
make verify_state
```

**Test flow:**
1. Send "look" command to create state
2. Verify state exists
3. Restart server container
4. Send "status" command
5. Verify location preserved

**Requirements:**
- SQLite database mounted as Docker volume (`server_data:/data`)
- Already configured in `docker-compose.yml`

### 4. Mobile Drive Mode Toggle

Safety boundary that controls UI and narration verbosity:

**Drive Mode ON (default):**
- Narration capped to 12 seconds
- Debug line hidden
- Minimal UI elements

**Drive Mode OFF (Stationary):**
- Full debug line visible
- Slightly richer narration allowed
- Transcript logging enabled

**Files:**
- `apps/mobile/App.tsx` - `driveMode` state, toggle UI

### 5. Packaging (demo_phone)

Easy setup for phone testing:

```bash
make demo_phone
```

**Outputs:**
- Your LAN IP address
- Required `.env` configuration
- Expo command to run
- Connectivity test

**Full demo from clean machine:**
```bash
git clone <repo>
cd dreamweaver/infra
cp .env.example .env  # Edit with your keys
make up
make demo_phone
# Follow instructions
```

## Acceptance Tests

| Test | Target | Metric |
|------|--------|--------|
| Voice → narration | < 2.0s | Median total_ms from TRACE_SUMMARY |
| Reconnect recovery | Works | Airplane mode 10s → PTT works |
| No narration overlap | Never | Last-write-wins interruption |
| State persists | Yes | `make verify_state` passes |
| STOP interrupts | < 250ms | Measured from button tap |

## Reliability Checklist

Run these before release:

- [ ] 5 reconnect cycles (airplane mode on/off)
- [ ] 10 PTT commands in a row
- [ ] 2 users issuing commands back-to-back
- [ ] Reserved STOP spam during narration

**What to watch for:**
- PTT track stuck "published"
- Mic unpublished after reconnect
- Narration overlap
- Redis subscription duplication (double playback)

## Performance Monitoring

View trace summaries in logs:

```bash
docker-compose logs server | grep trace_summary | tail -20
```

Example output:
```json
{"level":"info","msg":"trace_summary","trace_id":"abc123","ptt_ms":0,"stt_ms":142,"gm_ms":8,"tts_ms":380,"publish_ms":22,"total_ms":552,"result":"ok"}
```

## Room Lock Monitoring

```bash
docker-compose logs server | grep room_busy_rejected
```

If you see many rejections, users may be speaking too fast.

## Next Steps (Day 9+)

- Session codes for multiplayer
- Persistent preferences (Drive Mode, room history)
- Background audio mode
- Performance optimization (STT caching)
