# Auth and participant batch validation — 27 October 2026

## Passing checks

| Check | Result |
|---|---|
| Backend default suite (`bun run test`) | 340 passed, 0 failed; 12 existing/platform/opt-in skips |
| New real PostgreSQL concurrency suite | 3 passed, 0 failed; disposable schema removed afterward |
| Frontend unit suite (Vitest) | 524 passed, 0 failed across 72 files |
| Frontend deployment configuration checks | Passed using Git Bash on Windows |
| Backend TypeScript and build | Passed |
| Frontend TypeScript, build and ESLint | Passed |
| New auth/batch Playwright flows in installed Chrome | 3 passed, including both administrator roles and mobile overflow |
| Actual running backend login | `bigboss@muacm.tech` authenticates as SUPER_ADMIN |
| Retired public registration | `/api/v1/auth/quick-join` returns 404 |
| Initial account inventory | Exactly one active account: bigboss; 9 previous accounts inactive |
| Old sessions | No unrevoked sessions belonging to disabled accounts |
| Repeated default seed | Preserves existing Super Admin credentials |

The 12 default-suite skips include optional PostgreSQL suites and platform-specific
operational tests. The new PostgreSQL batch suite was explicitly executed separately
with the configured database URL against an isolated, generated schema. It tests
whole-import/removal serialization, seven concurrent identical retries (more than
the five pooled connections), and valid-row persistence after a database constraint
failure inside another row's savepoint.

## Full browser suite remains a merge blocker

All 120 existing and new Playwright scenarios were executed: **35 passed, 85 failed**.
The new auth/batch scenarios pass within that full run as well.

Failures comprise 74 theme-suite cases and 11 cases across the live display,
lobby join, existing login/navigation and participant suites. Many theme assertions
expect `--navy: #081220`, while `frontend/src/styles/global.css` on both `main` and
this branch defines `--navy: #121316`. Other failures reference older navigation
labels, layouts and display behavior. These require individual investigation;
this report does not claim that every failure is an outdated test.

The feature PR remains draft and unmerged. Passing targeted auth tests does not
satisfy the repository's requirement that all automated end-to-end tests pass before
merge. Broader UI/browser-suite repair needs a separate scope decision.

## Review

The code-review Standards and Spec reviews have no remaining actionable findings.
Initial findings about import/removal races, concurrent retries, quote corruption,
layer placement, transaction propagation and request timeout were resolved and
covered by tests. The Anti-Slop pass retained existing styles, used labelled native
controls and semantic tables, and checked the new flows at mobile width.

## Local evidence

Ignored local logs: `auth-backend-tests.log`, `auth-frontend-tests.log`,
`auth-frontend-build.log`, `auth-browser-tests.log`, and
`auth-all-browser-tests.log`. Generated browser screenshots were not included in
the feature diff. Initial credentials are in the ignored backend
`.env.super-admin.local`; no password or bootstrap secret is included in this report.
