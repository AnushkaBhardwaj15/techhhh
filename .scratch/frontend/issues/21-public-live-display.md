# 21 — Public Live Display and Winner Announcements

**What to build:** /display, /display/round, /display/winner; large-screen layout, current clue/key, history, lifecycle and verified Winners.

**PRD traceability:** Frontend PRD §§5, 9, 19, 20, 21, 25, 28, 36, 37, 38, 45, 46, 49, 53, 60, 62; §50 FR-FE-019, §50 FR-FE-020, §50 FR-FE-021. Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [04 — Live Draw Feed and Question/Key Reveal](04-live-draw-feed-and-reveal.md); [07 — Participant Winners and Results](07-participant-winners-and-results.md)

**Backend prerequisite:** Backend ticket 17: public safe read DTOs and separate read-only public transport; no privileged auth/data access.

**Branch:** `feature/tombola_frontend_public_live_display`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 17: public safe read DTOs and separate read-only public transport; no privileged auth/data access.
- **Frontend:** /display, /display/round, /display/winner; large-screen layout, current clue/key, history, lifecycle and verified Winners.
- **API/data:** GET /api/v1/live/event|round|draws|winners; /api/v1/live/ws with the actual public subscription query. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Use public endpoints/caches exclusively; handle null Event/Round and empty grouped Winners/Draws without falling back to private APIs.
- Target 16:9 at 1280×720, 1366×768 and 1920×1080 with distance-readable text, long-content handling and reduced-motion transitions.
- Display public-safe Winner/ANNOUNCEMENT events and reconcile REST after connect/reconnect. G04 records the missing announcement producer; consumer support does not imply an admin authoring feature.
- Handle READY/ACTIVE/PAUSED/RECOVERY_REQUIRED/COMPLETED, cancellation/current Event changes and connection loss safely; clean up old subscription scope.

## Non-goals

No admin announcement composition, public mutations, participant Ticket display, future content, or new display authentication.

## Acceptance criteria

- [x] Anonymous display follows current public game/Winner state and recovers after refresh/network loss.
- [x] Emails, Sessions, pending Claims, future Questions, private Audit and mutation controls cannot appear.
- [x] Projector layouts remain readable and usable with long Question/Key/name content and no autoplay animation blocking state.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- No live Event/Round; empty Draws/Winners; each lifecycle state; Event/Round replacement.
- Public Draw/Winner/announcement; malformed/private event rejected; snapshot/event race and reconnect.
- All projector sizes, long strings, reduced motion, duplicate Winner events and no authenticated API fallback.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via LiveDisplay.test.tsx (16 tests), liveDisplaySocket.test.ts, and live-display.spec.ts. Public projector view, real-time draw reveal, verified winner banners, announcements, and empty/no-event states verified.
