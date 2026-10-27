# Authentication and participant batches

Agreed scope: backend FR-001 (authentication), FR-002 (authorization), FR-020
(bulk import), NFR-004 (security), and backend PRD sections 41–43.

## Accepted behavior

- Initial Super Admin: `bigboss@muacm.tech`; no default demo accounts.
- Only Super Admins create and manage administrators.
- Admins and Super Admins can add/remove participants individually or import
  CSV/Excel with `email,password` and optional `name,external_id`.
- Personal and college emails are accepted. No public registration.
- The operator names each batch separately from its file. Examples: testing1
  with 5 participants, testing2 with 100, prod with 500. Groups belong to an Event.
- Duplicate accounts retain their existing password and group.
- If any selected participant has a ticket, disable the whole selection and
  revoke sessions, preserving history. Otherwise delete unused enrollments and
  accounts that have no other enrollment or administrator role.
- Existing database cleanup was explicitly approved: disable existing accounts,
  revoke sessions, create bigboss as the only active Super Admin, retain history.

## Implementation boundaries

Backend services coordinate password hashing, persistence, imports and removal.
The database owns account identity, roles, sessions, and batch membership. Routes
validate HTTP inputs; repositories own SQL; the removal domain decides whether
history requires deactivation. React displays reports and requests actions through
`lib/api`. Game state and ticket generation remain on the server. No new WebSocket
event is needed for account management; revoked sessions fail validation.

## API additions

- `GET /api/v1/admin/participant-batches?eventId=<uuid>` returns
  `{ batches: [{ batchName, total, active }] }`.
- `DELETE /api/v1/admin/participant-batches` accepts `{ eventId, batchName }`.
- `DELETE /api/v1/admin/participants/:id` removes a single participant.
- Removal returns `{ mode: "deleted" | "deactivated", count }`.
- Participant create accepts optional `password` and `batchName`.
- Import accepts a separate `batchName` multipart field (or JSON property).
  It retains the existing Idempotency-Key and per-row result report contract.
- Invalid fields: 400; unauthenticated: 401; wrong role: 403; missing selection:
  404; duplicate enrollment/account: 409 (reported as skipped during imports).

## Test scenarios

- Bootstrap: one normalized Super Admin, incorrect/missing secret, duplicate
  email, repeated setup, existing credentials preserved.
- Login: exact Argon2id password, invalid/demo guesses, unknown email, inactive
  account, revoked/expired session, rate limiting, database failures, role checks.
- Import: CSV/XLSX/XLS, college/personal email, optional name, exact password
  whitespace, malformed input, bad encoding, multiple sheets, formulas, file size,
  500/501 rows, duplicate email/external ID, invalid/short/missing password,
  admin email conflicts, immutable Event, per-row failures, scoped retries.
- Privacy: no plaintext storage, logs, reports, previews (including over-limit
  previews), persistent browser storage or error messages.
- Removal: unused group deletion, whole-group deactivation when one has a ticket,
  session revocation, single removal, missing scope, other groups/Events/admins
  preserved, audit failure rollback, database row locks with enrollment.
- UI: batch counts, name input, CSV preview, Excel upload, deliberate confirmation,
  cancel, pending state, errors, empty state, server removal result and refresh.

## Local setup

Generated initial credentials are kept only in the ignored backend
`.env.super-admin.local` file. They must not be added to Git or PR descriptions.
Running the default seed again does not reset existing credentials.
