# Tech Tambola — implementation handoff

Updated 2026-10-24. The user requested this handoff to conserve their remaining usage. Stop broad exploratory work and resume from the concrete state below.

## Latest user request — prioritize before final delivery

After this handoff was written, the user added these requirements:

- They will provide an **Excel file with questions and answers**. Support importing that file into the game rather than requiring staff to enter each question manually. The file has **not yet been attached**; inspect its actual sheet/columns when supplied, rather than inventing a required spreadsheet layout now.
- Replace the admin's long, manually selectable 90-question bank with clear **Next** and **Previous** controls. The user explicitly said clicking individual questions out of 90 makes no sense.
- Next should advance through the imported question order, calling each new question exactly once. Returning to an already called question must navigate existing history rather than create a duplicate draw. Previous displays an earlier called clue; it must not delete/reverse official calls, marks, wins, or points. This history-preserving meaning was stated to the user in the acknowledgment; no undo requirement was given.
- Retain the separate answer-reveal behavior unless the user changes it. Keep unrevealed answers protected on the server even when navigating history.
- Import validation/persistence and draw ordering belong to the backend; frontend handles file selection, import feedback, and navigation. Reject malformed/missing Q&A rows with useful row feedback and avoid partially importing an invalid file. Preserve ticket/key compatibility: never replace a started round's question/key set or regenerate participants' assigned tickets. Use a fresh unstarted round for a changed bank.
- The current fixed 90-item reference bank is a fallback/reference implementation, not a reason to ignore the user's forthcoming Excel bank. Inspect answer uniqueness and bank size, and report actual compatibility issues from the supplied file instead of silently dropping or changing rows.

**Status:** These latest Excel-import and simplified-navigation changes are recorded only; they have **not been implemented**. Current `AdminGamePage` still has random next-call and manual bank-selection controls. The next agent should implement this revised flow before treating the work as ready. Do not run another broad UI redesign.

## Workspace and safety

- Repository: `C:\tambola\techhhh`.
- Current branch: **`ashutosh`**, explicitly requested by the user. Do not create another branch or reset this checkout just to satisfy the default branch convention.
- **All work is currently uncommitted. No push, PR, or merge has been performed.**
- There are extensive earlier UI changes and new game changes in this same working tree. Preserve both. `backend/bun.lock` and `frontend/bun.lock` already had modifications before this work; do not blindly restore them.
- Follow `AGENTS.md`, `docs/ARCHITECTURE_CODING_STANDARDS.md`, and applicable `.cursor/rules/`. Routes → service → domain ← repository. React never evaluates official game eligibility.
- User waived grilling for UI and repeatedly asked to proceed. The game-rule questions below have already been answered; do not ask them again.
- No need to create another chat or subagent merely to read this document. The user asked for a Markdown handoff, not a new chat.

## Accepted requirements

1. Mobile-first Midnight Circuit theme across all pages, title **Tech Tambola**. Reference palette: navy `#081220`, cyan `#00e5ff`, lime `#a3ff4b`, ice `#e6f3f3`.
2. Use 21st/Aceternity inspiration while preserving the app architecture. Earlier work adapted an Aceternity-style shared ActionButton and recorded design context in `frontend/.21st/`.
3. Entry/participation page contains game-code verification. Move the practice ticket simulator to a separate waiting lobby after joining. Admin start moves the participant automatically into play.
4. Waiting lobby has a **Back to participation** button. This is already implemented and tested.
5. Match gameplay from **`C:\tambola-final\Tambola-31stOct`**, keeping the current Bun/Fastify/PostgreSQL/native-WebSocket architecture.
6. Copy its exact 90-item technology bank, clues, and code snippets, and its numbered/banded 3×9 ticket layout with 15 populated cells, five per row, four populated corners, and ascending numbers down columns.
7. **Wrong claims only warn. No point deductions, penalties, or cells cut from tickets.**
8. User confirmed **reference marking behavior**: participants can manually mark/unmark any cell on their own ticket, including an uncalled term. Eligibility is checked on the backend using **saved marks intersecting official calls**. This explicit instruction supersedes the older PRD's blanket prohibition of uncalled manual marks. Participants do not submit quiz answers.
9. Clue first; admin reveals answers separately, individually or in a batch. Unrevealed answers and item numbers must be removed on the server for participant/public responses.
10. User explicitly confirmed copying the two extra prizes and reference points:

| Pattern | Points |
| --- | ---: |
| Early Five | 10 |
| Four Corners | 20 |
| Top Line | 30 |
| Middle Line | 30 |
| Bottom Line | 30 |
| Full House | 50 |
| Second Full House | 30 |

Second Full House is for a different participant after the first Full House. The first Full House starts the reference closing window; Second Full House or ten additional calls completes the round.

## Implemented UI and lobby work to preserve

- Global palette/type/accessibility tokens in `frontend/src/styles/global.css` and themed CSS modules across authentication, participant, admin, landing, live, and operations pages.
- Shared navigation CSS: `frontend/src/components/navigation/Navigation.module.css`; old per-navigation CSS files are intentionally deleted.
- Shared `ActionButton.tsx`, CSS, and tests.
- Entry routes `/lobby` and `/participant/lobby`; waiting route `/participant/waiting` renders `<ParticipantLobby waiting />`.
- Waiting simulator is the existing `SampleTicketDemo`, not a real ticket replacement.
- Scanned `/lobby?code=...` links retain the code and join automatically.
- Joined identity is stored under `tt_verified_code_${user.id}` and `tt_joined_game_${user.id}` in sessionStorage; optional earlier `tt_verified_ticket_${user.id}` remains.
- `ParticipantLobby.join.test.tsx` has 18 passing join/back/waiting cases. Login previously had 12 passing tests; ActionButton has its own passing tests.

## Implemented backend game port

New module: **`backend/src/modules/play/`**.

- `technical-bank.ts`: exact reference source bank copied from reference `backend/src/shared/bank.ts`.
- `play.types.ts`: server state, seven patterns, actor/ticket/draw/win and real database IO interface.
- `play.domain.ts`: pure reference ticket generation, calls, reveal, lifecycle, manual mark, claim evaluation, points, closing logic, sanitized response projection.
- `play.repository.ts`: parameterized SQL against the **existing** Event/Round/key/question/ticket/mark/draw/claim/winner/audit tables. No parallel in-memory authoritative game store. Round row locks serialize mutations; a global advisory lock serializes starts. Ticket layout is persisted, never generated by the browser.
- `play.service.ts`: authorization/orchestration; server crypto randomness; post-commit native WebSocket invalidations. Failed transport delivery does not roll back committed state; clients also poll.
- `play.routes.ts`: Zod request validation and role middleware, all under `/api/v1`.
- Admin create and command actions use idempotency keys. Replaying the same command returns current state without repeating the mutation; reusing a key with different input conflicts.
- Claims are automatically verified by the server when valid; warnings create no negative scoring or damaged cells.
- Current/public selection prioritizes an ACTIVE reference round, otherwise the latest reference round.
- The old insecure `/active-game` route handlers were removed from `backend/src/routes/index.ts`; startup mutation timer was removed from `activeGameStore.ts`.

New endpoints:

```text
GET  /api/v1/play/rounds
GET  /api/v1/play/current
GET  /api/v1/play/rounds/:id
POST /api/v1/admin/play/rounds                 Idempotency-Key required
POST /api/v1/admin/play/rounds/:id/commands    Idempotency-Key required
POST /api/v1/participant/play/join
PUT  /api/v1/participant/play/rounds/:id/marks
POST /api/v1/participant/play/rounds/:id/claims
GET  /api/v1/live/play
```

Commands: `start`, `pause`, `resume`, `end`, `call` (optional numbered manual selection), `reveal` (optional selected call sequences; omission reveals all pending).

### Migration and real database state

**`backend/src/db/migrations/0015_reference_gameplay.sql` HAS BEEN APPLIED to the configured application database** using `bun run db:migrate`. Output confirmed exactly one newly applied migration, 0015. Do not apply its raw SQL a second time.

It adds game code/creation key/closing sequence to rounds, item numbers to event keys, code/category metadata to questions and draws, reveal flags, and expands the round-pattern constraint to seven patterns. Existing historical draw rows default to already revealed.

The configured `.env` database is a Neon-hosted PostgreSQL database. Do not print credentials or the complete URL.

Raw SQL uses `$n::text::jsonb` for serialized JSON string parameters. **Do not simplify this to `$n::jsonb`**: a real PostgreSQL test caught postgres.js inferring JSONB and double-encoding strings, unlike the embedded test adapter.

### Related existing modules changed

- Pattern types/schemas, winner domain and grouped winner responses now include the extra two patterns. Legitimately updated default-pattern tests to seven, unknown-pattern test to `UNKNOWN`, and several typed fixtures.
- Legacy draw and live read repositories mask unrevealed `keyValue` with an empty string. Main new screens use `/play` DTOs with nullable answers instead of those old contracts.
- `RoundRepository.isReferenceRound` and guards in legacy `ClaimService`, `DrawService`, and round lifecycle/configuration methods prevent alternate legacy controls from bypassing reference saved-mark checks, reveal controls, and transitions.
- `backend/src/config/env.ts`: fixed a pre-existing failing validation test by requiring an explicit PostgreSQL DATABASE_URL rather than silently replacing a missing/invalid value with a hardcoded local credential URL. Existing config tests now pass.
- Added `@electric-sql/pglite` as a backend dev dependency for disposable PostgreSQL-compatible repository integration tests.

## Implemented frontend game port

- `frontend/src/types/play.ts`: runtime Zod contracts for authoritative snapshots.
- `frontend/src/lib/api/play.ts`: all new HTTP requests through the existing central API client.
- `frontend/src/lib/gameSync.ts`: server-backed compatibility adapter for existing lobby/dashboard. Removed direct fetch/local game fabrication and unused old post functions.
- `frontend/src/features/participant/usePlayState.ts`: React Query snapshots, 1500ms polling, scoped native WebSocket invalidation/reconnect. Both eventId and roundId are included; no authenticated socket for non-ACTIVE/non-PAUSED states; 1008 policy rejection is not repeatedly reconnected.
- `ParticipantGame.tsx`: real saved ticket, manual server mark requests, server claim results/warnings, seven prizes and points, revealed-only answers, paused/completed/recovery states, call history and standings. No synthetic fallback ticket in this main flow.
- `ReferenceTicket` adapts saved cells to the existing `TicketGrid`; numeric/term display toggle is presentation only.
- `QuestionCard` is a real GSAP clue transition with reduced-motion cleanup, used by the game and covered by existing animation tests.
- `AdminDashboard.tsx`: creates persisted rounds with a stable request key; opens existing round IDs without resetting them.
- `AdminGamePage.tsx`: start/pause/resume/end, random/manual calls, code snippets, question bank search, individual/batch reveals, history and standings. Space calls the next question when not typing in a control.
- `LiveDisplay.tsx`: read-only public snapshot, clue/code, reveal-only official answer, recent calls and standings.
- `/participant/ticket` now uses `ParticipantGame` too, so the main route cannot show a generated browser fallback ticket.
- Existing `ParticipantTicket.tsx` still contains its old standalone implementation, but the routed game only uses its `TicketGrid`. A missing matching-cell ref in TicketGrid was fixed, making its two existing animation cleanup tests pass.
- `ReferencePlay.module.css` styles the new game. Admin 320px horizontal overflow was fixed by removing the search input's 250px min-width and allowing wrapping.

## Review performed and fixes made

Applied the repository code-review skill using independent spec/standards reviewers. Their actionable findings were addressed:

1. Failed commands previously trapped later admin controls into retrying the old action. Now only an explicit retry reuses that command/key, and definitive HTTP 4xx rejection clears it. New admin component tests cover this.
2. Completion previously blocked final pending answer reveals. Reveals now remain allowed after COMPLETED, while new calls/marks/claims remain blocked. Domain and admin component tests cover this.
3. Legacy lifecycle/draw endpoints could bypass the reference command engine. Service guards now reject reference rounds on those paths; new legacy guard tests pass.
4. Embedded PostgreSQL cannot verify actual lock contention. Added and explicitly executed real PostgreSQL tests using independent pooled connections; both pass.

The real PostgreSQL test creates a generated disposable schema, explicitly uses **SET LOCAL search_path inside each transaction**, and drops only that checked generated schema afterward. This matters with Neon transaction pooling: startup search_path settings were insufficient. No application game fixtures were intentionally inserted by these tests. An initial test attempt hit existing public tables because of that pooler behavior; it failed before migration 0012 could proceed, and subsequent attempts use explicit transaction-local scoping. Earlier idempotent audit-trigger DDL was re-executed identically; no application rows were deleted.

## Exact validation state

### Passing

- Latest backend canonical `bun run test`: **298 passed, 0 failed, 4 skipped**, 302 total, 36 files. Some skips are existing opt-in tests; the real PostgreSQL suite is opt-in and was run separately below.
- Real PostgreSQL concurrency suite: **2 passed, 0 failed**, validating competing starts, idempotent concurrent calls, and competing eligible claims on real row locks.
- New domain tests include **1,000 generated layouts**, all 90 calls without duplicates, answer secrecy, single/batch reveal, manual marks, warning-only invalid claims, all seven prizes, first/second house order, closing, pause/completion, and reveal after completion.
- Latest focused frontend set: **49 passed, 0 failed**, across game, animation, live display, admin game, and lobby join tests. See `play-ui-test-results.log`.
- Lobby browser suite: **9 passed** at mobile/desktop, QR join, invalid code, reload, admin-start navigation, back button.
- Theme browser suite: **73 passed, 1 failed** on the first run; the only failure was admin `/game` overflow at 320px. After fixing it, targeted `/game` + `/participant/game` at 320px: **2 passed**. Other cases were not changed by that CSS fix.
- Backend typecheck and build passed during this work. Frontend typecheck passed before the last new admin/live tests and formatting; run final gates again after cleanup.

### Not passing / pending — do not conceal

- Last **full frontend** run, before replacing obsolete game/live tests with the current API contracts: **425 passed / 117 failed**, 12 failing files. This repo already had **104 failing frontend tests before the game port**. Do not claim the full frontend gate passes. Current aggregate count needs a fresh run after the test updates.
- Many older failures assert UI/API contracts replaced in earlier authorized redesign work. They need legitimate reconciliation, not skips or disabling tests. Failing files in that last run: `App.test.tsx`, `AdminDashboard.test.tsx`, `AdminDrawControl.test.tsx`, `AdminEventManagement.test.tsx`, `AdminRounds.test.tsx`, `LandingPage.test.tsx`, `LiveDisplay.test.tsx`, `ClaimPanel.test.tsx`, `ParticipantGame.test.tsx`, `ParticipantLobby.test.tsx`, `ParticipantTicket.test.tsx`, `lib/api/winners.test.ts`.
- `ParticipantGame.test.tsx` and `LiveDisplay.test.tsx` have since been rewritten for the new authoritative contracts and pass in the focused 49-test run. The temporary `ParticipantGame.reference.test.tsx` was moved into `ParticipantGame.test.tsx` and deleted, so do not look for it.
- **Last focused ESLint has one known new error**: unused `_assignedTicketCode` parameter in `frontend/src/lib/gameSync.ts`. It remains for old lobby call shape, but is not used. Remove it and adjust the call/test expectations, or explicitly consume it without changing server-only code validation. Full lint previously also had existing errors in QRCodeSvg, ClaimPanel and old ParticipantTicket.
- Latest frontend build should be rerun. Do not treat the earlier UI-only successful build as final validation of this game port.
- A Prettier invocation formatted the new TS/TSX files successfully but returned exit 1 because it could not infer a SQL parser for migration0015. This was a formatting-tool issue, not a migration failure. Do not run Prettier on SQL without a parser/plugin.

## Next steps, in useful order

1. Fix the one new unused-parameter lint error; run final backend/frontend typechecks and frontend build.
2. Check the actual running app, not only mocked browser transports: login as admin, create a new reference round, join as participant, wait/start, call a code question, verify pre-reveal secrecy, reveal, mark/unmark, make an invalid claim, reload, inspect points/prizes. Migration0015 is already applied. New rounds use the reference bank; old history was not converted into reference rounds.
3. Add/extend a real backend-authenticated end-to-end flow if practical. Existing browser tests mock APIs; the backend repository suites are real SQL but not complete browser+HTTP integration.
4. Reconcile the full frontend test suite with the authorized current screens, preserving meaningful error/security/duplicate-action coverage. Do not restore the obsolete dashboard or ticket simulator just to satisfy old labels.
5. Check these remaining implementation concerns while validating:
   - `ParticipantLobby` still contains older event/current-round/ticket reads and a hardcoded fallback advertised code `8679DE` when it has no current game. Actual joining is server validated, so this does not grant access, but a fake advertised code should be removed and replaced with an honest no-round/loading state.
   - `PlayRepository.create` assigns tickets to all existing active participants. A participant added afterward has no ticket and joining reports an assignment error. Validate the intended admin workflow for late registration; never generate fallback tickets in the browser or regenerate assigned tickets.
   - Server restart recovery uses the existing RecoveryService. New screen shows RECOVERY_REQUIRED but has no direct recovery control; existing system/operations recovery UI remains. Verify recovery snapshots with reference metadata and ensure global lock conventions remain consistent if changing this.
   - New snapshot polling currently loads internal bank data on every repository read, even participant/public reads, and polls every 1.5s. Consider focused optimization only if needed for the 500-participant requirement; do not introduce Redis or another architecture.
   - New hook errors currently rely on the generic API/session infrastructure; explicitly verify 401 expiry and stale-snapshot action states during end-to-end checks.
   - Review legacy read DTOs that require nonempty keyValue while the repository deliberately masks an unrevealed answer to empty; main reference screens use nullable new DTOs, but older secondary screens may need an explicit reveal-aware contract.
6. Update relevant PRD/domain documentation with the explicitly accepted reference behavior and point values. Older PRD uncalled-mark rules are now overridden by this user request and should not silently mislead future agents.
7. Repeat focused review if substantive fixes are made. Commit/push/PR only once mandatory gates are honestly satisfied. No merge without explicit user approval.

## Commands

Run commands in the package directory shown; root does not provide build/typecheck scripts.

```powershell
# C:\tambola\techhhh\backend
bun run typecheck
bun run build
bun run test
bun test src/modules/play

# Explicit opt-in real PostgreSQL suite. Credentials remain in process env.
bun -e "const p=Bun.spawn(['bun','test','src/modules/play/play.postgres.test.ts'],{env:{...process.env,PLAY_POSTGRES_TEST_URL:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL},stdout:'inherit',stderr:'inherit'});process.exit(await p.exited);"

# C:\tambola\techhhh\frontend
bun run typecheck
bun run build
bunx vitest run src/features/participant/ParticipantGame.test.tsx src/features/participant/ParticipantGame.animation.test.tsx src/features/live/LiveDisplay.test.tsx src/features/admin/AdminGamePage.test.tsx src/features/participant/ParticipantLobby.join.test.tsx
bunx vitest run
$env:PLAYWRIGHT_CHANNEL='msedge'
bunx playwright test e2e/lobby-join.spec.ts
bunx playwright test e2e/theme.spec.ts
```

Default Playwright Chromium is not installed; installed Edge works. Vite server was running on 127.0.0.1:4173 and backend on port3000 at handoff. Check current processes before starting duplicates.

Ignored local logs at repo root: `backend-test-results.log`, `frontend-test-results.log`, `play-ui-test-results.log`, `theme-test-results.log`. They can contain enormous DOM dumps; extract summary lines with Python rather than printing the entire files. Earlier screenshots are under `C:\Users\ashut\.codex\visualizations\2026\10\24\01a16da9-cd5c-74b1-8b3d-b61524281eeb` and frontend Playwright test-results.

## Communication to user

Last report: core game changes implemented, backend and focused UI checks pass, final test cleanup and actual-app end-to-end verification remain. Estimated roughly 20–40 minutes depending on obsolete frontend tests; this is not a guarantee. User wants to conserve usage, so be concise, avoid repeating exploration or grilling, and use this handoff directly.
