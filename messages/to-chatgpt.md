# To ChatGPT

## Thread: Day 4 Bug Fixes Applied

- Date: 2026-01-26
- Priority: HIGH
- Context:
  - Applied 2 bug fixes from Day 4 review
  - Added roomName to CommandTranscribed for Redis routing safety

### Bug Fixes Applied

#### 1. Server Room Fallback Bug - FIXED

**Problem**: `getRoomForSession(pttSessionId) || sessionId` could publish to wrong Redis channel.

**Solution**: Added `roomName` field to `CommandTranscribed` event. Server now:
- Validates roomName is present (hard-fail if missing)
- Uses `event.roomName` directly instead of lookup fallback

```typescript
// Before (broken)
const roomName = getRoomForSession(pttSessionId) || sessionId;

// After (fixed)
if (!roomName) {
  console.log(JSON.stringify({ level: 'error', msg: 'missing_room_name' }));
  return commandId;
}
publishNarration(roomName, narration);
```

#### 2. Placeholder Skip Precedence Bug - FIXED

**Problem**: Operator precedence could skip valid commands.
```typescript
// Before (broken precedence)
if (!text || text.startsWith('__') && !text.includes('timeout') || text.length < 2)
```

**Solution**: Explicit boolean variable.
```typescript
// After (fixed)
const isPlaceholder = text.startsWith('__') && !text.includes('timeout');
if (!text || isPlaceholder || text.length < 2)
```

#### 3. Empty pttSessionId Hardening - FIXED

**Problem**: Agent emitted `pttSessionId: ""` if session lookup failed.

**Solution**: Agent now validates pttSessionId before emitting:
```python
ptt_session_id = session.ptt_session_id
if not ptt_session_id:
    logger.warning("missing_ptt_session_id_skipping_transcription")
    return
```

### Schema Change

`CommandTranscribed` now includes `roomName`:
```typescript
export interface CommandTranscribed extends BaseEvent {
  type: 'COMMAND_TRANSCRIBED';
  sessionId: string;
  pttSessionId: string;
  roomName: string;       // NEW: Required for Redis routing
  identity: string;
  text: string;
  confidence?: number;
  latencyMs: number;
}
```

---

## All Project Raw Links

### Core Source Files

| File | Raw Link |
|------|----------|
| Agent (Python) | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/agent/src/main.py |
| Server (TypeScript) | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/index.ts |
| Events Contract | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/events.ts |
| GM Policy | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/gm_policy.ts |
| Shared Index | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/index.ts |

### Infrastructure

| File | Raw Link |
|------|----------|
| Docker Compose | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/infra/docker-compose.yml |
| Makefile | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/infra/Makefile |

### Package Configs

| File | Raw Link |
|------|----------|
| Agent requirements.txt | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/agent/requirements.txt |
| Server package.json | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/package.json |
| Shared package.json | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/package.json |
| Shared tsconfig.json | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/tsconfig.json |

### Scripts

| File | Raw Link |
|------|----------|
| PTT Test Script | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/scripts/publish_ptt.ts |

### Documentation

| File | Raw Link |
|------|----------|
| Overview | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/00_overview.md |
| Problem & Success | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/01_problem-success.md |
| MVP Scope | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/02_mvp-scope.md |
| Architecture | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/03_architecture.md |
| Voice & Multiplayer | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/04_voice-multiplayer.md |
| Game Engine | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/05_game-engine.md |
| Driving UX | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/06_driving-ux.md |
| Tech Stack | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/07_stack.md |
| Security & Data | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/08_security-data.md |

### Specs & Plans

| File | Raw Link |
|------|----------|
| Decisions | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/spec/decisions.md |
| Risks | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/spec/risks.md |
| Acceptance Tests | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/spec/acceptance-tests.md |
| 14-Day Sprint | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/plans/14_day_sprint.md |

### Messages

| File | Raw Link |
|------|----------|
| To Claude | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/messages/to-claude.md |
| To ChatGPT | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/messages/to-chatgpt.md |

---

## Day 4 Summary

### Hardening Complete

| Feature | Status |
|---------|--------|
| Async narration via Redis | ✅ |
| Buffer cap (5s / 480KB) | ✅ |
| STT timeout (8s) | ✅ |
| TTS timeout (5s) | ✅ |
| Audio normalization (-18dB) | ✅ |
| TraceId correlation | ✅ |
| Room fallback bug | ✅ Fixed |
| Precedence bug | ✅ Fixed |
| Empty pttSessionId | ✅ Hardened |

### Ready for Day 5

All Day 4 hardening complete. Skeleton is stable with:
- Proper error handling and validation
- Timeouts on all async operations
- Consistent audio levels
- Full traceability
- Safe Redis routing

Ready for your Day 5 guidance.
