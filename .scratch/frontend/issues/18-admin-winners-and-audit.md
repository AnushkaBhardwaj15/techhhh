# 18 — Admin Winner History and Audit Views

**What to build:** /admin/winners and /admin/audit tables with supported filters and explicit scope.

**PRD traceability:** Frontend PRD §§9, 25, 30, 45, 48, 57; §50 FR-FE-018. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [09 — Admin Dashboard and Navigation](09-admin-dashboard-and-navigation.md); [17 — Admin Claim Review and Adjudication](17-admin-claim-adjudication.md)

**Backend prerequisite:** Backend tickets 16 and 19: read-only Winner and redacted immutable Audit read services/repositories.

**Branch:** `feature/tombola_frontend_admin_winners_and_audit`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 16 and 19: read-only Winner and redacted immutable Audit read services/repositories.
- **Frontend:** /admin/winners and /admin/audit tables with supported filters and explicit scope.
- **API/data:** GET /api/v1/admin/winners; GET /api/v1/admin/audit; use actual filter/pagination schemas. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Display verified Winners by actual returned identity/Pattern/Round; never label pending/rejected Claims as Winners.
- Render supported Audit actor/action/date filters and stable server ordering/pagination; no local whole-dataset claim when only one page is loaded.
- Treat logs/metadata as untrusted text and display only permitted redacted fields; scope private Query keys to identity/Event filters.
- Link read views to supported operational context without adding edit/delete actions.

## Non-goals

No mutable Audit, Winner deletion, CSV export, analytics warehouse, or privacy-sensitive diagnostics.

## Acceptance criteria

- [x] Authorized staff can inspect actual Winner history and filter/page Audit records without data mixing.
- [x] Concurrent inserts do not cause the UI to fabricate missing/duplicate rows or change server chronology.
- [x] Private metadata remains protected from participant/public views and diagnostics.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- No/one/many Winners; multiple Patterns/Rounds; pending Claim excluded.
- Audit filters individually/combined; invalid date range; empty results; cursor/page boundary during insertion.
- Redacted/HTML-like metadata; 401/403/500; identity/Event change and stale response.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminWinners.test.tsx (8 tests), AdminAudit.test.tsx (12 tests), and admin-operations.spec.ts. Immutable winner list, pattern filtering, append-only audit event log, and single main landmark accessibility verified.
