# Per-game ticket payment declaration validation

Date: 2026-10-30. Branch: `feature/tombola_payment_declarations`.

## Agreed scope

See backend PRD §3A and frontend PRD §20A. Each game costs ₹10. Unpaid
participants may join and play; unpaid winners cannot collect prizes. Staff
handle collection. Payment is a participant declaration, never a verified
transaction. Admins and Super Admins have read-only per-game payment rosters.
Declarations can change only before the game starts. Started, paused,
recovering and completed games lock changes; identical retries are harmless.

## Implementation

- Migration `0025_ticket_payment_declaration.sql` adds a default-false flag to
  each ticket. Applied to the configured development database; schema check passes.
- Optional join input and a participant-only declaration endpoint persist
  payment per game. Ownership comes from authentication, never a client-supplied
  participant ID. Round locks serialize declarations with start commands.
- Manual entry, Quick Join, and scanned-code confirmation share the checkbox.
  An entered alternative code disables Quick Join to avoid changing the target
  of a checked declaration. Joined participants can update before start.
- Projector and participant notices explain fee, deadline and prize rules.
  Both staff roles see a read-only Paid? table below the game controls.
- Game eligibility, claims, winners, draws and ticket cells are unchanged.

## Checks

- Backend focused run: **46 passed** (domain, HTTP contracts, service seams,
  persistence and enrollment). Additional malformed join assertions are covered.
- Frontend focused runs: **28 passed** (entry, declaration editing/locking,
  API payloads, notice, staff loading/error/empty/read-only states, projector).
- Playwright payment scenarios: **5 passed** in Edge, including mobile layout,
  reload persistence, pre-start edits, locking, unpaid entry, both staff roles
  and projector privacy. Screenshots inspected for layout and readability.
- Real PostgreSQL start/declaration race in a disposable schema: **1 passed**.
- Backend and frontend builds and type checks: **passed**.
- Deployment origin validation script: passed using Git Bash on Windows.
- Standards and requirement reviews: no unresolved findings.

## Existing repository-wide failures

- Backend: **368 passed, 8 skipped, 9 failed**. Failures remain the previously
  observed CSV parser, realtime subscription and operations read-model cases.
- Frontend: **540 passed, 70 failed**. Failure names were compared with the
  earlier clean-main baseline; no new failures were introduced. The old scanned
  code expectation was replaced with the agreed explicit confirmation behavior.
- Full frontend lint still reports the pre-existing `no-explicit-any` error in
  `ClaimPanel.tsx`. Lint passes for files changed by this feature.

These failures prevent declaring the repository's full completion/merge gate
passed. No tests were disabled or excluded from the full-suite checks. Filtered
runs above isolate new feature assertions in files with known older failures.
No changes have been pushed to main.

## Separate notification step

The updated flow is code verification / Quick Join → Important Notification →
lobby. The optional checkbox is only on the notice; the lobby shows a saved
summary and review link. Continue waits for pending saves. Feedback stays inline
so a toast cannot cover the Continue button. Backend rules are unchanged.
Validation: 54 related component tests passed; six browser scenarios passed;
frontend build, type check, changed-file lint and both reviews passed.
