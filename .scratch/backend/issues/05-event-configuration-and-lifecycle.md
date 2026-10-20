# 05 — Event Configuration and Lifecycle

**What to build:** Administrators can create, inspect, edit, and transition Events while immutable history and lifecycle rules remain server-authoritative.

**PRD traceability:** §§12, 36, 53; FR-003; critical invariants 10–12.

**Blocked by:** 02 — Audit Foundation; 03 — Authentication and Sessions.

**Branch:** `feature/tombola_event_lifecycle`

**Status:** done

## Scope and contracts

- Bun layers: Event routes/schemas -> service -> pure lifecycle domain <- Event repository and audit boundary.
- API: `GET/POST /api/v1/admin/events`, `PATCH /api/v1/admin/events/:id`.
- Generic PATCH edits metadata only. Explicit service commands enforce `DRAFT -> READY -> LIVE -> PAUSED -> LIVE -> COMPLETED` and permitted cancellation; ticket 12 owns live promotion through Round start.
- Event completion/cancellation never deletes Rounds, Draws, Tickets, Claims, or Winners.
- Frontend: none; publishes Event DTO and transition-error contracts.

## Non-goals

- No Round operation, ticket readiness, simultaneous Events, theming system, or historical deletion.

## Acceptance criteria

- [x] Event state transitions are pure domain logic with an exhaustive transition table.
- [x] Scheduled dates and status-dependent edit restrictions are validated.
- [x] No mutation endpoint can silently rewrite historical state.
- [x] Mutations are audited transactionally and reads are deterministically paginated.

## Required scenarios

- Every valid and invalid transition, including `COMPLETED -> LIVE` rejection and cancellation boundaries.
- Create/edit validation, time boundary errors, inactive actor, wrong role, missing Event, concurrent transition.
- Metadata editing before/after LIVE; historical child records retained; audit rollback.

## Verification

Run the complete Event transition truth table and route/repository integration tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes the approved transition table, API examples, and one passing test per scenario.
- [x] Concurrent transition and audit-rollback evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
