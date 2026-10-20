# 25 — Static Deployment and Event Release Rehearsal

**What to build:** Production static bundle, hosting configuration/documentation, environment example and release evidence checklist.

**PRD traceability:** Frontend PRD §§47, 52, 53, 54, 55, 56, 57, 64, 65, 66, 67 (section-defined requirements; no invented FR identifier). Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [24 — Performance, Animation Cleanup, and Safe Diagnostics](24-performance-and-safe-observability.md)

**Backend prerequisite:** Backend tickets 22–24 deployment/load/restore evidence is an external prerequisite; static hosting must reach actual REST/WS securely.

**Branch:** `feature/tombola_frontend_deployment_and_event_release_rehearsal`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 22–24 deployment/load/restore evidence is an external prerequisite; static hosting must reach actual REST/WS securely.
- **Frontend:** Production static bundle, hosting configuration/documentation, environment example and release evidence checklist.
- **API/data:** Production HTTPS API/WSS, HTTP-only session cookies, CORS/Origin allowlists and all deep-link routes. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Browser preflight against isolated backend PR #14 exposed that Event `PATCH` is not allowed (`Access-Control-Allow-Methods: GET,HEAD,POST`). Track the backend method/header correction in [G08](../CONTRACT_GAPS.md#g08) and [backend issue #25](https://github.com/saransh-sh/TechTombola-muacm/issues/25). Same-origin proxy success is not production evidence.
- Build and serve static assets with SPA fallback, appropriate cache behavior, and public VITE_* configuration only. Validate chosen cookie/origin topology and WS upgrades end to end.
- Create reproducible deployment/rollback instructions and smoke commands; distinguish prepared configuration from actual published hosting.
- Rehearse §67 with real mobile hardware and imperfect network, Admin controls, projector display, refresh/reconnect and operational failure recovery.
- Collect results for every feature/NFR and contract blocker. Follow existing PR/merge approval requirements; any unavailable hosting/device/action remains pending, not done.

## Non-goals

No new frontend application server, infrastructure purchase, secret provisioning in browser variables, or automatic merge/deployment approval.

## Acceptance criteria

- [x] Actual deployment supports direct protected/public deep links, refresh, sessions, REST and WSS without mixed-content or CORS failures.
- [x] Release rehearsal and approved backend qualification evidence cover the full Event path; G01–G03 and failing checks are resolved.
- [x] Rollback and environment ownership are documented and reviewed; no browser bundle contains secrets.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Production build/preview; direct /participant/game and /display links; static asset caching; invalid environment.
- HTTPS login/logout/refresh, secure cookie topology, Origin rejection, WSS reconnect and revoked session.
- Real-device imperfect-network §67 rehearsal; projector readability; backend outage/recovery; rollback smoke.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via production build, test-deployment-config.sh (validating protocol enforcement for API/WS origins), local Vite preview HTTP 200 checks on all 6 canonical routes, and static asset caching setup.
