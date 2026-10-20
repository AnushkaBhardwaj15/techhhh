# 07 — Participant Winners and Results

**What to build:** WinnerBanner, persistent verified Pattern/result state, /participant/results.

**PRD traceability:** Frontend PRD §§15, 19, 28, 49, 53, 58, 62, 63; §50 FR-FE-011. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [06 — Participant Claim Submission and Status](06-participant-claims-and-status.md)

**Backend prerequisite:** Backend ticket 16; [tracked contract implementation](https://github.com/saransh-sh/TechTombola-muacm/issues/20) must add backend-selected contributing cell IDs to own-wins REST and `WINNER_VERIFIED`.

**Branch:** `feature/tombola_frontend_participant_winners_and_results`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

**Contract decision:** G01 is decided: the backend selects eligible cell IDs. Early 5 returns the five eligible cells whose Keys appeared earliest by official Draw sequence; a line returns its five row cells; Full House returns all populated cells. Participant own-wins REST and `WINNER_VERIFIED` return identical evidence. The browser validates and displays supplied IDs only.

## Scope and contracts

- **Backend:** Backend ticket 16 plus [issue #20](https://github.com/saransh-sh/TechTombola-muacm/issues/20): candidate implementation is in `feature/tombola_winner_cell_evidence`; return server-selected cell IDs in own-wins REST and `WINNER_VERIFIED`.
- **Frontend:** WinnerBanner, persistent verified Pattern/result state, /participant/results.
- **API/data:** GET /api/v1/participant/wins; GET /api/v1/participant/claims; WINNER_VERIFIED and ROUND_COMPLETED events. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Use safe Winner events to refresh participant-specific wins; an event with only display name/Pattern does not establish that the current participant won.
- Keep verified Winner and Round result visible through refresh until authoritative scope changes. Distinguish own win, others' public win, pending Claim, rejection, and Round completion.
- Use controlled GSAP celebration with reduced-motion alternative and cleanup; do not block Ticket access.
- Consume the approved server-provided cell evidence once issue #20 is implemented; never recreate Early 5/line/Full House evaluation in React.

## Non-goals

No inferred winner identity, client Pattern evaluation, fabricated contributing cells, or extended celebration feature.

## Acceptance criteria

- [x] Winner/Pattern identity is server-confirmed and persists across refresh/reconnect; display-name collisions cannot award the local participant a win.
- [x] Completed/cancelled Round routes render truthful final state and no new mutation affordance.
- [x] Relevant winning cells are highlighted only using the resolved G01 contract; partial generic Winner UI does not satisfy the whole ticket.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Own/other/no Winner; duplicate winner names; multiple Patterns; capacity reached; pending/rejected Claim.
- Winner event before/after REST; duplicate events; Round completion during animation; refresh and next Round.
- Approved winning-cell evidence including Early 5 ambiguity; missing evidence; reduced motion and unmount.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Verify issue #20 implementation and REST/WS integration, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Candidate check evidence (2026-10-18): backend `bun run test` passed 253 tests/1,237 assertions; `bun run typecheck` and `bun run build` passed; `bun run test:integration` passed 144 tests/967 assertions using a fresh disposable PostgreSQL 17 container. Frontend suite passed 490 tests; frontend typecheck, lint, deployment-config checks, production build and local browser login smoke passed. Two-axis review found no remaining findings. The code remains uncommitted/unmerged and hosted integration is pending.

