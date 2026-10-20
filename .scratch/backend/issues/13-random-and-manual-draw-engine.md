# 13 — Random and Manual Draw Engine

**What to build:** Authorized Admins can create one immutable random or manual Draw at a time, with gap-free history, duplicate-Key protection, retry safety, and live delivery.

**PRD traceability:** §§20–23, 36, 51–52, 56; FR-009–FR-011; critical invariants 5–6, 11.

**Blocked by:** 07 — Key/Question Bank; 11 — Real-Time Transport; 12 — Round Operation.

**Branch:** `feature/tombola_draw_engine`

**Status:** done

## Scope and contracts

- Bun layers: Draw routes/schemas -> service -> pure selection/validation domain <- Draw/idempotency repositories, audit, and WebSocket boundaries.
- API: `POST /api/v1/admin/rounds/:id/draws`, `POST .../draws/manual` body `{ questionId }`, `GET .../draws`, and `GET /api/v1/participant/draws`; mutations require `Idempotency-Key`.
- Draw domain selects/validates an eligible undrawn Question. MVP forbids drawing the same Question or Key twice in a Round.
- Transaction locks Round sequence, persists continuous sequence, `RANDOM|MANUAL`, actor, and immutable Question-text/Key-value snapshots; unique constraints protect Question, Key, and sequence per Round.
- Commit precedes `DRAW_CREATED`; broadcast failure is observable/retryable but never rolls back or repeats the Draw.
- Frontend: none; participant history is chronological and exposes only already drawn content.

## Non-goals

- No draw undo/edit/delete, client-side randomness, duplicate-Key configuration, automatic scheduling, or broker-backed delivery.

## Acceptance criteria

- [x] Only ACTIVE Rounds accept Draws; an exhausted pool returns a stable conflict.
- [x] Concurrent same-key retries replay one Draw; independent commands serialize into distinct gap-free Draws.
- [x] Later Question/Key edits cannot alter historical responses.
- [x] Admin and Participant history apply strict role/scope and deterministic pagination/order.

## Required scenarios

- Random single/remaining/exhausted pool; manual valid/missing/inactive/wrong-Round/already-drawn Question.
- Same Key through another Question; inactive/paused/completed Round; unauthorized role.
- Same/new idempotency key, double-click, two Admins/two DB connections, rollback with no sequence gap.
- Snapshot immutability, participant future-data leak test, audit action by mode, post-commit broadcast failure.

## Verification

Run PRD draw test matrix, real transaction races, snapshot tests, API/WS integration tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes random/manual/history DTO and error examples and maps every scenario to a test.
- [x] Two-connection race, snapshot, idempotency, audit, and post-commit broadcast evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
