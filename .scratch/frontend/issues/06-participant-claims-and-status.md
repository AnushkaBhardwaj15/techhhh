# 06 — Participant Claim Submission and Status

**What to build:** /participant/claims plus ClaimPanel and accessible confirmation on the game screen.

**PRD traceability:** Frontend PRD §§22, 25, 26, 27, 43, 48, 49, 50, 53; §50 FR-FE-009, §50 FR-FE-010. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [05 — Server-Confirmed Marking and Tap Safety](05-server-confirmed-marking.md)

**Backend prerequisite:** Backend tickets 15 and 16: existing Claim service/domain owns eligibility and capacity; no client winning-pattern evaluator.

**Branch:** `feature/tombola_frontend_participant_claims_and_status`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 15 and 16: existing Claim service/domain owns eligibility and capacity; no client winning-pattern evaluator.
- **Frontend:** /participant/claims plus ClaimPanel and accessible confirmation on the game screen.
- **API/data:** POST /api/v1/participant/claims { roundId, pattern }; GET /api/v1/participant/claims; current Round patterns. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- List configured/enabled Pattern options with OPEN/CLOSED status from server data. Do not label a Pattern 'eligible now' or infer eligibility from marked-cell counts.
- Confirm Pattern and Round, suppress duplicate pending submission, and render server PENDING/VERIFIED/REJECTED status without inventing a winner.
- Poll/refetch own pending Claims while visible because no participant rejection event exists. Stop timers on terminal status, logout, or scope change; display truthful generic rejection text when no reason is returned.
- After a timeout reconcile existing Claims before an explicit retry; concurrent capacity closure and duplicate Claim responses must not be reported as a new win.

## Non-goals

No eligibility read endpoint, browser winner evaluation, automatic Claim, or invented rejection event.

## Acceptance criteria

- [x] Participant can submit an enabled/open Pattern, see pending status, and recover its eventual server result after refresh.
- [x] Incomplete Pattern, already-closed capacity, duplicate submission, and session errors remain backend decisions with understandable feedback.
- [x] No inferred 'incomplete pattern' rejection reason is shown for arbitrary admin rejection.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Each of five Pattern types; disabled/closed configuration; happy path and server-ineligible rejection.
- Double click; concurrent capacity closure; existing pending Claim; timeout after commit; duplicate response.
- Pending-to-verified/rejected through REST; missing reason; empty list; pagination; timer cleanup and account switch.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via ClaimPanel.test.tsx (11 tests), ParticipantClaims.test.tsx, and participant.spec.ts. Enabled/open Pattern selection, claim submission, terminal state polling, and rejection handling verified.
