# Risks & Mitigations

## Risk Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RISK MATRIX                                          │
│                                                                         │
│  Impact      │ Low          │ Medium        │ High                      │
│  ────────────┼──────────────┼───────────────┼─────────────────────────  │
│  High Prob   │ R4, R9       │ R1, R5        │ R2                        │
│  Med Prob    │ R8           │ R3, R6        │ R7                        │
│  Low Prob    │ R10          │ R11           │ R12                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## R1: Voice Latency Exceeds Target

**Risk:** End-to-end voice latency (speech → AI response audio) exceeds 2-second target, making gameplay feel sluggish.

**Probability:** Medium
**Impact:** Medium-High

**Causes:**
- STT processing time on CPU
- LLM inference time
- TTS generation time
- Network round-trip delays

**Mitigations:**
1. **Pre-generation:** Cache common responses (greetings, acknowledgments)
2. **Streaming:** Stream TTS audio as it generates, don't wait for complete
3. **Smaller models:** Use faster models (Whisper tiny, Phi-3 mini) if needed
4. **Filler phrases:** AI says "Hmm, let me think..." while processing
5. **GPU acceleration:** Ensure Ollama uses GPU if available

**Contingency:** If latency consistently > 3s, switch to cloud APIs temporarily (OpenAI Whisper, GPT-4o-mini, ElevenLabs)

**Owner:** Solo dev
**Review Date:** Day 5

---

## R2: WebRTC NAT Traversal Failures

**Risk:** Players behind strict NATs (CGNAT, corporate firewalls) cannot establish voice connections.

**Probability:** High
**Impact:** High (core feature broken)

**Causes:**
- Symmetric NATs block peer connections
- No TURN server configured
- Firewall rules blocking UDP

**Mitigations:**
1. **TURN server:** Deploy coturn on public IP (required, not optional)
2. **TCP fallback:** Enable TURN over TCP/443 (looks like HTTPS)
3. **Connection diagnostics:** Show connection quality in app
4. **Multiple STUN:** Use multiple STUN servers for redundancy

**Contingency:** If TURN insufficient, relay all audio through server (higher latency, works everywhere)

**Owner:** Solo dev
**Review Date:** Day 3

**TURN Server Setup:**
```bash
# Coturn minimal config
listening-port=3478
tls-listening-port=5349
realm=dreamweaver.yourdomain.com
server-name=dreamweaver.yourdomain.com
lt-cred-mech
user=dreamweaver:password
fingerprint
```

---

## R3: LLM Context Window Overflow

**Risk:** Long sessions exceed LLM context window, causing AI to "forget" earlier events.

**Probability:** Medium
**Impact:** Medium

**Causes:**
- Chat history grows unbounded
- Adventure context is large
- System prompt + rules take significant tokens

**Mitigations:**
1. **Rolling window:** Keep only last 15-20 turns in context
2. **Summarization:** Compress older turns into summary
3. **Key event pinning:** Mark critical events for preservation
4. **Smaller prompts:** Optimize system prompt tokens

**Contingency:** Use model with larger context (Llama 3 70B has 8k+, Claude has 100k)

**Owner:** Solo dev
**Review Date:** Day 6

**Token Budget:**
```
System prompt:     800 tokens
Adventure node:   1000 tokens
World state:       300 tokens
Summary:           500 tokens
Chat history:     2000 tokens
Output buffer:     400 tokens
────────────────────────────
Total:            5000 tokens (within 8k limit)
```

---

## R4: STT Accuracy Issues with Accents/Noise

**Risk:** Whisper misinterprets player speech due to accents, background car noise, or unclear speech.

**Probability:** High
**Impact:** Low-Medium

**Causes:**
- Road noise interferes with audio
- Regional accents not well-trained
- Mumbling or unclear speech
- Crosstalk between players

**Mitigations:**
1. **Noise filtering:** Apply noise gate before STT
2. **Confirmation:** AI repeats back unclear commands
3. **Retry prompt:** "I didn't catch that, could you repeat?"
4. **Larger model:** Use Whisper medium if small fails too often
5. **Context hints:** Provide likely vocabulary to STT

**Contingency:** Add explicit confirmation step for critical actions

**Owner:** Solo dev
**Review Date:** Day 4

---

## R5: Driving Distraction Incidents

**Risk:** Despite safety design, game causes driver distraction or unsafe behavior.

**Probability:** Medium
**Impact:** High (legal/safety)

**Causes:**
- Game too engaging during complex driving
- Unexpected loud sounds
- Urge to look at screen
- Mental overload during narration

**Mitigations:**
1. **No screen requirement:** Enforce at code level
2. **Attention checks:** Periodic "still with us?" prompts
3. **Integration:** Pause for nav prompts, calls
4. **User warning:** Clear disclaimer on launch
5. **Pacing control:** Limit decisions per minute

**Contingency:** Add explicit "I'm driving" mode with extra-conservative limits

**Owner:** Solo dev
**Review Date:** Day 10

**Disclaimer:**
```
DRIVING SAFETY WARNING

Dreamweaver is designed for hands-free, eyes-free use.
However, your primary responsibility is safe driving.

- If traffic requires attention, say "Pause"
- Never look at the screen while driving
- Never handle the phone while driving

By continuing, you accept responsibility for safe operation.
```

---

## R6: Session State Corruption

**Risk:** Game state becomes corrupted or inconsistent between players.

**Probability:** Medium
**Impact:** Medium

**Causes:**
- Race conditions in state updates
- Partial updates during disconnect
- Redis persistence failures
- Bug in state transition logic

**Mitigations:**
1. **Atomic updates:** Use Redis transactions
2. **State validation:** Schema validation on every change
3. **Checksums:** Detect divergence with state hashes
4. **Recovery:** Ability to reset to last known good state
5. **Logging:** Full audit trail of state changes

**Contingency:** "Something went wrong, resetting to last checkpoint" with state rollback

**Owner:** Solo dev
**Review Date:** Day 6

---

## R7: Solo Developer Burnout

**Risk:** 14-day sprint is unsustainable, leading to burnout or abandonment.

**Probability:** Medium
**Impact:** High (project fails)

**Causes:**
- Scope creep
- Technical blockers
- Unrealistic timeline
- No breaks

**Mitigations:**
1. **Strict scope:** MVP only, everything else deferred
2. **Daily milestones:** Visible progress daily
3. **8-hour days:** No heroics, sustainable pace
4. **Breaks:** 10 min every 2 hours, 1 day off mid-sprint
5. **Fallbacks:** Pre-planned scope cuts if needed

**Contingency:** Extend sprint to 21 days, cut features, or recruit help

**Owner:** Solo dev
**Review Date:** Day 7 (mid-sprint)

---

## R8: iOS App Store Rejection

**Risk:** Apple rejects TestFlight build due to microphone usage, incomplete features, or policy violation.

**Probability:** Medium
**Impact:** Low (can use Android, web fallback)

**Causes:**
- Microphone permission justification unclear
- "App not ready for users"
- Missing privacy policy
- Background audio issues

**Mitigations:**
1. **Clear purpose:** Explain microphone use in submission
2. **Privacy policy:** Write and link privacy policy
3. **Complete flow:** Ensure all stated features work
4. **Test on device:** Verify before submission

**Contingency:**
- Use Android for MVP testing
- Use Expo Development Client (no store needed)
- Add web client (WebRTC works in Safari)

**Owner:** Solo dev
**Review Date:** Day 13

---

## R9: AI Generates Inappropriate Content

**Risk:** LLM generates content that is offensive, inappropriate, or unsafe.

**Probability:** High (LLMs are unpredictable)
**Impact:** Low (private game, friends)

**Causes:**
- Prompt injection by players
- Edge cases in content policy
- Model hallucinations
- Insufficient guardrails

**Mitigations:**
1. **System prompt:** Strong content policy instructions
2. **Input sanitization:** Filter player input before LLM
3. **Output filtering:** Check response for red flags
4. **Model selection:** Use instruction-tuned models
5. **Easy escape:** AI can redirect narratively

**Contingency:** If repeated issues, add output moderation API

**Owner:** Solo dev
**Review Date:** Day 8

---

## R10: Hardware Failure (Homelab)

**Risk:** Proxmox server hardware fails, causing total service outage.

**Probability:** Low
**Impact:** Low (MVP, can restart)

**Causes:**
- Disk failure
- Power outage
- Memory failure
- Network switch failure

**Mitigations:**
1. **Daily backups:** Automated to external drive
2. **UPS:** Protect against power flickers
3. **Documentation:** Full setup documented for rebuild
4. **Cloud fallback:** Know how to deploy to VPS quickly

**Contingency:** Deploy to Hetzner/DigitalOcean ($5-20/mo)

**Owner:** Solo dev
**Review Date:** Day 13

---

## R11: Legal/Liability Concerns

**Risk:** User injury while driving leads to legal action.

**Probability:** Low
**Impact:** Medium-High

**Causes:**
- User ignores warnings
- Game causes distraction
- Perceived causation

**Mitigations:**
1. **Terms of service:** Clear disclaimer and liability waiver
2. **Warnings:** In-app safety warnings
3. **Safe design:** Technical enforcement of eyes-free
4. **Insurance:** Check homeowner's/umbrella coverage
5. **LLC:** Consider forming LLC for protection

**Contingency:** Consult lawyer if any incident occurs

**Owner:** Solo dev
**Review Date:** Before public launch

---

## R12: Competitor Launches Similar Product

**Risk:** Well-funded competitor launches similar voice RPG, making Dreamweaver obsolete.

**Probability:** Low
**Impact:** Medium

**Causes:**
- AI gaming is hot space
- Voice UX improving rapidly
- Big tech interest in car entertainment

**Mitigations:**
1. **Move fast:** Ship MVP, get users
2. **Differentiate:** Focus on driving use case specifically
3. **Community:** Build loyal user base
4. **Open source:** Consider open-sourcing to build ecosystem

**Contingency:** Pivot to specific niche competitor doesn't serve

**Owner:** Solo dev
**Review Date:** Post-launch

---

## Risk Review Schedule

| Day | Risks to Review | Decision Point |
|-----|-----------------|----------------|
| 3 | R1, R2, R4 | Voice working? |
| 5 | R1, R3 | AI integration stable? |
| 7 | R6, R7 | Multiplayer working? Burnout check |
| 10 | R5, R9 | Safety/content OK? |
| 13 | R8, R10 | Deployment ready? |
| 14 | All | Launch decision |

---

## Escalation Criteria

**Red Flag (Stop and reassess):**
- Critical feature completely blocked for > 1 day
- Safety concern identified with no clear fix
- Burnout symptoms (inability to focus, dread)

**Yellow Flag (Adjust plan):**
- Feature taking 2x estimated time
- Quality issues in implemented features
- Scope creep pressure

**Green Flag (Proceeding well):**
- Daily milestones met
- Tests passing
- Energy and motivation stable
