# 01 — Backend Application Shell and Test Harness

**What to build:** A bootable Bun + Fastify service whose configuration, health, errors, migrations, and test database are reproducible for every later backend ticket.

**PRD traceability:** §§6–7, 49–50, 63, 65–69; NFR-007, NFR-008, NFR-010.

**Blocked by:** None — can start immediately.

**Branch:** `feature/tombola_backend_foundation`

**Status:** done

## Scope and contracts

- Layers: application composition, configuration, shared errors, database client/migrations, health routes. No game domain behavior.
- API: `GET /health` returns process liveness; `GET /ready` verifies validated configuration and PostgreSQL connectivity.
- Establish `/api/v1`, request IDs, structured logging, CORS allowlist, graceful shutdown, and the canonical scripts in `.scratch/backend/README.md`.
- Add only foundation tables required here: migration metadata and health-test fixtures. Feature tables belong to their owning tickets.
- Frontend: none; publishes only health/error contracts.

## Non-goals

- No feature schema, authentication, domain module, deployment infrastructure, or speculative shared framework.

## Acceptance criteria

- [x] Missing or invalid environment variables fail before the server listens; secrets are never logged.
- [x] Domain, Zod, authentication, and unknown errors map to the standard envelope with stable codes.
- [x] `/health` remains independent of PostgreSQL; `/ready` returns `503` when PostgreSQL is unavailable.
- [x] Migrations apply to an empty database and `db:check` detects drift.
- [x] Unit and integration tests run against isolated, resettable PostgreSQL state.

## Required scenarios

- Valid configuration; each required variable missing; invalid port/origin/log level; production secret too short.
- Generated and accepted request IDs; malformed external request ID replaced; request ID present on errors.
- Health success; readiness success; database unavailable; database timeout; migration failure.
- Known domain error, malformed request, unexpected error, and proof that stack/database details are absent.

## Verification

Run every canonical command in `.scratch/backend/README.md`, plus start the built server against a clean database and verify graceful SIGTERM shutdown.

```bash
cd backend && bun install --frozen-lockfile && bun run db:migrate && bun run db:check && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [ ] PR lists every scenario above and its passing test.
- [ ] Clean-database migration, readiness-failure, build, and shutdown outputs are attached.
- [ ] `/code-review` has no unresolved Standards or Spec findings.
