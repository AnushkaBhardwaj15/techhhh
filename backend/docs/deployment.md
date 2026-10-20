# Single-instance deployment and verification

Requirement: backend PRD §§63, 65–66, 73–75; Ticket 23. The runtime is one Bun process and PostgreSQL. React has no work in this ticket.

## Repeatable local rehearsal

Prerequisites: Linux/macOS host with Docker, Bun 1.4.2, Git history including the retained Ticket 22 branch, and permission to create disposable containers/networks. Run from `backend/`:

```bash
bun run verify:container
bun run smoke:deployment
```

Both commands use a private disposable Docker network and PostgreSQL database, bind HTTP/database ports only to `127.0.0.1`, generate temporary credentials in memory, and remove their containers, volumes and network in `finally`. They do not use or modify the application's existing database. The JSON evidence is `tests/deployment/reports/container-verification.json`.

The rehearsal builds the pinned Bun image with frozen dependencies, runs the migration release step, checks configuration failure, health/readiness, missing/unknown migrations, database outage/restoration, non-root execution and read-only permissions. A blocked real database read proves SIGTERM waits for an in-flight HTTP response; idle shutdown must also exit zero. It creates a synthetic Super Admin/Event/Round through public APIs and checks success, authentication failure, game-action, recovery and latency/WS-count logs without fixture credentials. It rolls back to Ticket 22 application code rebuilt with the same audited dependency lockfile, smoke checks it, then redeploys the candidate. This validates release orchestration; actual releases must retain their previously tested image digest.

## Build and release

```bash
docker build -t techtombola:release backend
```

The Dockerfile pins the official Bun 1.4.2 image digest and installs the frozen production lockfile separately from build dependencies. Only bundles, runtime dependencies and SQL migrations enter `/app`; tests, `.env`, source and Git metadata are excluded. Bun runs as the image's `bun` user. Runtime filesystem writes belong only in declared `/tmp` tmpfs. Do not mount the source tree into the production container.

Before a release, record the candidate and previous image digests, schema versions, backup identifier, and rehearsal evidence in the release record. Store deployment credentials in the existing ignored environment file or the host's secret mechanism. `DATABASE_URL` must be reachable from inside the container. Required configuration is documented in `.env.example`; use production-strength `JWT_SECRET`/`SESSION_SECRET`, HTTPS `APP_URL`, a specific HTTPS `CORS_ORIGIN`, and an actual email provider for onboarding. Set the bootstrap secret only for initial Super Admin creation and remove it afterward.

Drain and stop the old Bun process before starting its replacement. Overlapping instances are unsupported: startup moves interrupted ACTIVE Rounds to RECOVERY_REQUIRED, and an Admin must validate and confirm recovery. Preserve the database and all historical game state.

With the chosen release image in `IMAGE` and backend environment file configured:

```bash
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --env-file backend/.env -e NODE_ENV=production "$IMAGE" bun migrate.js
docker run -d --name tombola --read-only --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=64m --memory=1g --env-file backend/.env -e NODE_ENV=production -e HOST=0.0.0.0 -p 127.0.0.1:3000:3000 "$IMAGE"
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
```

Terminate with `docker stop --time 30 tombola`; never send SIGKILL as the normal release procedure. A TLS reverse proxy fronts the loopback HTTP listener. `/health` reports process liveness. `/ready` requires database connectivity and an exact match between applied and bundled migration filenames, including rejection of unknown newer versions. Route traffic only after readiness succeeds. Readiness does not automatically resume a Round in RECOVERY_REQUIRED.

## Logs, audit and dependency checks

JSON request logs contain request ID, safe actor/resource IDs, route template, method, status, latency and current WS count. Write routes for Rounds/Claims/Marks are tagged `game_action`; failed authorization and startup recovery have explicit events. Error logs retain type/code and request context, with generic messages and no query/parameter dump. Domain audit records retain authoritative committed actions. Keep log access restricted and retention bounded.

`bun audit --json` must pass. Drizzle ORM/Kit were upgraded to patched versions. Kit still includes a legacy loader with an obsolete esbuild range; the root override selects patched esbuild 0.25.x, verified by the audit and `bunx drizzle-kit --version`. Remove the override when the upstream loader dependency is removed. No OS image vulnerability scanner is installed in this project; the report's dependency audit is not an OS CVE scan.

## Rollback and cost assumptions

Stop the candidate, choose the previous tested immutable image, and check its bundled schema against the current database before starting it. An incompatible schema must keep readiness false. Do not delete migration history to force rollback: stop and follow the tested backup/restore runbook using an approved backup. Restore to a separate database first and validate it before any production cutover. Preserve feature branches and keep PRs unmerged until the explicit user approval gate.

The capacity evidence is the recorded local Ticket 22 configuration, not an AWS benchmark. Budget assumption: one small Bun host, PostgreSQL and backups, TLS ingress, bounded logs, and no broker/Redis/extra worker fleet. Allow at least 1 GiB for the app container (the measured login phase peaked near 775 MB) plus separate PostgreSQL headroom. Check actual regional instance/database/storage/backup/log estimates against the PRD's approximately $100 club budget, set account budget alerts, and shut down event-only resources afterward. This ticket does not provision or deploy an AWS account.
