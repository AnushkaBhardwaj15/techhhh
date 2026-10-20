---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

**Read first:** `docs/ARCHITECTURE_CODING_STANDARDS.md`, `AGENTS.md`, and `.cursor/rules/`.

**Mandatory standards:**

- **Grill-me** — if the ticket or spec has any ambiguity, TBD, or unsettled game edge case, stop and run `/grill-me` before writing code. Do not guess requirements.
- **Architecture layers:**
  - Bun/Fastify: `routes` → `service` → `domain` ← `repository`. Game rules in `domain` only. No game-state mutations in route handlers.
  - React: `pages` / `features` / `hooks` / `components` / `lib/api` / `types`. No game calculations in the browser; all HTTP via `src/lib/api/`.
- **Game authority** — backend is the source of truth for draws, marks, tickets, and wins. The frontend displays and requests, never decides.
- **YAGNI / DRY / SOLID** — smallest correct change; no speculative abstraction; interfaces only at real boundaries (DB, email, WebSocket transport).
- **Unit tests** — list all scenarios first; write a test for each; ship tests with the code. Domain tests are pure TypeScript; React tests mock `lib/api/`.

Use `/tdd` where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end (`bun test` for backend + frontend).

Once done, use `/code-review` to review the work.

Commit your work to the current branch.
