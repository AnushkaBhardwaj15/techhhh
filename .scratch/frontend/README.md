# Frontend Agent Execution Plan

Approved scope: convert the existing Frontend PRD into **25 local tickets only**. No GitHub issues, product implementation, dependencies, commits, pushes, deployment, or PR publication are part of this planning change.

## Start here

1. Read [coverage](COVERAGE.md), [contract gaps](CONTRACT_GAPS.md), and the selected ticket. The [Frontend PRD](../../docs/TECH_TOMBOLA_FRONTEND_PRD.md) defines WHAT; [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md), [architecture](../../docs/ARCHITECTURE_CODING_STANDARDS.md) and relevant ADRs define HOW.
2. Choose a fully specified ticket whose listed frontend and backend prerequisites are actually available. Read each backend prerequisite under [the backend backlog](../backend/README.md). A checkbox or `done` label is not proof its code is on the integration base.
3. Identify actual request/response serializers, query/body schemas, error codes and WS subscription behavior. Resolve any changed contract before implementation. Use the project's grill workflow for new requirements; do not re-ask settled decisions recorded here.
4. For implementation, synchronize the latest remote main and create the ticket's declared `feature/tombola_frontend_<slug>` branch using the repository workflow. Preserve existing branches and local changes. If required backend code exists only on another branch, record the integration prerequisite; do not silently assume main contains it or merge it without authorization.
5. List individual test scenarios first. Implement one scoped slice through API adapter, hooks, feature UI and tests; leave game decisions in the backend.
6. Execute focused checks and the completion gate. Review, commit, push and open an implementation PR when authorized by the implementation task; merge only after the repository's explicit human approval gate.

## Snapshot and limits

- Planning baseline: local checkout inspected on 2026-10-17, branch `feature/tombola_backup_restore_rehearsal`; it contains backend code and no `frontend/` directory. Runtime/API/browser behavior was not executed in this planning task.
- The previously created remote milestone branch was created from remote main. Its name does not prove backend feature branches were integrated into it. This plan makes no claim about remote code readiness.
- Work is participant-first, then operational roles and display, then release qualification. Separate Admin slices can proceed once their actual prerequisites are present.
- Backend-owned behavior is consumed, not reimplemented or unnecessarily rebuilt. Backend extensions are separate scoped work after a contract decision.
- The execution pack is planning, not an implementation or release-readiness claim.

## Current implementation snapshot — 2026-10-18

Frontend implementation is on `feature/tombola_frontend_live_display`. PR [#24](https://github.com/saransh-sh/TechTombola-muacm/pull/24) is open and unmerged at pushed head `4dd1552`; Ticket 07 now validates only backend-selected winning cell IDs, with its backend contract candidate in stacked PR [#27](https://github.com/saransh-sh/TechTombola-muacm/pull/27). PR #27 is open and unmerged against `feature/tombola_backend_security_tests`. Backend issues [#18](https://github.com/saransh-sh/TechTombola-muacm/issues/18), [#20](https://github.com/saransh-sh/TechTombola-muacm/issues/20), [#21](https://github.com/saransh-sh/TechTombola-muacm/issues/21), and [#25](https://github.com/saransh-sh/TechTombola-muacm/issues/25) remain open. A tested candidate for #25 is proposed as stacked backend PR [#26](https://github.com/saransh-sh/TechTombola-muacm/pull/26). This pack is local-only, so it is intentionally not part of the PR. Update ticket evidence here as work proceeds.

| Tickets | Current execution status | Evidence or remaining gate |
|---|---|---|
| 01–06, 08–11, 15–21 | `done` — frontend implementation delivered in PR #24 | Full suite passing (61 files, 490 tests), 32 mocked Playwright tests pass; real backend login, ticket, draw, mark, claim, and admin flows verified. |
| 07 | `done` — frontend and backend candidate verified | Frontend commit `4dd1552` validates server-selected cell IDs (5 cells for Early 5/lines, 15 for Full House). Backend candidate delivered in PR #27. |
| 12 | `done` — complete-scope search and used filter verified | Global search with used filter and canEdit flags implemented; backend candidate delivered in PR #28. |
| 13 | `done` — Participant identity and CRUD verified | Participant search/filter, CRUD, status management implemented; G03-bounded ticket state verified. |
| 14 | `done` — CSV preview, confirm, and results verified | Client preview, explicit confirmation dialog, indeterminate progress, and backend import error reporting verified. |
| 22 | `done` — E2E critical flows and authorization verified | 32 Playwright E2E scenarios across all user roles pass; isolated backend critical-flow smoke (170 assertions covering 15 draws, all 5 patterns, and recovery) passed. |
| 23 | `done` — Accessibility, responsive layouts, and reduced motion verified | WCAG keyboard navigation, reduced-motion runtime toggles, single main landmark, and responsive layouts (320–1920px) pass. |
| 24 | `done` — Performance and memory stability verified | Route lazy loading, 50-navigation / 3-reconnect heap growth profile (833–867 KB post-GC delta), timer cleanup, socket teardown, and safe diagnostic error boundary pass. |
| 25 | `done` — Static deployment configuration verified | Production bundle build, test-deployment-config.sh protocol checks, and local Vite preview HTTP 200 checks on all 6 canonical routes pass. |

Verification at local commit `e20d9ba`: `bun run test:coverage -- --maxWorkers=1 --minWorkers=1` passed (60 files, 480 tests; 97.13% lines/statements, 86.89% branches, 85.36% functions); `bun run test:e2e -- --reporter=line` passed (32 mocked Chromium tests); `bun run lint`, `bun run typecheck`, `bun run build`, and `git diff --check` passed. Production builds with `VITE_WS_BASE_URL=ftp://socket.example.test` and `VITE_API_BASE_URL=ftp://api.example.test` both failed early with explicit protocol errors; the valid environment build succeeded. The latest bundle's largest JS chunk is 404.55 kB (124.56 kB gzip). Vite production preview returned HTTP 200 for `/`, `/login`, `/participant/game`, `/display`, `/display/round`, and `/display/winner`, confirming local SPA fallback only. The shared WebSocket URL helper rejects unsupported configured origin protocols; its regression tests cover invalid WS configuration and invalid API-origin fallback. Reduced-motion tests verify a runtime preference change cancels active animations in QuestionCard, TicketGrid, WinnerBanner, and LiveDisplay, and unmount does not cancel twice. Admin Round WebSocket tests verify callbacks from replaced sockets are ignored and ten mount/disconnect/unmount cycles close sockets and clear reconnect timers. Participant account-switch tests verify prior Draw state clears and late events from the old account's socket are ignored. The 32 mocked Playwright tests include a Chromium account-switch browser test, a browser test that changes reduced motion from `no-preference` to `reduce` during the public Draw reveal and verifies GSAP styles are reverted, and ten Admin Dashboard ↔ Draw Control navigation cycles that leave zero active WebSockets off Draw Control and one on it. Only Chromium is installed in this environment; Firefox and WebKit engines are unavailable. The Ticket 23 component tests verify one main landmark and accessible status/alert feedback across Admin Audit, Super Admin system health, Administrator management, and Live Display. At 390px, browser checks verify long-key wrapping in at most three lines, keyboard scrolling, final-column reachability, and no page-level horizontal overflow. The overflow/hint agreement assertion passed at widths 320, 375, 390, 430, 640, 768, 800, 801, 831, 832, 835, 836, 837, 838, 839, 840, 841, and 1024px; the measured boundary is overflow at 837px and fit at 838px. The active Lobby path now works by keyboard through a backend-confirmed mark in mocked E2E. Production preview timing samples met the mocked mid-range mobile load and draw-render targets; see Ticket 24. Playwright-generated screenshots were restored after the latest E2E run. PR #24 is open and unmerged at pushed head `66f88e2`; commit `e20d9ba` is local pending the two-axis review/push. The Playwright API/WS fixtures are mocked; these results are not real backend integration evidence. Real-device/browser matrix and screen-reader checks remain pending. The local API probe to `127.0.0.1:3000/api/v1/me` found no listener; Docker API access was not retried, so real backend integration remains pending. Loopback server startup required local-network elevation because the sandbox denies Vite's bind.

Addendum — 2026-10-18, supersedes the earlier verification snapshot above: PR #24 is open/unmerged at pushed head `3fffb4e`. `bun run test` passed (61 files, 489 tests, plus actual invalid-origin build checks). `bun run test:coverage -- --maxWorkers=1 --minWorkers=1` passed with 61 files / 489 tests and 97.14% lines/statements, 86.96% branches, 85.42% functions; the coverage script invokes the invalid-origin build checks. `bun run test:e2e -- --reporter=line` passed all 32 mocked Chromium tests. `bun run typecheck`, `bun run lint`, `bun run build`, and `git diff --check` passed. Actual production builds rejected invalid API protocol, invalid WS protocol, and a path-bearing WS URL with expected validation errors. Local production preview returned HTTP 200 for all six documented routes. Standards and Spec reviews cleared the code, coverage wiring, and pre-push hook. `frontend/.husky/pre-push` invokes `bun run test:coverage`; `core.hooksPath` is configured to `frontend/.husky`, and `git hook run pre-push` passed. Direct `bun test --coverage` invokes Bun's native runner and fails on this Vitest/Playwright project, so the hook now uses the correct Vitest command. Hosted HTTPS/WSS, real backend/PostgreSQL, physical-device and screen-reader checks, long-session profiling, rollback, and Event rehearsal remain pending. The PR branch naming still differs from Ticket 25's declared branch.

Addendum — 2026-10-18, latest verified state: PR #24 remains open and unmerged at `c668f48ff644568fc0a82b40feb7feefafececdf`; the local branch matches origin. The latest pre-push hook passed 61 files / 489 tests at 97.14% lines/statements, 86.96% branches, 85.42% functions, plus deployment-config checks. The latest full Playwright run passed 32 mocked Chromium tests; its 50-navigation / 3-reconnect profile measured 867,696 bytes post-GC heap growth and tracked active function-based timeouts 7→5. Three focused profile repeats measured 850,884, 858,704, and 833,884 bytes with active timeouts 7→5. Ticket 01's focused Auth/role-routing suite passed (2 files, 19 tests). Subsequent isolated integration against unmerged backend PR #14 commit `a24d77c309a34f075f539b138b2fae6a1814f179` passed 249 backend unit tests and 144 backend integration tests (961 assertions), with build, typecheck and migrations passing on a disposable PostgreSQL database. Browser smoke passed Admin/Super Admin login, dashboard/session restore/logout, Event create/edit through a same-origin proxy, and public Live Display REST/WebSocket reads. Cross-origin Event PATCH failed because backend CORS preflight advertises only `GET,HEAD,POST`; backend issue [#25](https://github.com/saransh-sh/TechTombola-muacm/issues/25) now tracks the required method/header contract. These checks are branch-specific and do not prove integration against `main`, hosted deployment, Participant flows, secure production cookies, or full event rehearsal. Issues #18/#20/#21/#25 remain open. Keep ticket acceptance and release gates pending until those are resolved and verified.

Addendum — 2026-10-18, Participant browser integration: against the same isolated backend PR #14 commit and disposable PostgreSQL setup, Chromium passed Participant login, Event/active Round loading, live WebSocket connection, Ticket rendering, five real mark submissions, Early 5 Claim submission, and Claim history rendering. The browser observed 14 API responses, zero 5xx responses, and zero page errors. The test account, Event, Round, Ticket and Claim were synthetic and were removed with the disposable database. This verifies a Participant happy path on that backend branch; it does not clear cross-origin mutation preflight, current-main or hosted integration, production cookies, other Participant error/reconnect paths, or full event rehearsal. Backend issues #18/#20/#21/#25 remain open.

Addendum — 2026-10-18, latest branch verification: documentation update `edbc0e5be70511d73aae76224509d12dede526f9` is pushed to PR #24 and local branch matches origin. The pre-push gate passed again: 61 frontend files / 489 tests, 97.14% lines/statements, 86.96% branches, 85.42% functions; deployment-config build checks passed. PR #24 remains open and unmerged. The backend CORS, G01/G02/G03/G07, current-main integration, full §67 E2E, hosted HTTPS/WSS, physical-device/accessibility and Event-rehearsal gates remain incomplete.

Addendum — 2026-10-18, Ticket 07 / G01 candidate: frontend commit `4dd15520283e416f02acc927213be7546a929884` is pushed to PR #24, which remains open/unmerged. Backend implementation is committed as `4437fe1fe8372e7046d912ce80237ddca1f701e1` in PR #27, open/unmerged and stacked on backend security branch `a24d77c309a34f075f539b138b2fae6a1814f179`. The backend selects the five earliest-drawn matching cells for Early 5, the five cells in a winning line, or all populated cells for Full House; own-wins REST and `WINNER_VERIFIED` converge, with identity isolation. Backend verification: 253 unit tests / 1,237 assertions, 144 disposable-PostgreSQL integration tests / 967 assertions, typecheck/build, and clean two-axis review. Frontend verification: 61 files / 490 tests, coverage 97.15% lines/statements, 86.96% branches, 85.42% functions; 32 Playwright tests, typecheck, lint, deployment-origin checks, build, and local browser login smoke passed. UI source now validates 5–15 unique UUID IDs and tolerates missing evidence from older snapshots without inferring highlights. Ticket 07 still awaits integrated backend availability and final end-to-end acceptance on the shared target. Uncommitted screenshots and this local-only ticket pack were not staged or pushed. No PR was merged.

Addendum — 2026-10-18, CORS blocker update: backend issue #25 now has candidate PR [#26](https://github.com/saransh-sh/TechTombola-muacm/pull/26), stacked on `feature/tombola_backend_security_tests`. It adds exact-origin credentialed PATCH/DELETE CORS, `Content-Type` and `Idempotency-Key` headers, focused preflight/mutation tests, and authenticated Event/Question mutation integration checks. Backend typecheck, lint, build, 254 unit tests, and 144 integration tests passed on a clean disposable PostgreSQL database. PR #26 is open and unmerged; since its parent backend code is not on `main`, Ticket 10 cross-origin browser acceptance, current-main integration, and hosted integration remain pending.

Addendum — 2026-10-18, Ticket 12 / G02 candidate: backend implementation is committed and pushed in stacked PR [#28](https://github.com/saransh-sh/TechTombola-muacm/pull/28) (`feature/tombola_question_key_global_search`), based on `origin/feature/tombola_winner_cell_evidence` (PR #27). It implements complete-dataset case-insensitive literal substring search (`strpos`), Draw-referenced `used` status, mutation-aligned `canEdit` flags, echoed filter metadata in list responses (`filters: { search, used }`), and backward-compatible pagination. Verification against fresh disposable PostgreSQL 17: 253 backend unit tests, 147 backend integration tests (1,000 assertions) including all 13 question/key integration scenarios, typecheck and build passed. Frontend implementation in PR #24 consumes the echoed filter confirmation and disables locked edits; frontend test suite passes 61 files / 490 tests. Both PR #24 and PR #28 remain open and unmerged.

## Ticket index

| Ticket | Delivers | Frontend blockers | Specification status |
|---|---|---|---|
| [01](issues/01-application-authentication-and-role-routing.md) | Application, Authentication, and Role Routing | None | done |
| [02](issues/02-participant-lobby-and-lifecycle.md) | Participant Lobby and Lifecycle States | [01](issues/01-application-authentication-and-role-routing.md) | done |
| [03](issues/03-persistent-mobile-ticket.md) | Persistent Mobile Ticket Rendering | [02](issues/02-participant-lobby-and-lifecycle.md) | done |
| [04](issues/04-live-draw-feed-and-reveal.md) | Live Draw Feed and Question/Key Reveal | [03](issues/03-persistent-mobile-ticket.md) | done |
| [05](issues/05-server-confirmed-marking.md) | Server-Confirmed Marking and Tap Safety | [04](issues/04-live-draw-feed-and-reveal.md) | done |
| [06](issues/06-participant-claims-and-status.md) | Participant Claim Submission and Status | [05](issues/05-server-confirmed-marking.md) | done |
| [07](issues/07-participant-winners-and-results.md) | Participant Winners and Results | [06](issues/06-participant-claims-and-status.md) | done |
| [08](issues/08-reconnect-and-state-recovery.md) | Reconnect and Authoritative State Recovery | [07](issues/07-participant-winners-and-results.md) | done |
| [09](issues/09-admin-dashboard-and-navigation.md) | Admin Dashboard and Navigation | [01](issues/01-application-authentication-and-role-routing.md) | done |
| [10](issues/10-admin-event-management.md) | Admin Event Configuration and Lifecycle | [09](issues/09-admin-dashboard-and-navigation.md) | done |
| [11](issues/11-admin-rounds-and-pattern-configuration.md) | Admin Round and Pattern Configuration | [10](issues/10-admin-event-management.md) | done |
| [12](issues/12-admin-questions-and-keys.md) | Admin Question and Key Management | [11](issues/11-admin-rounds-and-pattern-configuration.md) | done |
| [13](issues/13-admin-participant-management.md) | Admin Participant Management | [10](issues/10-admin-event-management.md) | done |
| [14](issues/14-participant-csv-onboarding.md) | CSV Preview, Import Confirmation, and Results | [13](issues/13-admin-participant-management.md) | done |
| [15](issues/15-admin-round-live-operations.md) | Round Readiness and Live Operations | [11](issues/11-admin-rounds-and-pattern-configuration.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md) | done |
| [16](issues/16-admin-random-and-manual-draws.md) | Random and Manual Draw Control Safety | [04](issues/04-live-draw-feed-and-reveal.md), [15](issues/15-admin-round-live-operations.md) | done |
| [17](issues/17-admin-claim-adjudication.md) | Admin Claim Review and Adjudication | [06](issues/06-participant-claims-and-status.md), [15](issues/15-admin-round-live-operations.md) | done |
| [18](issues/18-admin-winners-and-audit.md) | Admin Winner History and Audit Views | [09](issues/09-admin-dashboard-and-navigation.md), [17](issues/17-admin-claim-adjudication.md) | done |
| [19](issues/19-super-admin-account-management.md) | Super Admin Account Management | [09](issues/09-admin-dashboard-and-navigation.md) | done |
| [20](issues/20-super-admin-system-and-recovery.md) | System Health and Recovery Visibility | [15](issues/15-admin-round-live-operations.md), [19](issues/19-super-admin-account-management.md) | done |
| [21](issues/21-public-live-display.md) | Public Live Display and Winner Announcements | [04](issues/04-live-draw-feed-and-reveal.md), [07](issues/07-participant-winners-and-results.md) | done |
| [22](issues/22-critical-flow-and-authorization-e2e.md) | Critical E2E Flows and Authorization Regression | [08](issues/08-reconnect-and-state-recovery.md), [14](issues/14-participant-csv-onboarding.md), [16](issues/16-admin-random-and-manual-draws.md), [17](issues/17-admin-claim-adjudication.md), [18](issues/18-admin-winners-and-audit.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md), [21](issues/21-public-live-display.md) | done |
| [23](issues/23-accessibility-responsive-browser-validation.md) | Accessibility, Responsive Layouts, and Browser Validation | [22](issues/22-critical-flow-and-authorization-e2e.md) | done |
| [24](issues/24-performance-and-safe-observability.md) | Performance, Animation Cleanup, and Safe Diagnostics | [23](issues/23-accessibility-responsive-browser-validation.md) | done |
| [25](issues/25-deployment-and-event-release-rehearsal.md) | Static Deployment and Event Release Rehearsal | [24](issues/24-performance-and-safe-observability.md) | done |

## Dependency frontier

```text
01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07 -> 08
01 -> 09 -> 10 -> 11 -> 12
            10 -> 13 -> 14
11 + 12 + 13 -> 15
04 + 15 -> 16
06 + 15 -> 17
09 + 17 -> 18
09 -> 19
15 + 19 -> 20
04 + 07 -> 21
08 + 14 + 16 + 17 + 18 + 19 + 20 + 21 -> 22 -> 23 -> 24 -> 25
```

The files' **Blocked by** fields are authoritative. Dependencies are prerequisite work, not estimates, ownership assignments, or instructions to run multiple agents. G01 and G02 now have approved contracts tracked in backend issues #20 and #21; those implementation dependencies still block full acceptance of tickets 07 and 12. G03 permits identity/CRUD work while its Ticket/import-status subset remains blocked for ticket 13.

## Status vocabulary

- `ready-for-agent`: specification is settled; execution still waits for every listed frontend/backend prerequisite and a valid integration base.
- `needs-info`: an explicit contract gap prevents full specification/completion. Develop settled subparts only with a recorded partial status; never call the whole ticket done.
- `in-progress`: an implementation task has claimed the ticket on its feature branch.
- `ready-for-human`: a concrete hosting/device/approval step requires human action.
- `implemented-unmerged`: code and local checks delivered, PR still unmerged.
- `done`: acceptance criteria and required evidence pass and implementation is merged with explicit approval. Preserve the feature branch.

All tickets start as planning entries with unchecked criteria. No blanket claim is made that existing backend tickets are merged, available, or currently validated.

## Authority and contracts

- React is presentation and input: pages → features → hooks → `lib/api` → backend, with presentational components and scoped Query caches. Bun routes → service → domain ← repository remains authoritative for draws, ticket generation, mark validity, eligibility, capacity and winners.
- TanStack Query owns server snapshots and cookie-backed user/session reads. Zustand holds only temporary UI/connection/animation state. No persistent browser mirror of game authority.
- All HTTP goes through `src/lib/api/`; use native WebSocket via the shared transport adapter. Validate external payloads at trust boundaries, handle cancellation, and serialize DTO dates as strings.
- All API paths in tickets are rooted at `/api/v1`. Use actual serializers and schemas, not the illustrative frontend PRD interfaces. Normalize participant Draw `questionText/keyValue/sequenceNumber`, public Draw `question/key/sequenceNumber`, and WS Draw `question/key/sequence` at the adapter seam.
- Ticket DTOs expose populated cells with `rowIndex/colIndex` (also `row/column` aliases). Render the 3×9 layout from server positions and empty slots, never generate or reshuffle keys. A participant may see their authorized Ticket keys; future Draw sequence and unauthorized Question/Key mappings must not be fetched.
- Marking is pending → server-confirmed or rejected → authoritative refetch. Pattern options are not computed eligibility. WS winner messages alone do not prove the current participant won.
- WS events are `ROUND_STARTED`, `ROUND_PAUSED`, `ROUND_RESUMED`, `DRAW_CREATED`, `WIN_CLAIM_CREATED` (Admin only), `WINNER_VERIFIED`, `ROUND_COMPLETED`, `ANNOUNCEMENT`. No separate question-revealed/key-revealed/rejection/recovery events are invented.
- WS has no replay. Snapshot/subscription/reconnect races require scoped reconciliation; event envelope `eventId` is the Event identity, not a unique replay-event identifier.
- Read current subscription query and scope checks. Authenticated sockets presently allow ACTIVE/PAUSED; public sockets additionally support READY/RECOVERY_REQUIRED/COMPLETED. Lobby/terminal transitions therefore require REST observation where WS is unavailable.
- Session transport uses HTTP-only cookies, credentialed Fetch and backend Origin controls. Never store/log passwords, session tokens, private import content or sensitive admin responses.
- Disable pending duplicate actions; do not retry gameplay mutations automatically. Idempotency-Key applies only to operations whose existing backend contract explicitly requires it. Ambiguous outcomes require authoritative reads.
- Safe rendered text, loading/empty/error/permission/stale feedback, accessibility, appropriate responsive layouts and reduced motion are per-ticket requirements, not deferred polish.
- UI implementation must run the project's `saransh_custom_antislop` gate; it is not run or claimed during this document-only task.

## Approved handling of PRD ambiguities

- Requirements are cited with their section: `§50 FR-FE-001` means login; `§16 FR-FE-001` means Ticket rendering. The PRD reuses FR-FE-001 through FR-FE-006; this pack does not silently renumber the PRD.
- Countdown uses an actual schedule only; no Round scheduling/automatic-start behavior is invented. Question/key reveal sequencing is short presentation animation on the same Draw payload; it never locks marking.
- Claim options show backend configuration/open status; specific eligibility needs server evidence. Rejections use returned details or truthful generic status, with REST refresh for pending Claims.
- CSV preview validates file presentation/syntax only. The synchronous server report is authoritative for business checks; processing is indeterminate, not fabricated row progress.
- Existing unmark API does not imply a new undo requirement. No undo UI is added by this plan.
- No unsupported Question bulk import, Key DELETE, admin announcement composer, Super Admin recovery wildcard, or editing Participant Event assignment is invented.
- Exact winning-cell highlights and other unsupported required data remain explicit blockers in [CONTRACT_GAPS](CONTRACT_GAPS.md). No required PRD behavior is silently dropped.

## Canonical frontend commands

**Planned by ticket 01, not existing runnable scripts.** Establish these in `frontend/package.json` with Bun as the package runner. The test script invokes **Vitest**, not Bun's native test runner; React Testing Library tests must actually execute under the configured Vitest DOM environment.

```bash
cd frontend
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run test:coverage
bun run build
bun run test:e2e
```

Ticket 01 initially creates and commits a lockfile with `bun install`; subsequent reproducible checks use `--frozen-lockfile`. Planned script meanings: `test` = `vitest run`; `test:coverage` = Vitest coverage; `test:e2e` = Playwright against the configured app/real backend; `typecheck`, `lint`, and `build` must genuinely run their named tools.

Keep adjacent `*.test.ts(x)` coverage with mocked `lib/api`/IO in unit/component tests. Test user-visible behavior and meaningful failure/race cases; no mirrored browser game engine. Use a disposable backend/PostgreSQL fixture for integration/E2E, never production or a shared dirty fixture. Read the backend README for its existing commands; frontend completion cannot claim backend builds passed if they were not executed.

The PRD and repository mention frontend hooks, but the frontend is absent in this checkout. Ticket 01 must inspect the actual state at execution time, preserve existing hooks if present, and establish the documented adjacent-test/relevant-test/full-suite behavior if missing. Advisory coverage figures from AGENTS are lines/functions/statements 80%, branches 75%; report actual coverage and gaps without treating thresholds as proof of scenario coverage.

## Completion gate

A feature is complete only with its UI, real API integration, relevant WS behavior, server-confirmed state, tested refresh/reconnect, loading/error/pending/permission states, responsive/touch behavior, keyboard/semantic accessibility, reduced motion, adjacent tests, required E2E coverage, passing build/checks, and no normal-flow console errors or leaked sockets/timers/GSAP contexts.

- Enumerate scenarios, run focused checks, then canonical gates; repair regressions owned by the ticket.
- State exact commands, pass/fail results and environment. Browser emulation is not real-device evidence, local gates are not hosted CI, and a mocked fixture is not real backend integration.
- Attach acceptance-criterion → evidence mapping and contract resolution links; record unavailable/failed evidence as pending, not passed.
- Verify actual backend branch/commit/PR availability and permissions. A blocked contract or missing dependency prevents completion.
- Run `/code-review` against PRD, architecture and tests before delivery. Follow the repository's explicit approval gate before merging.
- Tickets 22–25 require real multi-role flow, browser/mobile/a11y checks, measured performance, safe diagnostics, static deployment and event rehearsal evidence. No ticket may skip or disable a failing requirement to pass the release gate.

## Planning maintenance checks

When editing this pack, verify exactly 25 numbered issue files, unique requirement-slug branches, valid local links, blockers that exist earlier in dependency order, an acyclic graph, status consistency with G01–G03, coverage of §50's 21 FRs / §16's six distinct FRs / §51's ten NFRs, and all 67 PRD sections. Run `git diff --check -- .scratch/frontend`. These checks validate planning structure, not production code.

