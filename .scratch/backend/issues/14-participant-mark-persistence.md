# 14 — Participant Mark Persistence

**What to build:** Participants can persistently Mark and unmark their own populated Cells only after the Key has been officially drawn, without granting Mark state authority over Winners.

**PRD traceability:** §§24–25, 35, 45, 47, 50; FR-012, FR-013; critical invariants 7, 13.

**Blocked by:** 10 — Tickets; 12 — Round Operation; 13 — Draw Engine.

**Branch:** `feature/tombola_participant_marks`

**Status:** done

## Scope and contracts

- Bun layers: Mark routes/schemas -> service -> pure eligibility domain <- Mark/Ticket/Draw repositories and audit boundary.
- API: `POST /api/v1/participant/tickets/:ticketId/marks` body `{ cellId }`; `DELETE .../marks/:cellId`.
- Unique `(ticket_id, cell_id)` Mark with `marked_at`; both operations derive Participant/Event/Round ownership from Session.
- Mark is allowed only for a populated Cell whose Key appears in official Draw history while Round is ACTIVE. Unmark follows the same ACTIVE policy.
- Mark and unmark are idempotent; ownership failures use non-enumerating `404`; undrawn/empty Cell uses `422`.
- Frontend: none; Ticket DTO can expose current Mark state.

## Non-goals

- No automatic Marking, Mark-based Winner eligibility, marking while non-ACTIVE, cross-Ticket access, or WebSocket mutation.

## Acceptance criteria

- [x] Database foreign keys and uniqueness prevent cross-Ticket or duplicate Mark corruption.
- [x] A repeated Mark preserves the original timestamp; deleting an absent Mark succeeds without a new audit event.
- [x] `MARK_CREATED` and `MARK_REMOVED` audit only actual state changes.
- [x] Winner services cannot accept Mark rows as eligibility input.

## Required scenarios

- Drawn/undrawn Key; populated/empty/missing Cell; own/other/wrong-Round Ticket.
- Every Round state; mark twice concurrently; unmark present/absent; timestamp behavior; persistence restart.
- Malformed IDs/body; unauthenticated/Admin access; cross-Participant enumeration resistance.
- Audit success/rollback and explicit architectural test that winner evaluator input excludes Marks.

## Verification

Run Mark domain/service/route tests, uniqueness race, ownership/security suite, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes mark/unmark success/error DTO examples and maps every scenario to a test.
- [x] Concurrency, ownership, timestamp, audit, and winner-input-boundary evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
