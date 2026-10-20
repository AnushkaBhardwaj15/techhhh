# 10 — Ticket Generation, Allocation, and Retrieval

**What to build:** Generate immutable valid Tickets for active Participants, allocate at most one per Participant/Round, and return only the authenticated Participant's current Ticket.

**PRD traceability:** §§17–19, 35, 52, 55; FR-007, FR-008; critical invariants 1–4, 13–14.

**Blocked by:** 06 — Round Configuration; 07 — Key/Question Bank; 08 — Participant Management.

**Branch:** `feature/tombola_ticket_generation`

**Status:** done

## Scope and contracts

- Bun layers: Ticket routes/schemas -> allocation/retrieval service -> pure generator/validator domain <- Ticket/idempotency repositories and audit boundary.
- API: `POST /api/v1/admin/rounds/:id/tickets/generate` with `Idempotency-Key`; `GET /api/v1/participant/ticket` for the current Round.
- Pure generator accepts injectable seeded randomness for tests and runtime secure randomness. Layout is 3x9, 15 populated, 5 per row, 12 empty, with no duplicate Keys; technology Keys have no numeric column-order rule.
- Generate only missing Tickets for active Participants, returning created/existing/skipped counts. Unique `(participant_id, round_id)` prevents races; reruns never replace Tickets.
- Ticket and Cells persist in one transaction and become immutable when Round reaches READY.
- Frontend: none; publishes the participant Ticket DTO with Cell IDs/positions/Keys and no Question pool.

## Non-goals

- No ticket designer, regeneration/replacement, numeric Tombola column convention, client generation, or cross-Participant lookup.

## Acceptance criteria

- [x] Every structural invariant is validated before persistence and database-constrained where possible.
- [x] Fewer than 15 unique eligible Keys rejects generation without partial Ticket writes.
- [x] Own-Ticket retrieval derives Participant identity from Session and cannot select another Participant.
- [x] Generation and retrieval never expose undrawn Questions, future order, or other Tickets.

## Required scenarios

- Dimensions/counts/rows/empty Cells/no duplicates across many seeds; same seed deterministic; insufficient/duplicate/inactive/wrong-Event Keys.
- Zero, one, and 500 Participants; inactive skipped; rerun; concurrent allocation; failure rolls back Ticket and Cells.
- DRAFT allowed, READY/ACTIVE/COMPLETED replacement rejected; unauthenticated/admin/wrong Participant access; no-current-Round response.
- Idempotent replay/new key; transactional audit; response allowlist leak test.

## Verification

Run generator property tests, 500-Participant transaction test, allocation race, ownership/security tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes generate/Ticket/error DTO examples and maps every scenario to a test.
- [x] Seeded generator, 500-Participant, rollback, concurrency, idempotency, and leakage evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
