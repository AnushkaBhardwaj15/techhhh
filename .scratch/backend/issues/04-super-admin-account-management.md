# 04 — Super Admin Account Management

**What to build:** Super Admin-only administration of operational Admin identities without exposing or retaining plaintext credentials.

**PRD traceability:** §§11, 37, 40, 43–45; FR-002; NFR-004.

**Blocked by:** 03 — Identity, Authentication, and Revocable Sessions.

**Branch:** `feature/tombola_admin_management`

**Status:** done

## Scope and contracts

- Bun layers: Admin routes and Zod schemas -> service -> user/Admin repository; password generation uses ticket 03 domain utility and email is an IO boundary.
- API: `GET/POST /api/v1/super-admin/admins`, `PATCH/DELETE /api/v1/super-admin/admins/:id`.
- POST creates an `ADMIN` profile and one-time credential; DELETE is a soft delete and revokes active Sessions transactionally.
- An Admin cannot create another Admin, promote itself, delete the final active Super Admin, or restore credentials from storage.
- Every mutation writes its audit record in the same transaction.
- Frontend: none; publishes administrator DTOs with no hashes/session data.

## Non-goals

- No Super Admin self-service promotion, hard deletion, password recovery UI, or general User administration.

## Acceptance criteria

- [x] Email uniqueness is case-insensitive and concurrency-safe.
- [x] List responses are paginated and omit credentials, hashes, and Session details.
- [x] Deactivation/soft deletion immediately prevents authenticated use.
- [x] Stable `403`, `404`, and `409` errors cover role, non-enumerating lookup, and identity conflicts.

## Required scenarios

- Create/list/deactivate/reactivate/soft-delete Admin; duplicate email; invalid payload; pagination boundaries.
- Participant and Admin denied; Super Admin allowed; final active Super Admin protected; self-deactivation policy rejected.
- Existing Session revoked on deactivation/deletion; audit success and rollback on audit failure.

## Verification

Run focused Admin service/route/security tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [ ] PR includes Admin DTO/error examples and maps every scenario to a test.
- [ ] Session-revocation, uniqueness-race, audit, and secret-scan evidence are attached.
- [ ] `/code-review` has no unresolved Standards or Spec findings.
