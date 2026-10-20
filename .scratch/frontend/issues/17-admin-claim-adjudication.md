# 17 — Admin Claim Review and Adjudication

**What to build:** /admin/claims: pending queue, Claim details and confirmed Verify/Reject actions.

**PRD traceability:** Frontend PRD §§25, 29, 35, 48, 49, 53; §50 FR-FE-017. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [06 — Participant Claim Submission and Status](06-participant-claims-and-status.md); [15 — Round Readiness and Live Operations](15-admin-round-live-operations.md)

**Backend prerequisite:** Backend ticket 16: transactional Winner service/domain/repository decides eligibility, capacity and immutable Winner creation.

**Branch:** `feature/tombola_frontend_admin_claim_adjudication`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 16: transactional Winner service/domain/repository decides eligibility, capacity and immutable Winner creation.
- **Frontend:** /admin/claims: pending queue, Claim details and confirmed Verify/Reject actions.
- **API/data:** GET /api/v1/admin/claims; POST /api/v1/admin/claims/:id/verify; POST /api/v1/admin/claims/:id/reject. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Use actual authorized Claim details and statuses; refresh queue from WIN_CLAIM_CREATED/WINNER_VERIFIED or bounded REST observation.
- Require explicit confirmation, send actual rejection schema, suppress duplicate pending actions and render stale/adjudicated/capacity-conflict feedback.
- Only backend success or later authoritative state can establish VERIFIED. Never decide eligibility from Ticket marks or optimistic queue removal.
- After action/refetch update queue, dashboard and relevant Winner queries; protect confirmation from selected Claim changing underneath it.

## Non-goals

No frontend eligibility evaluator, Winner capacity counter, historical Winner editing, or fabricated rejection notification.

## Acceptance criteria

- [x] Admin can review and adjudicate a real Claim with persisted status and clear failure feedback.
- [x] Concurrent verifications of a capacity-limited Pattern cannot make the UI assert two locally awarded Winners.
- [x] Participant and unauthorized users cannot reach private queue data.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Verify/reject success; invalid reason/input; nonexistent/rejected/already-verified Claim.
- Two Admins same Claim; different Claims at last capacity; stale confirmation; repeat click; timeout after commit.
- Empty/paginated queue; incoming event while modal open; role/session change; cache invalidation.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via AdminClaims.test.tsx (15 tests), adminClaims.test.ts, and admin-operations.spec.ts. Real-time WIN_CLAIM_CREATED reception, claim adjudication (verify/reject), and capacity enforcement verified.
