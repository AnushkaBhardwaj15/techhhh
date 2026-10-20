# 03 — Identity, Authentication, and Revocable Sessions

**What to build:** Secure browser login for administrators, immediately revocable logout, identity inspection, and reusable principal/role guards that Participant management can extend without speculative Event models.

**PRD traceability:** §§11, 39–40, 43–45, 58; FR-001, FR-002; NFR-004. ADR-0005.

**Blocked by:** 01 — Backend Application Shell; 02 — Audit Foundation.

**Branch:** `feature/tombola_auth_sessions`

**Status:** done

## Scope and contracts

- Layers: password/session domain utilities, auth service, user/session repositories, auth routes and administrator guards.
- API: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/me`.
- A `User` is the login identity. This ticket implements `AdminProfile` with `ADMIN | SUPER_ADMIN`; ticket 08 adds Participant identity and Event scope through the same concrete auth service. JWT cookie `jti` references an active hashed/revocable Session record.
- HTTP-only, Secure-in-production, SameSite cookie; mutation Origin checks; no token in response JSON, local storage, logs, or WebSocket query strings.
- Rate limit failed login by normalized identifier and IP, with five failures per rolling minute as the initial configurable policy.
- Frontend: none; publishes cookie and identity DTO contracts.

## Non-goals

- No ParticipantProfile/Event-scoped login, password reset, OAuth, refresh-token family, or frontend token storage.

## Acceptance criteria

- [x] Argon2id hashes are the only persisted password representation.
- [x] Login creates a Session and emits `LOGIN_SUCCESS`; rejected login emits redacted `LOGIN_FAILED`.
- [x] Logout is idempotent, revokes the Session, clears the cookie, and prevents reuse immediately.
- [x] Guards distinguish unauthenticated, wrong principal kind, wrong admin role, and inactive identity without stubbing ParticipantProfile or Event persistence.

## Required scenarios

- Valid Admin/Super Admin login; bad password; unknown email with timing-safe behavior; inactive/soft-deleted account.
- Missing, malformed, expired, invalid-signature, revoked, and cross-session JWT; logout twice; reuse after logout.
- Rate-limit attempts 1–5, sixth rejection, window reset, identifier/IP isolation.
- Non-admin principal denied Admin route; Admin denied Super Admin route; invalid Origin rejected. Participant login/Event-scope cases are owned by ticket 08.

## Verification

Run focused password/session/guard tests and auth route integration tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [ ] PR contains request/response/cookie examples and maps every scenario to a passing test.
- [ ] Session revocation, rate-limit boundary, audit, and secret-scan evidence are attached.
- [ ] `/code-review` has no unresolved Standards or Spec findings.
