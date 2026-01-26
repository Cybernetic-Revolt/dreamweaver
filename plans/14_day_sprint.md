# 14-Day Sprint Plan

## Overview

This sprint delivers a playable Dreamweaver MVP: a voice-first, multiplayer AI RPG safe for driving.

**Goal:** By Day 14, 2-5 players can join a voice session and play through a 30-minute adventure with an AI Game Master, entirely hands-free.

## Sprint Timeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         14-DAY SPRINT                                   │
│                                                                         │
│  PHASE 1: Foundation (Days 1-3)                                        │
│  ├── Walking skeleton                                                   │
│  ├── Voice infrastructure                                               │
│  └── Basic server                                                       │
│                                                                         │
│  PHASE 2: Core Features (Days 4-7)                                     │
│  ├── AI integration                                                     │
│  ├── Game engine                                                        │
│  └── Multiplayer demo                                                   │
│                                                                         │
│  PHASE 3: Game Content (Days 8-10)                                     │
│  ├── Adventure creation                                                 │
│  ├── Character creation                                                 │
│  └── Voice commands                                                     │
│                                                                         │
│  PHASE 4: Polish & Ship (Days 11-14)                                   │
│  ├── Reconnection                                                       │
│  ├── Testing                                                            │
│  └── Deployment                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Day 1: Project Setup + Voice Proof of Concept

### Deliverables
- [ ] Repository structure created
- [ ] Bun + Hono server scaffolded
- [ ] React Native + Expo app scaffolded
- [ ] WebRTC voice connection between 2 clients (echo test)
- [ ] Basic health endpoint

### Tasks

```bash
# Morning: Server setup
mkdir -p server/{src/{routes,ws,game,ai,voice,data,utils},adventures}
cd server && bun init && bun add hono redis zod yaml nanoid

# Afternoon: Mobile setup
npx create-expo-app app --template tabs
cd app && npx expo install expo-av react-native-webrtc

# Evening: Voice POC
# - Simple WebRTC peer connection
# - Audio flows between two clients
# - Server acts as signaling relay
```

### Acceptance Check
- [ ] `curl http://localhost:3000/health` returns 200
- [ ] Expo app launches in simulator
- [ ] Two phones can hear each other via WebRTC

---

## Day 2: Session Management + Room Codes

### Deliverables
- [ ] Create session API endpoint
- [ ] Join session API endpoint
- [ ] Room code generation
- [ ] Redis session storage
- [ ] WebSocket connection handling

### Tasks

```typescript
// POST /api/sessions - Create new session
// GET /api/sessions/:code - Get session info
// WebSocket /ws - Connection upgrade

// Session state in Redis:
// session:{code} -> { id, hostId, status, createdAt }
// session:{code}:players -> Set of player IDs
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create session, return code |
| GET | `/api/sessions/:code` | Get session status |
| WS | `/ws` | WebSocket upgrade |

### Acceptance Check
- [ ] Create session returns 6-char room code
- [ ] Second client can join with room code
- [ ] Both clients receive player list updates
- [ ] Session survives server restart (Redis persistence)

---

## Day 3: Walking Skeleton Complete

### Deliverables
- [ ] Voice chat working between 3+ players
- [ ] Push-to-talk implementation
- [ ] Speaker identification (who is talking)
- [ ] Basic game state synchronization
- [ ] **MILESTONE: Walking skeleton complete**

### Tasks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WALKING SKELETON                                     │
│                                                                         │
│  Client A (Host)                                                        │
│      │                                                                  │
│      ├── Creates session ──> Server ──> Room code "ABC123"             │
│      │                                                                  │
│  Client B                                                               │
│      │                                                                  │
│      ├── Joins "ABC123" ──> Server ──> Notify A                        │
│      │                                                                  │
│  Both Clients                                                           │
│      │                                                                  │
│      ├── PTT sends audio ──> Server ──> Forwards to others             │
│      ├── Receive audio ──> Play through speaker                        │
│      └── State updates ──> Both see same session state                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Acceptance Check
- [ ] 3 players in voice chat simultaneously
- [ ] PTT shows who is speaking
- [ ] All players see same session state
- [ ] Player disconnect detected within 5 seconds

---

## Day 4: STT + LLM Integration

### Deliverables
- [ ] Whisper STT processing player speech
- [ ] Ollama LLM generating GM responses
- [ ] Text responses from AI based on player input
- [ ] Basic prompt template

### Tasks

```typescript
// Voice flow:
// Player audio -> STT -> Text -> LLM -> Response text

// STT service wrapper
async function transcribe(audio: Buffer): Promise<string>

// LLM service wrapper
async function generateResponse(
  context: GameContext,
  playerAction: string
): Promise<string>
```

### Acceptance Check
- [ ] Speak "Hello" -> STT returns "Hello"
- [ ] Send "I look around" -> LLM returns description
- [ ] Latency: speech end to response < 3 seconds

---

## Day 5: TTS + Audio Pipeline Complete

### Deliverables
- [ ] Piper TTS generating audio
- [ ] Audio streaming to clients
- [ ] Complete voice loop: speak -> AI responds with audio
- [ ] Voice activity detection (don't talk over players)

### Tasks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE VOICE LOOP                                  │
│                                                                         │
│  Player speaks ──> STT ──> Text ──> LLM ──> Response ──> TTS ──> Audio │
│                                                                         │
│  Timing:                                                                │
│  [Player: 2s] [STT: 0.5s] [LLM: 1s] [TTS: 0.5s] [Play: 5s]            │
│                                                                         │
│  Total latency target: < 2s from speech end to AI audio start          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Acceptance Check
- [ ] Speak action -> Hear AI response as audio
- [ ] AI waits for player to stop speaking
- [ ] Multiple players can interact with AI
- [ ] Audio quality is clear and understandable

---

## Day 6: Game State Machine

### Deliverables
- [ ] Game state schema implemented
- [ ] State transitions working
- [ ] Character data structure
- [ ] Inventory system (simplified)
- [ ] World flags system

### Tasks

```typescript
interface GameState {
  session: SessionData;
  characters: Map<string, Character>;
  currentNode: string;
  worldFlags: Map<string, any>;
  turnCount: number;
}

// State mutations through defined actions
function applyAction(state: GameState, action: GameAction): GameState
```

### Acceptance Check
- [ ] Character created and stored in state
- [ ] Inventory can be modified (add/remove item)
- [ ] World flag changes persist
- [ ] All players see synchronized state

---

## Day 7: Multiplayer Demo

### Deliverables
- [ ] Full multiplayer session working
- [ ] 3+ players interacting with AI GM
- [ ] State persists across turns
- [ ] **MILESTONE: Playable multiplayer demo**

### Demo Script

```
1. Host creates session on Phone A
2. Player 2 joins on Phone B
3. Player 3 joins on Phone C (or laptop)
4. Host: "Let's begin"
5. AI GM: Introduces scene
6. Player 2: "I search the room"
7. AI GM: Describes finding
8. Player 3: "I talk to the merchant"
9. AI GM: Merchant responds
10. Continue for 10 minutes
```

### Acceptance Check
- [ ] Demo script completes without crashes
- [ ] All players hear all narration
- [ ] State is consistent across clients
- [ ] Voice latency acceptable (< 3s response)

---

## Day 8: Voice Commands + Pause/Resume

### Deliverables
- [ ] "Pause" command working
- [ ] "Resume" command working
- [ ] "Recap" command working
- [ ] "Who's here" command working
- [ ] Command recognition system

### Tasks

```typescript
const COMMANDS = {
  pause: ['pause', 'pause game', 'hold on', 'wait'],
  resume: ['resume', 'continue', 'unpause', 'go'],
  recap: ['recap', 'what happened', 'summary', 'catch me up'],
  players: ['who\'s here', 'players', 'party', 'who joined']
};

function detectCommand(transcript: string): Command | null
```

### Acceptance Check
- [ ] Say "pause" -> Game pauses, all notified
- [ ] Say "resume" -> Game continues
- [ ] Say "recap" -> AI summarizes recent events
- [ ] Commands work mid-session

---

## Day 9: Character Creation Flow

### Deliverables
- [ ] Voice-driven character creation
- [ ] Name selection
- [ ] Archetype selection (Fighter/Mage/Rogue)
- [ ] Trait description
- [ ] Character stored in state

### Creation Flow

```
GM: "Welcome, adventurer. What shall I call you?"
Player: "My name is Theron"
GM: "Theron. Are you a Fighter, skilled in combat? A Mage, wielding
     arcane power? Or a Rogue, master of shadows?"
Player: "I'm a Fighter"
GM: "A warrior's path. What's one thing everyone notices about you?"
Player: "I have a scar across my left eye"
GM: "Theron the scarred Fighter. Your legend begins."
```

### Acceptance Check
- [ ] Character created entirely via voice
- [ ] Character data saved to game state
- [ ] AI references character details in play
- [ ] All players complete creation before adventure starts

---

## Day 10: Adventure Content

### Deliverables
- [ ] "The Goblin's Bargain" adventure written
- [ ] Adventure YAML schema defined
- [ ] Adventure loader implemented
- [ ] 30-45 minute playtime content

### Adventure Structure

```yaml
# adventures/goblin_cave.yaml
id: goblin_cave
title: "The Goblin's Bargain"
estimated_duration: 30

opening: |
  The road to Millbrook has grown dangerous...

nodes:
  - id: cave_entrance
    type: scene
    # ... 10-15 nodes total

endings:
  - id: victory
    condition: { flag: "goblin_chief_defeated" }
  - id: diplomatic
    condition: { flag: "treaty_signed" }
  - id: retreat
    condition: { flag: "party_fled" }
```

### Acceptance Check
- [ ] Adventure loads from YAML
- [ ] All nodes reachable through play
- [ ] Multiple endings possible
- [ ] Playthrough takes 25-40 minutes

---

## Day 11: Reconnection Logic

### Deliverables
- [ ] Client reconnect on disconnect
- [ ] State sync on reconnect
- [ ] Player slot held for 60 seconds
- [ ] Other players notified of disconnect/reconnect

### Reconnection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RECONNECTION PROTOCOL                                │
│                                                                         │
│  1. Client detects disconnect (WebSocket close)                        │
│  2. Client shows "Reconnecting..." (voice: "Connection lost")          │
│  3. Exponential backoff: 1s, 2s, 4s, 8s, 16s                          │
│  4. Server holds slot 60 seconds                                       │
│  5. On reconnect:                                                      │
│     a. Verify player identity                                          │
│     b. Send full state snapshot                                        │
│     c. Resume voice channel                                            │
│  6. AI: "Welcome back, [name]. [Brief recap if missed content]"       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Acceptance Check
- [ ] Airplane mode toggle -> Auto reconnect
- [ ] State matches after reconnect
- [ ] Other players notified of reconnect
- [ ] Voice channel resumes

---

## Day 12: Integration Testing

### Deliverables
- [ ] End-to-end test suite
- [ ] Load testing (5 concurrent sessions)
- [ ] Error handling for common failures
- [ ] Bug fixes from testing

### Test Scenarios

```typescript
describe('Full Game Flow', () => {
  it('completes session with 3 players', async () => {
    // Create session
    // 2 players join
    // Character creation for all
    // 10 turns of gameplay
    // End session
    // Verify state cleanup
  });

  it('handles player disconnect/reconnect', async () => {
    // Mid-session disconnect
    // 30 second wait
    // Reconnect
    // Verify state sync
  });

  it('handles AI service timeout', async () => {
    // Mock LLM timeout
    // Verify fallback response
    // Verify retry behavior
  });
});
```

### Acceptance Check
- [ ] All test scenarios pass
- [ ] 5 simultaneous sessions stable
- [ ] No memory leaks over 1 hour
- [ ] Error messages are user-friendly

---

## Day 13: Deployment + Documentation

### Deliverables
- [ ] Server deployed to Proxmox
- [ ] TURN server configured
- [ ] TLS certificates installed
- [ ] Deployment documentation
- [ ] TestFlight build (if Apple developer account ready)

### Deployment Checklist

```bash
# Proxmox LXC setup
pct create 200 local:vztmpl/debian-12-standard.tar.zst \
  --hostname dreamweaver --memory 4096 --cores 2 \
  --rootfs local-lvm:20

# Install dependencies
apt update && apt install -y nginx redis-server

# Deploy application
git clone <repo> /opt/dreamweaver
cd /opt/dreamweaver/server && bun install

# Configure nginx + TLS
certbot --nginx -d dreamweaver.yourdomain.com

# Start services
systemctl enable --now dreamweaver redis
```

### Acceptance Check
- [ ] Server reachable at https://dreamweaver.domain.com
- [ ] Voice works over internet (not just LAN)
- [ ] Service survives reboot
- [ ] Logs rotating properly

---

## Day 14: Polish + Launch

### Deliverables
- [ ] Final playtest with friends
- [ ] Critical bug fixes
- [ ] Performance optimizations
- [ ] **MILESTONE: MVP Complete**

### Launch Checklist

- [ ] Full playthrough recorded (bug-free)
- [ ] All acceptance tests pass
- [ ] Documentation complete
- [ ] Backup procedures documented
- [ ] Monitoring dashboard created (optional)
- [ ] Invite 3-5 friends for real test

### Success Criteria Verification

| Metric | Target | Actual |
|--------|--------|--------|
| Voice latency | < 2s | _____ |
| Session stability | 90% | _____ |
| Reconnection | < 10s | _____ |
| Driving safety | 0 screen interactions | _____ |

---

## Repository Structure (Final)

```
dreamweaver/
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── ws/
│   │   ├── game/
│   │   ├── ai/
│   │   ├── voice/
│   │   └── data/
│   ├── adventures/
│   │   └── goblin_cave.yaml
│   ├── package.json
│   └── Dockerfile
├── app/
│   ├── app/
│   ├── components/
│   ├── services/
│   ├── stores/
│   └── package.json
├── docs/
│   ├── 00_overview.md
│   ├── ... (all planning docs)
├── spec/
│   ├── decisions.md
│   ├── risks.md
│   └── acceptance-tests.md
├── plans/
│   └── 14_day_sprint.md
├── api/
│   └── openapi.yaml
└── README.md
```

---

## Daily Standup Template

```markdown
## Day [N] Standup

### Yesterday
- [What was completed]

### Today
- [What will be done]

### Blockers
- [Any blockers or concerns]

### Demo
- [What can be demonstrated]
```

---

## Risk Checkpoints

| Day | Risk Check |
|-----|------------|
| 3 | Walking skeleton works? If not, simplify voice arch |
| 7 | Multiplayer demo works? If not, cut features |
| 10 | Adventure playable? If not, use simpler content |
| 12 | Tests passing? If not, prioritize critical paths |
| 14 | Launch ready? If not, extend by 2-3 days max |
