# 21 — Security, Authorization, and Anti-Cheat Suite

**What to build:** A dedicated adversarial suite proves every role, ownership, secret-handling, and future-information boundary across the completed API and WebSocket surface.

**PRD traceability:** §§39–47, 58; NFR-004; critical invariants 13–15.

**Blocked by:** 04–19 — complete protected/public API surface.

**Branch:** `feature/tombola_backend_security_tests`

**Status:** done

## Scope and contracts

- Bun layers: adversarial black-box test harness plus route-inventory assertion; no production authorization path is duplicated in tests.
- Add `bun run test:security`; tests exercise HTTP, WebSocket, database/log sinks, and serializer allowlists without introducing a new security framework.
- Generate the authorization matrix from route inventory so every protected route has unauthenticated, wrong-role, wrong-owner, and wrong-Event coverage.
- Probe participant/public responses for future Keys, unpublished Questions, hashes, tokens, emails, stack traces, SQL details, and audit metadata.
- Frontend: none.

## Non-goals

- No penetration-test certification, external scanner platform, WAF, OAuth, production secret access, or speculative security framework.

## Acceptance criteria

- [x] Every public/protected route and WebSocket channel appears in the matrix exactly once.
- [x] Object-ID substitution cannot reveal whether another Participant's resource exists.
- [x] Cookie flags, Origin enforcement, session revocation, throttling, and payload bounds are asserted.
- [x] Secret scans cover database fixtures, application logs, audit metadata, email delivery, and idempotency outcomes; there is no email-job table in this codebase.

## Required scenarios

- Participant/Admin/Super Admin/public matrix; inactive/deleted identities; expired/revoked Session.
- Cross-Participant and cross-Event IDs for Tickets, Cells, Claims, Winners, Draws, and profiles.
- Future-Key leakage through REST, WS, errors, pagination, and malformed requests.
- Injection-shaped inputs, oversized bodies/CSV/WS frames, rate limits, stack/SQL redaction, password/token scan.

## Verification

Run `cd backend && bun run test:security`, inspect the generated route-coverage report, then every canonical backend command and E2E suite.

```bash
cd backend && bun run test:security && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build && bun run test:e2e
```

## Completion evidence

- [x] PR #14 includes the generated 68-operation/channel route matrix and maps each scoped-resource boundary to its integration evidence; role checks run against every protected route.
- [x] Security suite covers ownership, future-Key leakage, cookie/session behavior, request/frame bounds, and secret redaction.
- [x] `/code-review` has no unresolved Standards or Spec findings.

**Verification:** Fresh isolated PostgreSQL databases; `bun run test:security` (154 pass), `bun run test` (249 pass), `bun run test:integration` (144 pass), `bun run test:e2e` (1 pass), `bun run typecheck`, `bun run lint`, and `bun run build` all pass. See generated `backend/tests/security/route-coverage.md`.
