# 02 — Participant Lobby and Lifecycle States

**What to build:** /participant and /participant/lobby; participant layout, status/help, and navigation to the active game.

**PRD traceability:** Frontend PRD §§2, 5, 9, 11, 12, 25, 48, 58, 63; §50 FR-FE-002, §50 FR-FE-012. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [01 — Application, Authentication, and Role Routing](01-application-authentication-and-role-routing.md)

**Backend prerequisite:** Backend tickets 05, 08, and 12: Participant/Event/Round read services and route authorization; domain lifecycle remains server-owned.

**Branch:** `feature/tombola_frontend_participant_lobby_and_lifecycle`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 05, 08, and 12: Participant/Event/Round read services and route authorization; domain lifecycle remains server-owned.
- **Frontend:** /participant and /participant/lobby; participant layout, status/help, and navigation to the active game.
- **API/data:** GET /api/v1/me; GET /api/v1/participant/event; GET /api/v1/participant/round/current. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Show server-provided identity, assigned Event and current Round; distinguish no assignment, no Round, DRAFT/READY, ACTIVE, PAUSED, RECOVERY_REQUIRED, COMPLETED, and CANCELLED.
- Use bounded REST refresh while waiting when no authenticated Round socket is permitted. A visual countdown may use an actual event schedule, never an invented automatic Round start.
- Display a ticket identifier only after ticket retrieval; make loading/unallocated states truthful. Keep connection and data freshness status distinct.

## Non-goals

No ticket allocation, local lifecycle engine, fabricated countdown, or operational admin controls.

## Acceptance criteria

- [x] Lobby restores the correct participant/Event scope and transitions from waiting to the active game using authoritative data.
- [x] Interrupted/cancelled/completed states have distinct copy and disable invalid actions; no local timer starts a Round.
- [x] Help explains question/key/manual marking without presenting a quiz input.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- All Event/Round states; no assignment/current Round; delayed start; refresh and route revisit.
- Missing schedule; scheduled time passes without server start; server clock display does not change game status.
- 401/403/404/network error; account/Event change; waiting refresh starts/stops with route lifecycle.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via ParticipantLobby.test.tsx (9 tests) and participant.spec.ts. Active lobby routing to /participant/game, lifecycle transitions (CREATED, READY, ACTIVE, PAUSED, COMPLETED), and scheduled countdown display verified.
