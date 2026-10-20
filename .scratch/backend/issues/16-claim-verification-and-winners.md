# 16 — Claim Verification and Winners

**What to build:** Admins can atomically verify or reject pending Claims, respect Pattern winner capacity under races, and publish immutable Winners.

**PRD traceability:** §§29–31, 36, 52, 57; FR-016; NFR-005; critical invariants 9, 12.

**Blocked by:** 11 — Real-Time Transport; 15 — Claim Submission.

**Branch:** `feature/tombola_winner_verification`

**Status:** done

## Scope and contracts

- Bun layers: Claim/Winner routes and schemas -> verification service -> pure eligibility/capacity domain <- repositories, idempotency, audit, and WebSocket boundaries.
- API: `GET /api/v1/admin/claims`, `POST .../claims/:id/verify`, `POST .../reject`, `GET /api/v1/admin/winners`, `GET /api/v1/participant/wins`; verify requires `Idempotency-Key`.
- Verification locks Claim and Pattern, recalculates eligibility, checks `maxWinners`, creates immutable Winner, and closes Pattern when capacity is reached in one transaction.
- Competing valid Claim loses with `REJECTED_PATTERN_ALREADY_CLOSED`; repeated verification replays the original result. Reject is idempotent but cannot overwrite VERIFIED.
- `WINNER_VERIFIED` broadcasts only after commit; Round completion remains an explicit ticket-12 command.
- Frontend: none; all history DTOs enforce role and Participant scope.

## Non-goals

- No automatic verification, Winner deletion, Pattern reopening, automatic Round completion, or notification provider.

## Acceptance criteria

- [x] Arbitrary configured `maxWinners >= 1` is enforced under concurrent transactions.
- [x] Winner stores Claim, Participant, Round, Pattern, verifier, and timestamp and is never silently deleted.
- [x] Claim and Winner state cannot diverge on rollback or broadcast failure.
- [x] Audit action and public event contain safe display data only.

## Implementation evidence

- Capacity and eligibility domain scenarios: `backend/src/modules/claims/winner.domain.test.ts`.
- Verification/rejection, idempotency, transaction rollback, and post-commit broadcast failure: `backend/src/modules/claims/winner.service.test.ts` and `backend/tests/integration/claim-submission.test.ts`.
- Real PostgreSQL final-slot race with two connections and role/history isolation: `backend/tests/integration/claim-submission.test.ts`.
- Clarified pre-start-only cancellation is covered by `backend/tests/unit/round-state.test.ts` and `backend/tests/integration/round-operation.test.ts`.
- Full backend unit, integration, typecheck, lint, and build commands pass on this branch.

## Required scenarios

- Verify eligible/ineligible-stale Claim; reject pending; verify/reject repeated; reject verified; verify rejected.
- Capacity 1 and greater than 1; two real DB connections racing for final slot; loser status and no duplicate Winner.
- Closed/disabled Pattern, wrong Event/Admin scope, missing Claim, malformed ID, Participant denied.
- Same/new idempotency key, transaction rollback, broadcast failure, participant/admin history isolation.

## Verification

Run eligibility recheck tests, two-connection winner races, state-machine/API/security/WS tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes verify/reject/history/idempotent replay DTO and error examples and maps every scenario to a test.
- [x] Final-slot race, rollback, audit, history isolation, and post-commit broadcast evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
