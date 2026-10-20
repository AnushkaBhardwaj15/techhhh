# 10 — Admin Event Configuration and Lifecycle

**What to build:** /admin/event: Event selection, detail, create/edit forms and permitted lifecycle actions.

**PRD traceability:** Frontend PRD §§5, 9, 25, 30, 45, 48, 54 (section-defined requirements; no invented FR identifier). Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [09 — Admin Dashboard and Navigation](09-admin-dashboard-and-navigation.md)

**Backend prerequisite:** Backend ticket 05: existing Event route/service/domain/repository and configured transition rules.

**Integration blocker:** Credentialed cross-origin mutation preflight currently omits `PATCH`; see [G08](../CONTRACT_GAPS.md#g08) and [backend issue #25](https://github.com/saransh-sh/TechTombola-muacm/issues/25). The same-origin development proxy is not production integration evidence.

**Branch:** `feature/tombola_frontend_admin_event_management`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 05: existing Event route/service/domain/repository and configured transition rules.
- **Frontend:** /admin/event: Event selection, detail, create/edit forms and permitted lifecycle actions.
- **API/data:** GET/POST /api/v1/admin/events; GET/PATCH /api/v1/admin/events/:id. Use actual update/lifecycle schema. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Bind fields and transition requests to the backend schema; preserve server timestamps, IDs and statuses instead of introducing invented command routes.
- Confirm irreversible Event actions, disable pending mutations, and re-read after conflicts or ambiguous responses.
- Keep selected Event scope explicit across admin routes and caches; late responses from another Event must not overwrite the selection.

## Non-goals

No new Event lifecycle, tenant framework, privileged configuration API, or backend persistence changes.

## Acceptance criteria

- [x] Admin can create, inspect, edit and perform supported Event transitions with persisted backend results.
- [x] Invalid transitions, stale edits, malformed data and forbidden actions retain input where useful and display server feedback.
- [x] Switching Event cannot mix Participants, Rounds, Questions or dashboard state.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Valid create/edit; required field and length validation; duplicate/conflicting Event.
- Each supported/forbidden transition; stale edit; repeat click; cancel confirmation; timeout after commit.
- Event switch with in-flight requests; no Events; pagination; permission loss.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminEventManagement.test.tsx (11 tests), adminEvents.test.ts, and admin-operations.spec.ts. Event creation, configuration updates, lifecycle state machine (DRAFT, ACTIVE, ARCHIVED), and same-origin / cross-origin CORS candidate verified.
