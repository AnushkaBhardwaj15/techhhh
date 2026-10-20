# 12 — Round Readiness and Live Operation

**What to build:** Administrators can safely prepare and operate one live Round at a time through explicit, idempotent state commands and committed real-time events.

**PRD traceability:** §§12–13, 31, 36, 51, 53; FR-003, FR-004; critical invariant 10.

**Blocked by:** 06 — Round Configuration; 07 — Key/Question Bank; 10 — Tickets; 11 — Real-Time Transport.

**Branch:** `feature/tombola_round_operation`

**Status:** done

## Scope and contracts

- Bun layers: Round command/read routes and schemas -> operation service -> pure readiness/transition domain <- repositories, idempotency, audit, and WebSocket boundaries.
- API: `POST /api/v1/admin/rounds/:id/ready|start|pause|resume|complete|cancel`; `Idempotency-Key` is required only on start and resume.
- READY requires enabled Patterns, at least 15 distinct eligible Question/Key pairs, and Tickets for every active Participant.
- Start enforces one ACTIVE Round globally and promotes a READY Event to LIVE in the same transaction. Completion requires explicit Admin confirmation; cancellation is allowed only from DRAFT or READY, and completed/cancelled Rounds never resume.
- Emit `ROUND_STARTED|PAUSED|RESUMED|COMPLETED` only after commit; append corresponding audit record within the transaction.
- Frontend: none; publishes Participant `GET /event` and `GET /round/current` authoritative state DTOs.

## Non-goals

- No Draw, recovery, automatic Round completion, generic status PATCH, or multiple simultaneous ACTIVE Rounds.

## Acceptance criteria

- [x] Pure Event/Round transition tables define every allowed and rejected path.
- [x] Generic PATCH cannot bypass transition commands or readiness checks.
- [x] Database locking prevents two Rounds becoming ACTIVE concurrently, including across Events.
- [x] Start/resume idempotent retries return the original result without duplicate audit or event delivery; other repeated commands follow their explicit state-transition result.

## Required scenarios

- Each valid/invalid state transition; missing Pattern/questions/Tickets; exactly 15 pairs boundary.
- First start promotes Event; later Round start in LIVE Event; concurrent starts same/different Event; paused Round and global-active rule.
- Same/new idempotency keys for start/resume; repeated ready/pause/complete/cancel follows the transition table; completed/cancelled recovery rejection.
- Auth/role/Event scope; no-current Event/Round reads; broadcast failure after commit; audit rollback before commit.

## Verification

Run transition truth tables, readiness service tests, two-connection concurrency tests, event/audit assertions, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes the approved transition/readiness table, command/read DTOs, and one test per scenario.
- [x] Global-active race, idempotency, transaction, audit, and post-commit event evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
