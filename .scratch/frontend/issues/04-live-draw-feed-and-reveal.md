# 04 — Live Draw Feed and Question/Key Reveal

**What to build:** /participant/game: QuestionCard, KeyReveal, DrawHistory, RoundStatus, connection indicator.

**PRD traceability:** Frontend PRD §§13, 14, 15, 18, 19, 20, 22, 23, 24, 42, 49, 58, 62; §50 FR-FE-004, §50 FR-FE-005, §50 FR-FE-006, §50 FR-FE-020. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [03 — Persistent Mobile Ticket Rendering](03-persistent-mobile-ticket.md)

**Backend prerequisite:** Backend tickets 11 and 13: existing authenticated WebSocket and Draw read contracts; no new reveal events or domain behavior.

**Branch:** `feature/tombola_frontend_live_draw_feed_and_reveal`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend tickets 11 and 13: existing authenticated WebSocket and Draw read contracts; no new reveal events or domain behavior.
- **Frontend:** /participant/game: QuestionCard, KeyReveal, DrawHistory, RoundStatus, connection indicator.
- **API/data:** GET /api/v1/participant/draws; GET /api/v1/participant/round/current; /api/v1/ws with the backend's validated Round subscription query. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Load REST snapshots, consume validated server events, and reconcile after subscription establishment so the initial snapshot/subscription gap cannot lose a Draw.
- Normalize actual REST and WS field differences in API/transport adapters. WS Draw payload has no key ID: refetch safe authoritative data before ID-dependent presentation; do not fabricate IDs or future mappings.
- Treat matching a revealed key to an already authorized Ticket as a visual hint only. Use short GSAP transforms/opacity with cleanup and reduced motion; reveal animation never gates marking.
- Handle lifecycle events, duplicate/stale/out-of-order Draws, unknown/malformed messages, and wrong Event/Round scope without a page reload.

## Non-goals

No client commands over WebSocket, staged server reveal, local Draw selection, or offline gameplay queue.

## Acceptance criteria

- [x] Current question, revealed key, chronological history, and matching hints converge with REST without remounting the entire app.
- [x] Reduced motion and rapid Draws preserve readable current content; the latest authoritative state is never hidden by queued animation.
- [x] No quiz form, hidden Question preload, or client-generated draw validity appears.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- No/one/many Draws; REST/WS shape normalization; rapid consecutive Draws; duplicate sequence; out-of-order response.
- Draw between initial snapshot and subscription; wrong scope; malformed/unknown event; lifecycle transition while fetching.
- Reduced-motion setting, unmount cleanup, animation interruption, history ordering and keyboard readability.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via ParticipantGame.test.tsx (14 tests), draws.test.ts, and participant.spec.ts. Live DRAW_CREATED receipt, question and key presentation animation, chronological draw order, and unread indicator verified.
