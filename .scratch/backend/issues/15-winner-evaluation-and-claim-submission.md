# 15 — Winner Evaluation and Claim Submission

**What to build:** Participants can submit Claims that are accepted only when the server independently proves the configured Pattern from their assigned Ticket and official Draw history.

**PRD traceability:** §§26–28, 35, 47, 57; FR-014, FR-015; critical invariants 8–9.

**Blocked by:** 06 — Patterns; 10 — Tickets; 11 — Real-Time Transport; 13 — Draw Engine.

**Branch:** `feature/tombola_claim_submission`

**Status:** done

## Scope and contracts

- Bun layers: Claim routes/schemas -> service -> pure Pattern evaluator domain <- Claim/Ticket/Draw/Pattern repositories, audit, and WebSocket boundaries.
- API: `POST /api/v1/participant/claims` body `{ roundId, pattern }`; `GET /api/v1/participant/claims`.
- Derive the Participant's Ticket; never accept `ticketId` or Mark data as eligibility evidence.
- Pure evaluator supports Early 5 (at least five drawn Ticket Keys), three Lines, and Full House from Ticket + official Draws + Pattern configuration.
- Eligible Claim persists `PENDING_VERIFICATION` and emits admin-only `WIN_CLAIM_CREATED` after commit. Ineligible is `422`; duplicate/open conflict or closed Pattern is `409`.
- Frontend: none; publishes Claim status/history DTOs scoped to the authenticated Participant.

## Non-goals

- No Admin verification, Mark-based eligibility, custom Patterns, automatic Winner creation, or Round completion.

## Acceptance criteria

- [x] Disabled/unknown/closed Patterns and non-ACTIVE Rounds cannot accept Claims.
- [x] Duplicate Claim uniqueness is database-enforced without blocking legitimate configured multi-winner Claims from different Participants.
- [x] Claim history cannot expose another Participant.
- [x] Validity is recalculated at submission and later verification.

## Required scenarios

- Each Pattern positive/negative/boundary; Early 5 at 4/5/6 Draws; incomplete Lines; Full House at 14/15.
- Marked-but-undrawn and drawn-but-unmarked Cells prove Marks are irrelevant; unrelated Draws ignored.
- No Ticket/wrong Round/disabled/closed/unknown Pattern; duplicate/concurrent Claim; inactive Round.
- Auth/ownership, history ordering, audit rollback, broadcast only after commit/admin-only audience.

## Verification

Run complete Pattern truth tables, Claim service/race tests, route/security/WS tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes Claim request/history/error and admin-event DTO examples plus one test per scenario.
- [x] Pattern truth tables, duplicate race, ownership, audit, and post-commit audience evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
