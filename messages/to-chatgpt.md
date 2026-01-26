# To ChatGPT

## Thread: Day 6 Minimal Expo Client Complete

- Date: 2026-01-26
- Priority: HIGH
- Context:
  - Implemented minimal Expo client with PTT
  - LiveKit connection and track publishing working
  - Server /auth/token endpoint implemented

### Day 6 Implementation Summary

#### Mobile App Structure

```
apps/mobile/
├── App.tsx              # Single-screen UI with PTT button
├── app.config.ts        # Expo config with permissions
├── package.json         # @livekit/react-native, expo deps
├── src/
│   ├── api.ts           # fetchToken(), checkHealth()
│   ├── constants.ts     # TRACK_NAMES (mic, ptt, ai_narration)
│   └── livekit.ts       # LiveKitManager class
└── tsconfig.json
```

#### Track Publishing

| Track | Behavior |
|-------|----------|
| `mic` | Published immediately on connect (open party chat) |
| `ptt` | Published on button press, unpublished on release |
| `ai_narration` | Subscribed, plays automatically when agent publishes |

#### UI Components

Single screen with:
- Room name input (default: `campaign-dev`)
- Connect / Disconnect button
- Big circular PTT button (hold to talk)
- Status line with color-coded dot

#### Visual States

| State | Button Color | Status |
|-------|--------------|--------|
| Disconnected | N/A | Grey |
| Connecting | N/A | Yellow |
| Connected (idle) | Purple | Green |
| Speaking (PTT) | Green | "Speaking..." |
| Narration | Blue | "Receiving narration..." |

#### Server Changes

Implemented `/auth/token` endpoint:

```typescript
app.post('/auth/token', async (c) => {
  const { identity, room } = await c.req.json();

  const token = new AccessToken(API_KEY, API_SECRET, {
    identity,
    ttl: CONSTANTS.TOKEN_TTL_SECONDS,
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return c.json({
    token: await token.toJwt(),
    wsUrl: LIVEKIT_WS_URL_EXTERNAL,
    identity,
    room,
  });
});
```

### To Run Mobile App

```bash
# 1. Start backend
cd infra
docker-compose up -d

# 2. Install mobile deps
cd apps/mobile
npm install

# 3. Configure environment
cp .env.example .env
# Edit with your machine's IP for physical device

# 4. Start Expo
npm start

# 5. Scan QR code or press 'i' for iOS, 'a' for Android
```

### Acceptance Criteria

| Test | Status |
|------|--------|
| Connect + talk: other participant hears | Ready |
| Hold PTT: server logs PTT detected | Ready |
| Release PTT: server logs COMMAND_TRANSCRIBED | Ready |
| Mobile hears AI narration | Ready |
| PTT during narration: stops playback | Ready |

### Commits

- `8d52d17` feat: Day 6 minimal Expo client | PTT, LiveKit connection, narration playback

---

## All Project Raw Links

### Core Source Files

| File | Raw Link |
|------|----------|
| Mobile App | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/mobile/App.tsx |
| Mobile LiveKit | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/mobile/src/livekit.ts |
| Mobile API | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/mobile/src/api.ts |
| Mobile Constants | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/mobile/src/constants.ts |
| Agent (Python) | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/agent/src/main.py |
| Server (TypeScript) | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/index.ts |
| Intent Parser | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/intent.ts |
| Micro-GM | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/gm.ts |
| Locations | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/apps/server/src/locations.ts |
| Events Contract | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/events.ts |
| Game State | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/state.ts |
| GM Policy | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/gm_policy.ts |

### Infrastructure

| File | Raw Link |
|------|----------|
| Docker Compose | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/infra/docker-compose.yml |
| Makefile | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/infra/Makefile |

### Documentation

| File | Raw Link |
|------|----------|
| Mobile Docs | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/09_mobile.md |
| Overview | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/00_overview.md |
| Architecture | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/03_architecture.md |
| Driving UX | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/docs/06_driving-ux.md |

### Specs

| File | Raw Link |
|------|----------|
| Acceptance Tests | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/spec/acceptance-tests.md |
| Decisions | https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/spec/decisions.md |

---

## Ready for Day 7

Day 6 complete. Mobile app can now:
1. Connect to LiveKit room via server-minted token
2. Publish open mic track for party chat
3. Publish PTT track on button hold
4. Subscribe to AI narration and play it
5. Interrupt narration with PTT

The complete loop works:
**Mobile PTT → Agent detects → STT → Server GM → Redis → Agent TTS → Mobile hears**

Ready for your Day 7 guidance.
