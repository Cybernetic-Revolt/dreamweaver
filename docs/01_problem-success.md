# Problem Statement & Success Criteria

## Problem Statement

**Core Problem:** Tabletop RPG experiences like HarmonQuest require full attention—reading, typing, looking at screens—making them impossible to enjoy while driving or during other hands-busy activities.

**Secondary Problems:**
- Existing voice assistants lack persistent narrative memory and multiplayer coordination
- Remote friends can't easily join spontaneous RPG sessions without complex setup
- AI game masters either railroad players or lose narrative coherence
- Current solutions require expensive infrastructure or technical expertise

## Target Users

| Persona | Context | Primary Need |
|---------|---------|--------------|
| **Commuter Driver** | 30-60 min daily drive, alone or with passengers | Entertainment that's 100% eyes-free, hands-free |
| **Road Trip Group** | 2-6 people, mixed local + remote participants | Shared experience that includes remote friends |
| **Casual RPG Fan** | Wants HarmonQuest vibes without prep work | Zero-setup, drop-in gameplay |

## Assumptions

- Users have smartphones with data connectivity (LTE minimum)
- Users can speak freely in their environment (car, home)
- Users tolerate AI narration quality comparable to current TTS (2024-2025 tier)
- Sessions last 15-90 minutes typically
- Party size: 2-5 players + AI Game Master

## Success Criteria

### MVP Success (Day 14)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Voice latency** | < 2 seconds from speech end to AI response start | Automated telemetry |
| **Session stability** | 90% of sessions complete without forced restart | Error logs |
| **Reconnection** | Player rejoins within 10 seconds after drop | Automated test |
| **Driving safety** | Zero required screen interactions during play | UX audit checklist |
| **Multiplayer sync** | All players hear same narration within 500ms | Timestamp comparison |

### Post-MVP Success (30-day horizon)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Session completion rate** | 70% of started sessions reach natural endpoint | Analytics |
| **Return rate** | 40% of users play 3+ sessions in first week | Analytics |
| **NPS (friends/family test)** | > 30 | Survey |
| **Hosting cost per session-hour** | < $0.50 | Infrastructure billing |

## Non-Goals for MVP

- Mobile app store deployment (TestFlight/sideload only)
- Rich visual UI (audio-only MVP)
- Persistent campaign saves (single-session adventures)
- Character sheet complexity (simplified stats)
- Combat with tactical positioning (theater-of-mind only)

## Key Constraints

1. **Self-hosted on homelab** → Must run on Proxmox, no cloud lock-in
2. **Budget** → No paid APIs beyond LLM inference (OpenAI/local)
3. **Timeline** → 14 days to playable MVP
4. **Safety** → Must never encourage driver to look at screen or take hands off wheel
