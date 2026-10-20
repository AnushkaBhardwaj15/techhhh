# 11 — Admin Round and Pattern Configuration

**What to build:** /admin/rounds: Event-scoped Round list/detail and Pattern configuration.

**PRD traceability:** Frontend PRD §§5, 9, 25, 27, 30, 48, 54 (section-defined requirements; no invented FR identifier). Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [10 — Admin Event Configuration and Lifecycle](10-admin-event-management.md)

**Backend prerequisite:** Backend ticket 06: Round/Pattern route/service/domain/repository own configuration and mutability.

**Branch:** `feature/tombola_frontend_admin_rounds_and_pattern_configuration`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 06: Round/Pattern route/service/domain/repository own configuration and mutability.
- **Frontend:** /admin/rounds: Event-scoped Round list/detail and Pattern configuration.
- **API/data:** GET/POST /api/v1/admin/rounds; GET/PATCH /api/v1/admin/rounds/:id. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Display sequence/name/status and five backend Pattern types, enabled flags, capacities and OPEN/CLOSED state.
- Validate form shape for UX; backend decides allowed capacities, sequence conflicts and configuration lock after lifecycle changes.
- Show pending, conflict, empty and permission states; preserve immutable history and refresh after mutations.

## Non-goals

No local eligibility calculation, new Pattern types, live controls, or ticket generation algorithm.

## Acceptance criteria

- [x] Configured Round and Pattern fields persist and reload exactly as accepted by backend.
- [x] Live/used configuration cannot be edited through an apparent bypass; server rejects remain visible.
- [x] Current Event scope is mandatory, and historical/terminal statuses are clearly distinguished.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Create/edit default and explicit Patterns; each Pattern type; capacity boundaries; invalid sequence/name.
- Duplicate sequence; immutable live configuration; concurrent admin edit; pending suppression.
- Empty/multiple Rounds; pagination; Event switch; form validation and focus after error.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminRounds.test.tsx (14 tests), adminRounds.test.ts, and admin-operations.spec.ts. Round configuration, winning pattern toggles and multi-winner capacities, and round status display verified.
