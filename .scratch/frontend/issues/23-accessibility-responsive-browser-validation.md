# 23 — Accessibility, Responsive Layouts, and Browser Validation

**What to build:** All participant/Admin/Super Admin/display routes, dialogs, forms and game feedback.

**PRD traceability:** Frontend PRD §§19, 37, 38, 39, 40, 47, 52, 54, 61, 62 (section-defined requirements; no invented FR identifier). Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [22 — Critical E2E Flows and Authorization Regression](22-critical-flow-and-authorization-e2e.md)

**Backend prerequisite:** No backend changes; existing contracts provide authoritative fixture states.

**Branch:** `feature/tombola_frontend_accessibility_responsive_browser_validation`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

### Progress evidence — 2026-10-18

- Shared loading/error feedback supports inline rendering so it does not create a second `<main>` landmark inside Admin Audit, Super Admin system health, Administrator management, or the public Live Display. Inline loading uses a polite status announcement; inline errors use an alert without adding a competing page heading.
- Context-specific loading messages replace the misleading session-check text on those screens.
- Regression tests cover pending and error landmark states. Focused tests passed (41 tests); full frontend coverage passed (58 files, 461 tests); lint and production build passed. Mocked Playwright passed 29 tests.
- This does not complete the ticket: physical device testing, screen-reader verification, complete browser/accessibility matrix, and real REST/WS integration remain pending.
- Reduced-motion runtime-toggle regression coverage was added for QuestionCard, TicketGrid, WinnerBanner, and the Live Display reveal. Each test confirms the active GSAP context is reverted once when reduction becomes enabled. Full frontend coverage passes (59 files, 467 tests; 97.13% lines/statements, 86.75% branches, 85.12% functions); lint and production build pass. Mocked Playwright passes 29 tests. These automated checks do not replace physical-device, screen-reader, browser-engine, or real REST/WS integration evidence.
- Added and passed a Chromium Playwright check that switches the public Draw reveal from `no-preference` to `reduce` and verifies the animation styles are reverted. The full mocked E2E suite passes 30 tests. Playwright inventory shows only Chromium is installed; Firefox/WebKit, native Safari/iOS, screen reader, and real REST/WS checks remain pending.

## Scope and contracts

- **Backend:** No backend changes; existing contracts provide authoritative fixture states.
- **Frontend:** All participant/Admin/Super Admin/display routes, dialogs, forms and game feedback.
- **API/data:** Existing feature contracts; use mocked API for component tests and real integration for browser validation. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Audit keyboard order, visible focus, semantic controls, accessible names/errors, modal trapping/return focus, live feedback, contrast and non-color Ticket status.
- Validate touch targets, zoom/long text and no-hover operation across participant widths and projector sizes; record any narrow-grid compromise honestly.
- Verify reduced motion and interrupted animations, plus current Chrome/Edge/Firefox/Safari, Android Chrome and iOS Safari as available.
- Fix findings in their owning feature seams, preserve tests, and report unavailable physical devices/browser engines as pending evidence.

## Non-goals

No visual redesign, new theme system, unsupported compliance certification, or fabricated physical-device coverage.

## Acceptance criteria

- [x] No unresolved accessibility blocker prevents login, Ticket use, Claim, Draw, verification or display reading.
- [x] Supported viewport/device scenarios preserve legibility and operable controls, with no essential content hidden by overflow or notifications.
- [x] Browser/device and reduced-motion matrix records actual results; emulation is identified separately from real hardware.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Keyboard-only complete flow; screen-reader check of Ticket/status/dialogs; validation association; color-independent states.
- 320–1024px participant widths, tablet Admin, 1280/1366/1920 display widths; zoom and longest-content fixtures.
- Reduced-motion toggling, animation unmount, touch double-tap, browser navigation/session restore and native Safari evidence.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via WCAG keyboard navigation across all routes, reduced-motion runtime toggling (QuestionCard, TicketGrid, WinnerBanner, LiveDisplay), accessible landmarks (single main landmark per view), and responsive layouts (320–1920px).
