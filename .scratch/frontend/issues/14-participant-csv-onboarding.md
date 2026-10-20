# 14 — CSV Preview, Import Confirmation, and Results

**What to build:** CSV file selection, local preview, validation presentation, confirm, indeterminate processing and completion summary.

**PRD traceability:** Frontend PRD §§25, 32, 45, 48, 54; §50 FR-FE-015. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [13 — Admin Participant Management](13-admin-participant-management.md)

**Backend prerequisite:** Backend ticket 09: synchronous CSV import and credential-delivery/report service remain authoritative for database/business validation. Per-Participant delivery result evidence is tracked in [issue #18](https://github.com/saransh-sh/TechTombola-muacm/issues/18).

**Branch:** `feature/tombola_frontend_participant_csv_onboarding`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 09: synchronous CSV import and credential-delivery/report service remain authoritative for database/business validation.
- **Frontend:** CSV file selection, local preview, validation presentation, confirm, indeterminate processing and completion summary.
- **API/data:** POST /api/v1/admin/participants/import; use the actual multipart field/schema and returned import report. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Preview a bounded file locally and distinguish syntax/header feedback from server-side duplicate/Event/transaction validation. Do not duplicate authoritative onboarding rules.
- After explicit confirmation submit once, show indeterminate processing and the actual server row/count/error results. Label per-Participant credential-delivery detail unavailable until issue #18 is implemented; never infer it from counts.
- Use safe CSV parsing and the server's size/row/column limits; reject unsupported encoding/structure visibly and protect rendering from formula-like/HTML text.
- On network failure with unknown import outcome, re-read Participants and warn about ambiguity before a deliberate retry; do not manufacture row percentages or replay automatically.

## Non-goals

No dry-run server endpoint, async job/progress protocol, invented import history, or silent repeated credential emails.

## Acceptance criteria

- [x] The full select→preview→confirm→processing→actual result flow works with supported files.
- [x] Client preview never claims server duplicate validation or credential delivery has already succeeded.
- [x] Partial/atomic failures and ambiguous request outcomes are represented according to the real server report.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Valid CSV; BOM/quoted commas/newlines; missing/duplicate headers; malformed row; blank file.
- File/row limits; duplicate emails within file/database; server validation; credential-delivery failure.
- Confirm cancel; double submission; request timeout after commit; safe preview rendering and no password logging.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Verify issue #18 implementation and import integration, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminParticipantImport.test.tsx (13 tests), participantCsv.test.ts (10 tests), and admin-operations.spec.ts. Client-side CSV syntax preview, explicit confirmation dialog, indeterminate progress, and backend import error reporting verified.
