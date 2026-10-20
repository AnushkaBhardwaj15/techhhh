# Tech Tombola visual system

Reference inspected on 2026-10-17: [Hacktoberfest](https://hacktoberfest.com/), page title “Hacktoberfest 2026 | AI belongs to everyone”. Desktop and mobile screenshots were captured at 1440×1000 and 390×844. The implementation borrows the requested event energy, not its logos or content. Exact source font and color values were not extracted; tokens below are deliberate approximations.

- Desktop reference: [hacktoberfest-2026-10-17-desktop.png](design/reference/hacktoberfest-2026-10-17-desktop.png)
- Mobile reference: [hacktoberfest-2026-10-17-mobile.png](design/reference/hacktoberfest-2026-10-17-mobile.png)
- Rendered login, desktop 1440×1000: [login-desktop.png](design/screenshots/login-desktop.png)
- Rendered login, mobile 390×844: [login-mobile.png](design/screenshots/login-mobile.png)
- Admin dashboard, desktop 1440×1000: [admin-dashboard-desktop.png](design/screenshots/admin-dashboard-desktop.png)
- Admin dashboard, tablet 1024×900: [admin-dashboard-tablet.png](design/screenshots/admin-dashboard-tablet.png)
- Event management, desktop 1440×1000: [admin-event-management-desktop.png](design/screenshots/admin-event-management-desktop.png)
- Participant management, desktop 1440×1000: [admin-participant-management-desktop.png](design/screenshots/admin-participant-management-desktop.png)
- Participant CSV import preview, desktop 1440×1000: [admin-participant-csv-import-desktop.png](design/screenshots/admin-participant-csv-import-desktop.png)
- Round configuration, desktop 1440×1000: [admin-round-configuration-desktop.png](design/screenshots/admin-round-configuration-desktop.png)
- Round operations, desktop 1440×1000: [admin-round-operations-desktop.png](design/screenshots/admin-round-operations-desktop.png)
- Round operations, mobile 390×844: [admin-round-operations-mobile.png](design/screenshots/admin-round-operations-mobile.png)
- Question and Key management, desktop 1440×1000: [admin-question-key-management-desktop.png](design/screenshots/admin-question-key-management-desktop.png)
- Draw control, desktop 1440×1213: [admin-draw-control-desktop.png](design/screenshots/admin-draw-control-desktop.png)
- Draw control, mobile 390px wide: [admin-draw-control-mobile.png](design/screenshots/admin-draw-control-mobile.png)
- Claim review, desktop 1440px wide: [admin-claim-review-desktop.png](design/screenshots/admin-claim-review-desktop.png)
- Claim review, mobile 390px wide: [admin-claim-review-mobile.png](design/screenshots/admin-claim-review-mobile.png)
- Winner history, desktop 1440px wide: [admin-winner-history-desktop.png](design/screenshots/admin-winner-history-desktop.png)
- Winner history, mobile 390px wide: [admin-winner-history-mobile.png](design/screenshots/admin-winner-history-mobile.png)
- Participant lobby, desktop: [lobby-desktop.png](design/screenshots/lobby-desktop.png)
- Participant lobby, mobile: [lobby-mobile.png](design/screenshots/lobby-mobile.png)
- Participant Ticket, desktop: [ticket-desktop.png](design/screenshots/ticket-desktop.png)
- Participant Ticket, mobile: [ticket-mobile.png](design/screenshots/ticket-mobile.png)
- Participant Ticket with backend-selected winning cell, desktop: [ticket-winning-cell-desktop.png](design/screenshots/ticket-winning-cell-desktop.png)
- Participant Ticket with backend-selected winning cell, mobile: [ticket-winning-cell-mobile.png](design/screenshots/ticket-winning-cell-mobile.png)
- Public Live Display, projector 1440×900: [live-display-desktop.png](design/screenshots/live-display-desktop.png)
- Public Live Display, mobile 390×844: [live-display-mobile.png](design/screenshots/live-display-mobile.png)
- Admin audit log, desktop 1440×1000: [admin-audit-desktop.png](design/screenshots/admin-audit-desktop.png)
- Admin audit log, mobile 390×844: [admin-audit-mobile.png](design/screenshots/admin-audit-mobile.png)
- Super Admin accounts, desktop 1440×1000: [admin-administrators-desktop.png](design/screenshots/admin-administrators-desktop.png)
- Super Admin accounts, mobile 390×844: [admin-administrators-mobile.png](design/screenshots/admin-administrators-mobile.png)
- Super Admin system health, desktop 1440×1000: [admin-system-desktop.png](design/screenshots/admin-system-desktop.png)
- Super Admin system health, mobile 390×844: [admin-system-mobile.png](design/screenshots/admin-system-mobile.png)

The rendered login, dashboard, Event, Round configuration/operations, Draw control, Claim review, Winner history, Question/Key, Participant, CSV import, audit, administrator, system, and public Live Display captures use mocked API responses; they document browser rendering, not real backend integration. Additional real-browser integration evidence and limits are recorded in the local execution pack. Cross-origin Event `PATCH` against isolated backend PR #14 failed preflight because the response advertised only `GET,HEAD,POST`; [backend issue #25](https://github.com/saransh-sh/TechTombola-muacm/issues/25) tracks the required CORS method/header correction. A same-origin proxy is only a development workaround. The public WebSocket requires an ACTIVE or PAUSED Round, so the display discovers a newly active Round through REST polling before it can subscribe. Round operations display backend-reported Ticket counts and readiness errors. Recovery remains unavailable until the backend publishes a confirmed recovery command. The CSV import response currently omits per-Participant credential-delivery status; [backend issue #18](https://github.com/saransh-sh/TechTombola-muacm/issues/18) tracks that API change. [Issue #20](https://github.com/saransh-sh/TechTombola-muacm/issues/20) tracks server-selected winning-cell evidence; the Ticket highlights only IDs present in the authenticated Participant wins response and leaves cells unhighlighted when that evidence is absent. [Issue #21](https://github.com/saransh-sh/TechTombola-muacm/issues/21) tracks complete-dataset Question/Key search and authoritative used-state filters.

## Tokens

- Forest `#315c53` for the page field; warm cream `#f4ecd6` for the form; coral `#ef8076` for action and emphasis; near-black `#1d2421` for outlines and text.
- Condensed system sans for display and interface text, with system monospace for metadata, status and small labels. No remote font dependency.
- 20–72px responsive page gutters; login content uses a two-column desktop composition and one column below 700px.
- Rectangular controls and surfaces, 1–2px dark outlines, hard 4–8px offset shadows, no blur.
- Focus uses a visible coral outline; active buttons translate with their shadow; pending actions disable the submit control. Reduced motion removes the transition.
- Ticket states pair color with text; a winning-cell label appears only when the backend supplies eligible cell IDs.

## Responsive behavior

The sign-in form remains full-width within a 430px maximum panel. At narrow widths, the intro precedes the form, gutters remain 20px, and heading size scales with viewport width. No information is communicated by color alone; errors and labels are textual. The Ticket keeps the server's 3×9 geometry and uses a keyboard-focusable inner horizontal scroller. Its 720px minimum grid width keeps long keys and cell targets usable; below 838px, a persistent, programmatically associated hint explains the scroll. This means only part of the Ticket is visible at once on narrow phones and some tablet widths, but no page-level horizontal overflow is introduced and every column remains reachable.
