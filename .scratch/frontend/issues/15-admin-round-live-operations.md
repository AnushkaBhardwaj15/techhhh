# 15 — Round Readiness and Live Operations

**What to build:** Round operational panel: readiness blockers, allocation, start/pause/resume/complete/cancel/recover confirmations.

**PRD traceability:** Frontend PRD §§5, 25, 29, 30, 33, 48, 54, 58, 59; §50 FR-FE-013, §50 FR-FE-016. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [11 — Admin Round and Pattern Configuration](11-admin-rounds-and-pattern-configuration.md); [12 — Admin Question and Key Management](12-admin-questions-and-keys.md); [13 — Admin Participant Management](13-admin-participant-management.md)

**Backend prerequisite:** Backend tickets 10, 12 and 18: Ticket allocation, readiness and lifecycle domain/services own validation and recovery.

**Branch:** `feature/tombola_frontend_admin_round_live_operations`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 10, 12 and 18: Ticket allocation, readiness and lifecycle domain/services own validation and recovery.
- **Frontend:** Round operational panel: readiness blockers, allocation, start/pause/resume/complete/cancel/recover confirmations.
- **API/data:** POST /api/v1/admin/rounds/:id/tickets/generate; POST /api/v1/admin/rounds/:id/ready|start|pause|resume|complete|cancel|recover; GET /api/v1/admin/rounds/:id. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Show backend readiness failures and supported operation results; do not reimplement readiness checks or infer that all allocation prerequisites passed.
- Send Idempotency-Key only where the actual backend schema requires it. Retain the same key for an explicit retry of the same logical command; changed intent receives a new key.
- Confirm irreversible actions and identify selected Event/Round; suppress pending repeats and refresh on conflict/ambiguous outcome.
- Distinguish RECOVERY_REQUIRED from PAUSED. Recovery does not imply auto-resume, and completed/cancelled history remains immutable.

## Non-goals

No local state machine authority, ticket generator, automatic resume, or generic repair commands.

## Acceptance criteria

- [x] Supported lifecycle operations and allocation follow actual server permissions/status transitions.
- [x] Stale concurrent operators and uncertain network outcomes cannot silently dispatch fresh destructive commands.
- [x] Operational UI exposes readiness/recovery feedback without claiming local authority.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Successful and blocked readiness; zero/partial/already-generated Ticket allocation; duplicate command retry.
- Start/pause/resume/complete/cancel/recover allowed and forbidden states; recovery followed by explicit resume.
- Concurrent admin transition; wrong Event/Round; timeout after commit; key retention/reset and permission loss.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminRoundOperations.test.tsx (16 tests), adminOperations.test.ts, and admin-operations.spec.ts. Round operational checklist, START, PAUSE, RESUME, and COMPLETE transitions with authoritative confirmation verified.
