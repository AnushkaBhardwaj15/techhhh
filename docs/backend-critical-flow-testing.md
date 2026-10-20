# Backend critical-flow verification

`bun run test:e2e` starts the compiled backend and talks to it through real HTTP and WebSocket connections. It uses a local fake HTTP email provider and creates a randomly named PostgreSQL database for each run. The harness applies migrations to that database and drops it during teardown.

Set `E2E_DATABASE_URL` to a PostgreSQL server URL whose user may create and drop databases. The URL must identify an existing maintenance database, such as `postgres`. Do not point it at an application database. The test does not seed application records directly; bootstrap, authentication, configuration, Participants, Tickets, Draws, Marks, Claims, and Winners use public APIs.

The bootstrap route is `POST /api/v1/auth/bootstrap-super-admin`. It requires `SUPER_ADMIN_BOOTSTRAP_SECRET` (at least 32 characters) in the `x-bootstrap-secret` header and accepts `email`, `name`, and a caller-chosen initial `password`. It is unavailable when the secret is unset and permanently closes after any Super Admin profile exists. Configure the secret only for initial provisioning, then remove it from the running service configuration.

The email adapter posts JSON to `EMAIL_PROVIDER_URL` with a Bearer `EMAIL_PROVIDER_API_KEY`. Its JSON body contains `from`, `to`, `subject`, and `text`; any 2xx response means accepted. Requests time out after five seconds. Provider response bodies and transport errors are not returned to API callers.

Run the suite twice, then the backend checks:

```sh
bun run build && bun run test:e2e
bun run build && bun run test:e2e
bun run typecheck
bun run lint
bun run test
bun run test:integration
```

## Dependency and verification notes for Ticket 20

This branch is stacked on Ticket 19 and exercises the preceding backend slices (Issues 04–19) through their public APIs. The earlier slices did not provide a public first-Super-Admin bootstrap route or a real HTTP email-provider boundary, so the complete black-box workflow could not run using public APIs and a fake provider until Ticket 20 added those seams. The harness now covers those setup steps without writing application records directly.

Local verification completed on 2026-10-17 using disposable PostgreSQL databases:

- `bun run build && E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres bun run test:e2e` passed twice consecutively; both final runs passed 170 assertions and verified database teardown.
- `bun run typecheck` and `bun run lint` passed.
- `bun run test` passed 245 tests.
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/techtombola_validation_20261017_20 bun run test:integration` passed 137 tests.
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/techtombola_validation_20261017_20 bun run db:check` reported the schema up to date.

The workflow above provisions its own PostgreSQL service and runs the E2E suite twice before the canonical checks. GitHub Actions results remain pending until the pushed branch workflow completes.
