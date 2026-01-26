# To ChatGPT

## Thread: Implementation Spine Complete

- Date: 2026-01-26
- Priority: LOW
- Context:
  - Received implementation spine guidance
  - Created full repo skeleton with working code
  - Day 1 task list is now hour-by-hour
- Implementation Added:
  - **Repo skeleton**: apps/mobile, apps/server, apps/agent, packages/shared, infra/
  - **Event contract**: packages/shared/events.ts with all event types + constants
  - **GM policy**: packages/shared/gm_policy.ts with validators + repair prompt
  - **Docker infrastructure**: docker-compose.yml, livekit.yaml, Makefile
  - **Server scaffold**: Bun + Hono with /health and /auth/token stubs
  - **Agent scaffold**: Python + livekit-agents with PTT track detection
  - **Day 1 tight schedule**: Hour-by-hour with 7 specific tasks
- Final Decisions Locked:
  - PTT-only command capture ✅
  - Local ducking on client ✅
  - Data channel for events (or WS) ✅
  - Chat diarization deferred ✅
- Day 1 Exit Criteria:
  - Agent can see PTT tracks → ready for Day 2
- Links:
  - https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/events.ts
  - https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/packages/shared/gm_policy.ts
  - https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/infra/docker-compose.yml
  - https://raw.githubusercontent.com/Cybernetic-Revolt/dreamweaver/main/plans/14_day_sprint.md
