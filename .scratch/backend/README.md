# Backend Agent Execution Plan

This directory is the version-controlled local issue tracker for delivering the Tech Tombola backend. The Backend PRD defines what the product must do; `AGENTS.md`, `CONTEXT.md`, the architecture standards, and ADRs define how agents work and where behavior belongs.

## How an agent claims a ticket

1. Select a `ready-for-agent` ticket whose blockers are all complete.
2. Read every cited PRD section, ADR, and direct blocker before planning.
3. Synchronize `main` and create the ticket's declared `feature/tombola_<slug>` branch.
4. List the ticket's scenarios first, then implement one red-green slice at a time.
5. Keep Bun boundaries strict: `routes -> service -> domain <- repository`; WebSocket and email are IO adapters.
6. Run the focused tests, then every common gate below.
7. Run `/code-review`, commit, push, and open a PR. Never merge without the explicit approval gate in `AGENTS.md`.

## Common contract for every ticket

- Backend owns every game rule and all authoritative state. React impact is contract consumption only unless a ticket explicitly says otherwise.
- All external input is validated with Zod. All errors use `{ "error": { "code": string, "message": string }, "requestId": string }` and never expose stack traces or database details.
- Protected operations verify authentication, role, ownership, and Event/Round scope.
- Critical mutations and their audit record commit atomically; broadcasts and email happen after commit.
- `Idempotency-Key` applies where the PRD requires it. A retry replays the stored safe result; a different key is a different command.
- Database constraints enforce invariants in addition to domain validation.
- Each implementation PR contains its migrations, adjacent tests, and evidence for every acceptance criterion.

## Canonical backend commands

Ticket 01 creates these scripts. Later tickets must keep them green:

```bash
cd backend
bun install --frozen-lockfile
bun run db:migrate
bun run db:check
bun run typecheck
bun run lint
bun test
bun run test:integration
bun run build
```

Ticket-specific load, E2E, security, and restore commands are added by tickets 20–24.

## Dependency frontier

```text
01 -> 02 -> 03 -> 04
              \-> 05 -> 06 -> 07
                    \-> 08 -> 09
06 + 07 + 08 ------> 10
03 + 05 + 06 ------> 11
06 + 07 + 10 + 11 -> 12 -> 13 -> 14
06 + 10 + 11 + 13 -> 15 -> 16
05 + 11 + 12 + 13 + 16 -> 17
12 + 13 + 14 + 16 -> 18
04 + 08 + 12 + 13 + 16 + 18 -> 19
04..19 -> 20 and 21
17 + 18 + 19 + 20 + 21 -> 22 -> 23 -> 24
```

## Status vocabulary

- `ready-for-agent`: fully specified and all decisions settled; still blocked until listed blockers complete.
- `in-progress`: claimed on its feature branch.
- `ready-for-human`: requires a human-only environment or approval.
- `implemented-unmerged`: implemented and locally verified; delivered PR remains unmerged.
- `done`: merged after all tests and explicit approval; feature branch remains preserved.
