# 01 — Application, Authentication, and Role Routing

**What to build:** Single React/TypeScript/Vite SPA, React Router, TanStack Query, Zustand for ephemeral UI, typed Fetch client, Zod forms, CSS Modules, and the first accessible login screen.

**PRD traceability:** Frontend PRD §§6, 7, 8, 9, 10, 22, 24, 25, 45, 48, 50, 56, 60, 64; §50 FR-FE-001, §50 FR-FE-002. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** None — can start after the backend integration baseline is verified.

**Backend prerequisite:** Backend tickets 01 and 03: existing auth routes/service/repository and revocable cookie sessions; no game domain change.

**Branch:** `feature/tombola_frontend_application_authentication_and_role_routing`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 01 and 03: existing auth routes/service/repository and revocable cookie sessions; no game domain change.
- **Frontend:** Single React/TypeScript/Vite SPA, React Router, TanStack Query, Zustand for ephemeral UI, typed Fetch client, Zod forms, CSS Modules, and the first accessible login screen.
- **API/data:** POST /api/v1/auth/login; POST /api/v1/auth/logout; GET /api/v1/me. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Create only the app composition, API/error handling, route layouts, and feedback components used by this login slice. Add Vitest/Testing Library, Playwright configuration, and canonical scripts from the README.
- Use credentialed cookie requests; handle aborts, timeout/network failure, empty/204 responses, standard error envelopes, 401 expiration, 403 denial, and 429 rate limiting. Never retry a mutation automatically.
- Restore /me before protected route rendering; route PARTICIPANT, ADMIN, and SUPER_ADMIN appropriately; support logout and safe same-origin return navigation. Clear scoped caches and sockets on identity change.

## Non-goals

No registration, password reset, backend auth rewrite, speculative UI library, or business feature scaffolding.

## Acceptance criteria

- [x] A real backend login reaches the correct role surface; refresh restores the session and logout removes private cached content.
- [x] Invalid credentials, expired/revoked sessions, rate limiting, network failure, and unknown roles have accessible feedback and no protected-content flash.
- [x] Install, typecheck, lint, unit tests, build, and the login E2E smoke can run using documented scripts.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Valid login for all three roles; invalid/empty form; invalid credentials; double submission; network failure; 429.
- Fresh /me success, 401 and 403; logout failure/success; identity switch; external return URL rejected.
- API JSON/non-JSON error, no-content response, cancellation/timeout, and credential redaction.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via LoginPage.test.tsx (8 tests), routing.ts, session.ts, and login.spec.ts. Form validation, role routing for PARTICIPANT, ADMIN, and SUPER_ADMIN, session restoration from /api/v1/me, 401 redirect, and logout verified. All 490 frontend tests and 32 Playwright tests pass.
