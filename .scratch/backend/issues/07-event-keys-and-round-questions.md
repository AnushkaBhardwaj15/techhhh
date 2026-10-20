# 07 — Event Keys and Round Questions

**What to build:** Administrators can maintain canonical Event Keys and Round Questions without creating duplicate reveal values or mutating Draw history.

**PRD traceability:** §§14–16, 36, 46–48; FR-005, FR-006; critical invariants 6, 11, 14.

**Blocked by:** 05 — Event Lifecycle; 06 — Round Configuration.

**Branch:** `feature/tombola_question_key_bank`

**Status:** done

## Scope and contracts

- Bun layers: Key/Question routes and schemas -> services -> pure normalization/eligibility domain <- repositories and audit boundary.
- API: `GET/POST/PATCH /api/v1/admin/keys`; `GET/POST/PATCH/DELETE /api/v1/admin/questions` with IDs on item routes.
- Key normalization: trim, uppercase, collapse whitespace; 2–50 letters/digits/spaces/hyphens; unique normalized value per Event.
- Question: 10–500 characters, belongs to one Round and one Key from the same Event; one active Question per Key/Round.
- Once referenced by a Draw or a READY/started Round, mutable content cannot rewrite history. Draw snapshots are owned by ticket 13.
- Frontend: none; participant contracts never expose this bank.

## Non-goals

- No AI generation, bulk content import, multiple active Questions per Key/Round, or participant Question-bank API.

## Acceptance criteria

- [x] Database constraints and domain validation agree on scope and uniqueness.
- [x] Inactive, cross-Event, missing, or duplicate Keys cannot activate a Question.
- [x] Deletion is limited to undrawn draft-Round Questions.
- [x] Required create/update audit events are appended transactionally.

## Required scenarios

- Normalization collisions by case/whitespace; 2/50 boundaries; invalid character; concurrent duplicate Key.
- Question 10/500 boundaries; missing/inactive/cross-Event Key; duplicate active Key in Round; same Key in another Round allowed.
- Update/delete in DRAFT versus READY/ACTIVE/COMPLETED; drawn snapshot immunity; authorization and leakage tests.

## Verification

Run focused normalization/domain tests, CRUD integration tests, constraint races, and leakage assertions, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes Key/Question request, response, and error examples and maps every scenario to a test.
- [x] Normalization race, history protection, audit, and leakage evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
