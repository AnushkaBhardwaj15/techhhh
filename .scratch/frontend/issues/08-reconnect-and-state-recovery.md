# 08 — Reconnect and Authoritative State Recovery

**What to build:** Connection banner, resync feedback, stale-state protection across participant routes.

**PRD traceability:** Frontend PRD §§3, 10, 20, 21, 22, 25, 43, 44, 52, 54, 58, 59, 66; §50 FR-FE-012, §50 FR-FE-020, §50 FR-FE-021. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [07 — Participant Winners and Results](07-participant-winners-and-results.md)

**Backend prerequisite:** Backend tickets 11, 12, 14–18: existing REST recovery and non-replayed WebSocket events; authenticated subscription restrictions must be respected.

**Branch:** `feature/tombola_frontend_reconnect_and_state_recovery`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 11, 12, 14–18: existing REST recovery and non-replayed WebSocket events; authenticated subscription restrictions must be respected.
- **Frontend:** Connection banner, resync feedback, stale-state protection across participant routes.
- **API/data:** Existing /me, participant Event/Round/Ticket/Draw/Claim/Win reads and authenticated /ws. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Reconnect with exponential backoff and a bounded attempt/delay policy documented in implementation; cancel retries on logout/unmount and offer manual retry after exhaustion.
- REST snapshots replace stale state on reconnect; reconcile events arriving during snapshots without regressing scope/sequence. Events have no replay cursor or fabricated durable event ID.
- On waiting, READY, completed, or interrupted states where authenticated sockets are rejected, use bounded REST observation instead of retrying indefinitely as if every rejection were transient.
- Preserve known display state during a temporary outage, visibly mark it stale, and block mutations until authenticated authoritative resync completes. Never queue gameplay writes offline.

## Non-goals

No offline mutation queue, replay protocol, localStorage authoritative state, or recovery domain logic.

## Acceptance criteria

- [x] Offline/online, tab suspension, refresh, session revocation, and Round transition recover the correct Ticket/Draws/Claims/Wins.
- [x] No lost or duplicate visual state appears from event/snapshot races, and old requests cannot update a new account/Round.
- [x] Retries, sockets, subscriptions, timers, and GSAP work are cleaned up after route/auth changes.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Network drop before/during mark or Claim; retry exhaustion and manual recovery; server restart.
- 401/revocation versus temporary failure; READY/RECOVERY_REQUIRED/COMPLETED socket rejection; new Round while offline.
- Delayed old snapshot; event during resync; duplicate event; browser wake and visibility change; listener/timer cleanup.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via ParticipantGame.test.tsx, realtime.test.tsx, and participant.spec.ts. WebSocket reconnect with REST snapshot reconciliation, stale event suppression, and state recovery without full page reload verified.
