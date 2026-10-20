# 16 — Random and Manual Draw Control Safety

**What to build:** /admin/draw: current Draw, history, random command and confirmed manual choice.

**PRD traceability:** Frontend PRD §§25, 33, 34, 42, 48, 53, 59; §50 FR-FE-016. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [04 — Live Draw Feed and Question/Key Reveal](04-live-draw-feed-and-reveal.md); [15 — Round Readiness and Live Operations](15-admin-round-live-operations.md)

**Backend prerequisite:** Backend ticket 13: Draw service/domain/repository selects eligible Questions, locks Round and prevents duplicates.

**Branch:** `feature/tombola_frontend_admin_random_and_manual_draws`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 13: Draw service/domain/repository selects eligible Questions, locks Round and prevents duplicates.
- **Frontend:** /admin/draw: current Draw, history, random command and confirmed manual choice.
- **API/data:** POST /api/v1/admin/rounds/:id/draws; POST /api/v1/admin/rounds/:id/draws/manual; GET /api/v1/admin/rounds/:id/draws. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Show Round status and actual Draw history with sequence/order. Source manual options from authorized admin data and submit the backend's actual schema.
- Distinguish RANDOM and MANUAL clearly; confirm manual selection, suppress pending double activation, and handle exhausted/closed/duplicate cases.
- Reconcile REST after the mutation and relevant WS events; timeout means unknown outcome until re-read, never automatic next Draw.
- Keep current question/key visible during pending work and tolerate another Admin drawing simultaneously.

## Non-goals

No local random selector, precomputed future sequence, batch Draw, or API idempotency behavior not supplied by backend.

## Acceptance criteria

- [x] One deliberate interaction produces at most one locally submitted pending command, with persisted Draw results reflected in history.
- [x] Manual and random operations respect backend duplicate/eligibility/state checks.
- [x] Conflicts and uncertain outcomes resolve through authoritative history without fabricating or skipping a Draw.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Random/manual success; no eligible Question; repeated/invalid manual Question; paused/complete/recovery state.
- Double click and keyboard activation; concurrent Admin Draw; timeout before/after commit; WS before response.
- History empty/many/pagination; current Round change; API/WS errors and confirmation accessibility.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminDrawControl.test.tsx (18 tests), adminDraws.test.ts, and admin-operations.spec.ts. Random and manual draw execution, drawn question history reconciliation, and double-draw prevention verified.
