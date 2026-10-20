# 03 — Persistent Mobile Ticket Rendering

**What to build:** /participant/ticket and reusable ticket presentation on /participant/game.

**PRD traceability:** Frontend PRD §§13, 15, 16, 23, 38, 39, 40, 43, 53, 63; §50 FR-FE-003. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [02 — Participant Lobby and Lifecycle States](02-participant-lobby-and-lifecycle.md)

**Backend prerequisite:** Backend ticket 10: existing Ticket read route/service/repository; generation/immutability stays in Bun domain.

**Branch:** `feature/tombola_frontend_persistent_mobile_ticket`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 10: existing Ticket read route/service/repository; generation/immutability stays in Bun domain.
- **Frontend:** /participant/ticket and reusable ticket presentation on /participant/game.
- **API/data:** GET /api/v1/participant/ticket?roundId=<currentRoundId>. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Mirror the actual serialized Ticket DTO, including populated-cell coordinates; render empty positions as noninteractive spaces rather than generating game data.
- Display the assigned 3×9 grid with 15 populated cells in server positions. Preserve IDs, key strings and authoritative marked flags; never shuffle, regenerate, or persist an independent ticket.
- Use participant/Event/Round-scoped Query keys. Cover 320/375/390/430/768/1024px layouts with readable text, usable targets, no hover dependency, and keyboard semantics.

## Non-goals

No Ticket generation, mark mutation, winner evaluation, or local authoritative persistence.

## Acceptance criteria

- [x] Refresh, re-login, reconnect snapshot replacement, and reopening retain the exact backend Ticket and marks.
- [x] Long key values and empty cells remain distinguishable and accessible at supported widths.
- [x] Invalid/incomplete data fails visibly without manufacturing a replacement Ticket or borrowing another participant's cache.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Empty/loading/error/unallocated ticket; normal and long-key fixtures; exact coordinate/ID rendering.
- Same Ticket across refresh/login; Round switch; identity change; stale response cannot overwrite a new scope.
- Keyboard/focus/screen-reader labels, non-color state labels, narrow-width and zoom checks.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via ParticipantTicket.test.tsx (12 tests) and participant.spec.ts. Persistent 3x9 grid with 15 populated cells, keyboard navigation, inner scroll region with dynamic hint matching overflow across 320–1024px (measured 837/838px boundary) verified without page-level overflow.
