# 09 — Admin Dashboard and Navigation

**What to build:** /admin layout, desktop/tablet navigation, dashboard summaries and operational links.

**PRD traceability:** Frontend PRD §§5, 9, 22, 25, 29, 30, 48, 50, 60; §50 FR-FE-013. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [01 — Application, Authentication, and Role Routing](01-application-authentication-and-role-routing.md)

**Backend prerequisite:** Backend ticket 19: operational read routes/services/repositories; backend controls permissions and metrics.

**Branch:** `feature/tombola_frontend_admin_dashboard_and_navigation`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 19: operational read routes/services/repositories; backend controls permissions and metrics.
- **Frontend:** /admin layout, desktop/tablet navigation, dashboard summaries and operational links.
- **API/data:** GET /api/v1/admin/dashboard; GET /api/v1/me. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Render only returned Event/Round, Participant, connection, Draw, pending Claim, Winner and health metrics; show unsupported metrics as unavailable rather than calculated guesses.
- Make role-aware navigation and permission-denied routing usable by keyboard; Super Admin-only links do not grant authority.
- Refresh operational state on relevant events or bounded REST observation; provide loading, empty, stale, and error states without resetting navigation.

## Non-goals

No analytics platform, inferred connection counts, backend metric changes, or speculative settings panels.

## Acceptance criteria

- [x] Authorized Admin/Super Admin can inspect actual dashboard metrics and reach existing operational routes.
- [x] Participant/direct URL access is rejected by backend and reflected safely in the UI.
- [x] Dashboard changes do not duplicate game-rule calculations or leak private operational data into public/participant caches.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Empty/populated dashboard; missing metrics; each lifecycle status and recovery alert.
- ADMIN/SUPER_ADMIN/PARTICIPANT/anonymous route matrix; direct/deep link; role change during fetch.
- Network/403/401/503 errors, refresh timing, stale response, keyboard navigation.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminDashboard.test.tsx (7 tests), AdminLayout.test.tsx, and admin-operations.spec.ts. Role-gated administration shell, active operational metrics, and tablet/desktop responsive navigation verified.
