# Projector code, QR and viewport fit

Date: 2026-10-30. Requirement: frontend PRD §37.
Branch: `feature/tombola_projector_viewport`, based on the local payment
declaration feature at `220565e`.

- Reuses `QRCodeSvg` and the admin join URL on the current deployment origin.
  The public backend supplies the game code; no game means no code/QR.
- A viewport grid reserves space for the join panel and fee notice. The full
  clue, code snippet and revealed answer resize against measured space;
  they are not truncated to conceal overflow. Standings remain visible.
- The layout preserves the existing dark projector palette and orange accent.
  Headings explicitly retain white contrast against global heading styles.
- No backend, game rules, answer visibility or WebSocket contracts changed.

Validation:

- **20 component/unit tests passed**, covering QR link, no-game state, answer
  visibility, existing updates/retry/cleanup and payment notice.
- **10 projector browser tests passed** in Edge: lobby and long clue with code,
  answer and seven standings at 1920×1080, 1366×768, 1280×720, 1024×600; portrait
  390×844; and a 40-line snippet on 1024×600. Tests measure document scrolling,
  actual content overflow, QR/panel bounds, QR size and heading contrast.
- The **five payment browser regressions passed** with the new layout.
- Frontend build, TypeScript and changed-file ESLint passed. Screenshots of
  lobby, active clue and portrait layouts were inspected.
- Standards and requirement review found a long-snippet font floor; it was
  removed and the 40-line regression now passes. No unresolved review findings.

The earlier repository-wide test/lint failures documented in
`PAYMENT_DECLARATIONS_VALIDATION.md` are not resolved by this UI change.
Changes remain local; no push or merge into main has been performed.
