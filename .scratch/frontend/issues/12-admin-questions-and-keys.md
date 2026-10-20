# 12 — Admin Question and Key Management

**What to build:** /admin/questions: Question/Key tables, association editor, supported search/filter and safe deletion.

**PRD traceability:** Frontend PRD §§5, 9, 25, 30, 31, 45, 48, 53; §50 FR-FE-014. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [11 — Admin Round and Pattern Configuration](11-admin-rounds-and-pattern-configuration.md)

**Backend prerequisite:** Backend ticket 07 plus [tracked contract implementation](https://github.com/saransh-sh/TechTombola-muacm/issues/21) for complete-scope search, used-state filters and per-row editability.

**Branch:** `feature/tombola_frontend_admin_questions_and_keys`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

**Contract decision:** G02 backend contract is implemented in stacked PR #28 (`feature/tombola_question_key_global_search`), verified with 13 PostgreSQL integration tests (147 total suite passed), 253 unit tests, typecheck, and build. Frontend in PR #24 consumes echoed filter metadata and disables locked edits. Full acceptance remains pending integration into the shared baseline.

## Scope and contracts

- **Backend:** Backend ticket 07 plus [issue #21](https://github.com/saransh-sh/TechTombola-muacm/issues/21): implement the agreed complete-scope search, used-state filters, echoed filter state, and `canEdit` fields.
- **Frontend:** /admin/questions: Question/Key tables, association editor, supported search/filter and safe deletion.
- **API/data:** GET/POST /api/v1/admin/keys; GET/PATCH /api/v1/admin/keys/:id; GET/POST /api/v1/admin/questions; GET/PATCH/DELETE /api/v1/admin/questions/:id. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Create/edit Questions and Keys and associate them using actual IDs; respect Event key pool and Round Question scope.
- Confirm removal of unused Questions and let backend enforce immutability once used. Do not invent a Key DELETE or bulk Question import endpoint.
- Search controls send the agreed complete-dataset filters and require echoed filter state before claiming results are filtered. Do not silently treat a loaded page as a global search result.
- Render question text as text; never expose management data through shared participant/display caches.

## Non-goals

No unsupported bulk import, invented key removal API, client-authoritative used flags, or backend extension without a scoped decision.

## Acceptance criteria

- [x] Supported create/update/delete/association actions persist, and used records cannot be silently rewritten.
- [x] Search/filter covers the agreed dataset and status semantics after G02 resolution.
- [x] Errors, empty/paginated tables, pending actions and immutable records have accessible feedback.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Create/edit/associate/delete; duplicate Key or association; invalid IDs; Event/Round mismatch.
- Used Question/Key edit denied; stale record; deletion confirmation; timeout/duplicate submission.
- Search/filter across pagination per resolved G02; no results; unsafe text; role matrix.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Verify issue #21 implementation and integration, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminQuestions.test.tsx (20 tests), adminQuestions.test.ts, and backend PR #28. Complete-dataset literal search, used filter confirmation, used record edit lock (canEdit === false), and unconfirmed filter fallback detection verified.
