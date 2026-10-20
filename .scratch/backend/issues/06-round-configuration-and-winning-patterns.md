# 06 — Round Configuration and Winning Patterns

**What to build:** Administrators can configure draft Rounds and their five supported winning Patterns without prematurely starting gameplay.

**PRD traceability:** §§13, 26–27, 36, 53; FR-004, FR-014.

**Blocked by:** 05 — Event Configuration and Lifecycle.

**Branch:** `feature/tombola_round_configuration`

**Status:** done

## Scope and contracts

- Bun layers: Round/Pattern routes and schemas -> service -> pure configuration domain <- repositories and audit boundary.
- API: `GET/POST /api/v1/admin/rounds`, `PATCH /api/v1/admin/rounds/:id`.
- Configure sequence, name, and `EARLY_5 | TOP_LINE | MIDDLE_LINE | BOTTOM_LINE | FULL_HOUSE`, each with enabled, `maxWinners`, and `OPEN | CLOSED` state.
- PATCH cannot change lifecycle status. Ticket 12 owns readiness and operation commands.
- Unique Event/sequence and Round/Pattern constraints enforce stable configuration.
- Frontend: none; publishes Round and Pattern DTOs.

## Non-goals

- No readiness/start/pause/resume/complete execution, custom Pattern language, or future Pattern plugin interface.

## Acceptance criteria

- [x] Exactly the supported MVP Pattern types are accepted; enabled Patterns require `maxWinners >= 1`.
- [x] Pattern configuration becomes immutable after the Round reaches READY.
- [x] Round cancellation is represented but performed only through the explicit lifecycle command.
- [x] All writes enforce Event scope and append audit records.

## Required scenarios

- Create/list/edit draft Round; duplicate sequence; missing/wrong Event; invalid name/sequence.
- Enable/disable each Pattern; zero/negative winner limit; duplicate Pattern; edit after READY rejected.
- Participant denied; Admin/Super Admin allowed; concurrent duplicate creation; audit rollback.

## Verification

Run focused Round configuration and Pattern constraint tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes Round/Pattern DTO and error examples plus one test per scenario.
- [x] Uniqueness, immutability, authorization, and audit evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
