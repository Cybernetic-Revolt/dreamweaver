# Day 7: Productization

Day 7 focuses on making the app usable while driving - eliminating typing, handling reconnects gracefully, and adding deterministic controls.

## Features Implemented

### 1. Zero-Typing Join

**Problem:** Typing a room name while driving is dangerous and defeats the purpose.

**Solution:**
- Persistent `deviceId` stored in AsyncStorage
- `identity` derived from deviceId (e.g., `player-abc12345`)
- Default room: `campaign-{deviceIdPrefix}` (your personal campaign)
- **Quick Join** button connects with one tap
- Manual room input hidden by default, available as fallback

**Files:**
- `apps/mobile/src/storage.ts` - AsyncStorage helpers
- `apps/mobile/App.tsx` - Quick Join UI

### 2. Reconnect That Works

**Problem:** Phone drops for 10 seconds, comes back - PTT should just work.

**Solution:**
- On `RoomEvent.Reconnected`:
  - Verify mic track is still published
  - Republish mic if missing
  - Force-stop any stuck PTT state
- Track `pttWasActiveOnDisconnect` to clean up properly

**Files:**
- `apps/mobile/src/livekit.ts` - `handleReconnect()` method

### 3. Reserved Commands (Bypass STT)

**Problem:** STT can be slow/noisy. Need deterministic control buttons.

**Solution:**
- Three buttons under PTT: **STOP**, **REPEAT**, **HELP**
- Send directly to server via `POST /command`
- Server processes through same GM flow, returns 202
- No audio capture, no STT latency

**API:**
```
POST /command
{
  "roomName": "campaign-abc12345",
  "identity": "player-abc12345",
  "text": "stop|repeat|help",
  "traceId": "cmd-1234567890"
}
```

**Files:**
- `apps/mobile/src/api.ts` - `sendCommand()` function
- `apps/mobile/App.tsx` - Command buttons
- `apps/server/src/index.ts` - `/command` endpoint

### 4. Narration Overlap Rule (Last-Write-Wins)

**Problem:** Multiple commands in quick succession cause audio piling up.

**Solution:**
- When new narration arrives, interrupt current one immediately
- Brief wait (50ms) for playback loop to notice
- Start new narration
- No audio overlap, clean transitions

**Files:**
- `apps/agent/src/main.py` - `play_narration()` with interruption

### 5. Debug Observability Line

**Problem:** Blind debugging on mobile is frustrating.

**Solution:**
- Single line at bottom of screen showing:
  - Connection state (CONNECTED/DISCONNECTED/RECONNECTING)
  - Mic published: Y/N
  - PTT publishing: Y/N
  - Last narration ID (first 8 chars)

**Example:**
```
CONNECTED | mic:Y | ptt:N | narr:abc12345
```

**Files:**
- `apps/mobile/src/livekit.ts` - `DebugState` interface, `onDebugChange` callback
- `apps/mobile/App.tsx` - Debug line UI

## Acceptance Tests

| Test | Expected Result |
|------|-----------------|
| Quick Join connects | < 5 seconds to connected state |
| Hold PTT → release | Narration plays within ~2s |
| Tap STOP during narration | Audio stops fast (<500ms) |
| Tap REPEAT | Last narration replays |
| Airplane mode 10s → reconnect | PTT works without touching anything |
| Two narrations back-to-back | Never overlap |

## Bug Fix

**Identity state bug (Day 6):**

```ts
// WRONG - identity becomes function reference
const [identity] = useState(generatePlayerId);

// CORRECT - calls function, stores string
const [identity] = useState(() => generatePlayerId());
```

Fixed by using persistent storage instead.

## Mobile Dependencies Added

```json
{
  "@react-native-async-storage/async-storage": "1.23.1",
  "expo-crypto": "~13.0.0"
}
```

## Next Steps (Day 8+)

- Session codes for multiplayer join
- Sound effects / haptic feedback
- Background audio mode
- Voice-only mode toggle
