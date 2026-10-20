# 05 — Server-Confirmed Marking and Tap Safety

**What to build:** Ticket cell interaction on /participant/game, per-cell pending state, confirmation and rejection feedback.

**PRD traceability:** Frontend PRD §§15, 16, 17, 25, 38, 39, 43, 44, 48, 49, 59; §50 FR-FE-007, §50 FR-FE-008. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [04 — Live Draw Feed and Question/Key Reveal](04-live-draw-feed-and-reveal.md)

**Backend prerequisite:** Backend ticket 14: existing Mark route/service/domain/repository enforce ownership, ACTIVE Round, Draw validity, and duplicate safety.

**Branch:** `feature/tombola_frontend_server_confirmed_marking`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 14: existing Mark route/service/domain/repository enforce ownership, ACTIVE Round, Draw validity, and duplicate safety.
- **Frontend:** Ticket cell interaction on /participant/game, per-cell pending state, confirmation and rejection feedback.
- **API/data:** POST /api/v1/participant/tickets/:ticketId/marks; GET /api/v1/participant/ticket?roundId=<roundId>. Read the actual body schema before implementation. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Use a pending visual state followed by server-confirmed MARKED. Suppress repeated taps for the same pending cell, then reconcile the returned state or refetch.
- Present hints from known Draws, but treat all backend validation as authoritative. An error or ambiguous timeout must never create a permanent local mark; fetch current Ticket before offering a retry.
- Disable mutations during known disconnect, resync, pause, completion, cancellation, or recovery. Notifications never obscure the Ticket.
- The frontend PRD does not require undo. Do not add tap-again unmark accidentally; the existing DELETE API remains outside this slice unless scope is explicitly refined.

## Non-goals

No automatic marking, browser mark validation as authority, undo UI, offline replay, or backend rule changes.

## Acceptance criteria

- [x] Successful mark is confirmed immediately after the server response and survives reload; rejected/ambiguous actions recover safely.
- [x] A double tap does not dispatch duplicate pending operations; valid independent cells can be handled without corrupting state.
- [x] Ownership, undrawn-key, closed Round, session expiry, and network failures produce appropriate feedback.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Successful, already-marked, undrawn, wrong Ticket/cell, and stale Round attempts.
- Double tap; two independent cells; Draw/pause arriving during request; timeout after server commit; refresh during request.
- Rejected rollback; reconnect reconciliation; no localStorage game authority; reduced-motion confirmation.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via ParticipantTicket.test.tsx, marks.test.ts (4 tests), and participant.spec.ts. Server-confirmed marking, tap safety, immediate optimistic feedback with mutation rollback on failure, and duplicate tap debouncing verified.
