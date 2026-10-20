# Admin Operations API

All routes below use the `/api/v1` prefix and the authenticated session cookie.
`ADMIN` and `SUPER_ADMIN` can read the dashboard and audit trail. Only
`SUPER_ADMIN` can read system diagnostics.

## `GET /admin/dashboard`

Returns read-only status for the most recently updated LIVE Event. If there is
no LIVE Event, event and round are `null`, counts are zero, and no recovery
alert is set. `connectedConnections` counts all WebSocket connections held by
this server process; it is a connection count, not a distinct-user count.

```json
{
  "event": { "id": "event-id", "title": "Tech Tombola", "status": "LIVE" },
  "round": { "id": "round-id", "name": "Round 1", "sequenceNumber": 1, "status": "ACTIVE" },
  "participants": 500,
  "drawCount": 12,
  "pendingClaims": 2,
  "verifiedWinners": 4,
  "recoveryRequired": false,
  "systemStatus": "operational",
  "connectedConnections": 487
}
```

Counts and Round/Event status are read in one repeatable-read, read-only
transaction. `systemStatus` is `recovery_required` when the selected LIVE
Event's current Round needs recovery.

## `GET /admin/audit`

Accepts optional opaque `cursor`, `limit` (default `20`, maximum `100`),
`actorId` (UUID), `action` (exact action name), `from`, and `to` (ISO
date-time). Dates are inclusive. Results are ordered by `createdAt DESC, id
DESC`. The cursor contains the last returned `(createdAt, id)` pair, so newer
audit writes do not shift the next page. Unknown query fields, malformed
cursors, and `from` later than `to` return a validation error.

```json
{
  "items": [{
    "id": "audit-id",
    "actorId": "actor-id",
    "actorType": "ADMIN",
    "action": "DRAW_CREATED",
    "resourceType": "round",
    "resourceId": "round-id",
    "metadata": { "sequence": 12 },
    "createdAt": "2026-10-15T12:00:00.000Z"
  }],
  "limit": 20,
  "hasMore": true,
  "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTE1VDEyOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSJ9"
}
```

The response allowlists fields and re-redacts metadata. IP addresses,
User-Agent strings, and request IDs are never returned.

## `GET /super-admin/system`

Only `SUPER_ADMIN` may read this process-wide view. It reports an application
version, database and startup-validated configuration readiness, the global
count of Rounds requiring recovery, and the latest applied migration when
available. Backup metadata is omitted because the current database has no
backup metadata source. Configuration values, secrets, and raw dependency
errors are never returned.

Database available:

```json
{
  "version": "1.0.0",
  "readiness": { "status": "ready", "dependencies": { "database": "available", "configuration": "available" } },
  "recoveryRequiredRounds": 1,
  "latestMigration": { "version": "0014_operations_read_indexes.sql", "appliedAt": "2026-10-15T12:00:00.000Z" }
}
```

Database unavailable:

```json
{
  "version": "1.0.0",
  "readiness": { "status": "not_ready", "dependencies": { "database": "unavailable", "configuration": "available" } },
  "recoveryRequiredRounds": null,
  "latestMigration": null
}
```

## Errors

- `400 VALIDATION_ERROR`: malformed audit filters, dates, cursors, pagination values,
  or unknown query fields.
- `401 UNAUTHORIZED`: no valid authenticated session.
- `403 FORBIDDEN`: Participant access to Admin routes or Admin access to the
  Super Admin system route.
- `500 INTERNAL_SERVER_ERROR`: unexpected read failure; database details are
  hidden by the shared error handler.
