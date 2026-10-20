# 20 — System Health and Recovery Visibility

**What to build:** /admin/settings or the agreed system route within Admin; health/recovery panel and explicit operational links.

**PRD traceability:** Frontend PRD §§5, 9, 25, 29, 45, 48, 54, 57 (section-defined requirements; no invented FR identifier). Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [15 — Round Readiness and Live Operations](15-admin-round-live-operations.md); [19 — Super Admin Account Management](19-super-admin-account-management.md)

**Backend prerequisite:** Backend tickets 18 and 19: existing system/readiness read model and Admin Round recover operation; no implemented generic Super Admin recovery wildcard.

**Branch:** `feature/tombola_frontend_super_admin_system_and_recovery`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 18 and 19: existing system/readiness read model and Admin Round recover operation; no implemented generic Super Admin recovery wildcard.
- **Frontend:** /admin/settings or the agreed system route within Admin; health/recovery panel and explicit operational links.
- **API/data:** GET /api/v1/super-admin/system; existing POST /api/v1/admin/rounds/:id/recover when permitted. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Show returned version/readiness/dependency/recovery/migration/backup metadata where available; distinguish unavailable values from successful checks.
- Reuse confirmed Round recovery from ticket 15 under server authorization. Do not expose invented /super-admin/recovery/* controls.
- Render dependency outage and recovery-required states with safe diagnostics; no secrets/config dumps or inferred successful backups.
- Refresh with bounded observation, and distinguish stale last-known health from live successful reads.

## Non-goals

No restore-from-browser, secret viewer, infrastructure admin panel, backup scheduler, or generic recovery API.

## Acceptance criteria

- [x] Only Super Admin sees system-wide details; authorized Round recovery still follows its actual Admin contract.
- [x] Failed/unavailable dependencies and missing metadata are visible without implying the system is healthy.
- [x] When backend-reported recovery-required Rounds exist, a direct link opens the Admin Round operations workflow.
- [x] Recovery never automatically resumes a completed/interrupted Round or mutates historical Draws/Winners.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Healthy/degraded/database-unready/missing metadata; stale health and network outage.
- Role matrix and deep links; recover allowed/forbidden/already recovered; repeated command/timeout.
- Secret/redaction fixtures; refresh cleanup; session expiration and disabled action states.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminSystem.test.tsx (10 tests), adminOperations.test.ts, and admin-operations.spec.ts. System health telemetry, database/dependency status, stale data marking on transient error, 403 cache hiding, and recovery link verified.
