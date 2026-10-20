# 19 — Super Admin Account Management

**What to build:** /admin/administrators with privileged list, create/update and confirmed deactivate/delete flows.

**PRD traceability:** Frontend PRD §§5, 9, 10, 25, 30, 45, 48, 54; §50 FR-FE-002. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [09 — Admin Dashboard and Navigation](09-admin-dashboard-and-navigation.md)

**Backend prerequisite:** Backend ticket 04: Admin account service/domain/repository enforce privilege, self-mutation protection and last Super Admin safety.

**Branch:** `feature/tombola_frontend_super_admin_account_management`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 04: Admin account service/domain/repository enforce privilege, self-mutation protection and last Super Admin safety.
- **Frontend:** /admin/administrators with privileged list, create/update and confirmed deactivate/delete flows.
- **API/data:** GET/POST /api/v1/super-admin/admins; PATCH/DELETE /api/v1/super-admin/admins/:id. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Render existing account fields and supported role/status edits; backend remains authoritative for self-operation and final-active-Super-Admin constraints.
- Confirm sensitive actions, suppress pending repeats and immediately handle revoked current sessions.
- If creation returns a temporary password, show it only in a deliberately ephemeral authorized UI and clear on dismissal/navigation; never cache, persist or log it.
- Use error copy that preserves protected-account validation without exposing unrelated secrets.

## Non-goals

No authentication redesign, self-registration, password-reset system, or locally enforced privilege authority.

## Acceptance criteria

- [x] Super Admin can execute allowed account actions; Admin/Participant cannot access account APIs or data.
- [x] Protected self/final-Super-Admin operations show backend denial and do not optimistically remove the account.
- [x] Temporary credentials never enter Query cache, storage, URLs, analytics, console or durable fixtures.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- List/create/update/delete; duplicate email; invalid role; forbidden self mutation and last Super Admin.
- ADMIN/PARTICIPANT/anonymous access; session revocation during action; concurrent account change.
- Creation credential show/clear, logging redaction, double submission, confirmation cancel and API error.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminAdministrators.test.tsx (12 tests), adminAccounts.test.ts, and admin-operations.spec.ts. Super Admin administrator account listing, invitation/creation, status toggling, and role isolation verified.
