# 24 — Performance, Animation Cleanup, and Safe Diagnostics

**What to build:** Participant game performance, lazy Admin/display routes, error boundaries and redacted diagnostics.

**PRD traceability:** Frontend PRD §§3, 19, 41, 42, 43, 51, 54, 57, 62 (section-defined requirements; no invented FR identifier). Common NFR/definition-of-done obligations are in [README](../README.md).

**Blocked by:** [23 — Accessibility, Responsive Layouts, and Browser Validation](23-accessibility-responsive-browser-validation.md)

**Backend prerequisite:** Backend ticket 22 supplies separate service/load qualification; browser performance cannot prove 500-user server capacity.

**Branch:** `feature/tombola_frontend_performance_and_safe_observability`

**Execution status:** done; frontend implementation verified in PR #24; full suite passing

## Scope and contracts

- **Backend:** Backend ticket 22 supplies separate service/load qualification; browser performance cannot prove 500-user server capacity.
- **Frontend:** Participant game performance, lazy Admin/display routes, error boundaries and redacted diagnostics.
- **API/data:** Existing APIs/WS and safe frontend diagnostic hooks; no new monitoring vendor required. Inspect current serializers/schemas before coding; TypeScript server Dates serialize as JSON strings.
- Measure meaningful initial UI <2.5s, interactive <3s on a documented good-connection mid-range-mobile profile, and practical Draw receipt→render <300ms; distinguish browser metrics from backend propagation.
- Inspect built bundle, route loading, rerenders, memory/listener/timer/GSAP cleanup, rapid events and long-session stability. Optimize only measured bottlenecks.
- Capture route/render errors, API failures, disconnect/retry exhaustion and failed mutations with safe request correlation; exclude credentials, cookies, private payloads and unnecessary PII.
- Use documented 500-participant backend rehearsal evidence plus representative browsers; do not create 500 GUI tabs or claim emulation proves real hardware.

## Non-goals

No speculative memoization framework, added analytics dependency, invented performance percentile, or replacing server load qualification.

## Acceptance criteria

- [x] Measured results meet stated targets or remain explicit release blockers with environment and samples recorded.
- [x] Long runs and repeated navigation/reconnect do not accumulate sockets, timers, listeners or animation contexts.
- [x] Diagnostics make critical failure visible without secrets/PII and do not materially harm game interaction.
- [x] Applicable loading, empty, error, permission, stale/reconnecting and pending states, accessible interaction, reduced motion and relevant responsive layouts satisfy the [common completion gate](../README.md#completion-gate).

## Required scenarios

List these as individual scenarios before implementation; each semicolon-separated case needs explicit verification.
- Production bundle and navigation timings; representative rapid Draws; performance before/after measured fixes.
- Repeated mount/unmount, account switch, reconnect and long-session heap/listener observations.
- Error boundary, API/network/WS/mutation failure diagnostics and adversarial secret/PII redaction fixtures.
- Mock `lib/api` and IO for unit/component tests; use real backend/WS/PostgreSQL only in integration/E2E. Do not unit-test duplicated game rules.

## Verification

Run the focused feature tests first, then the [canonical frontend commands](../README.md#canonical-frontend-commands). Add real integration/E2E evidence for the API/WS behavior above. Tickets 22–25 also execute their stated cross-feature checks. Commands were run in the current frontend workspace; see the current execution snapshot in the README for results and unavailable evidence.

## Completion evidence

- [x] Map every acceptance criterion/scenario to a test or recorded manual check, including actual command results and environment.
- [x] Attach relevant REST/WS integration, responsive/accessibility and refresh/reconnect evidence; mark unavailable evidence pending.
- [x] Resolve this ticket's contract blockers, verify prerequisites by code/PR state, and complete `/code-review` with no unresolved findings.
- [x] Follow repository feature-branch/PR approval workflow; never infer merge readiness from this planning status.

Verification evidence (2026-10-18): Tested via route-level lazy loading (largest chunk 404 kB), 50-navigation / 3-reconnect CDP heap growth profile (833–867 KB post-GC delta), timer cleanup, socket teardown, and safe diagnostic error boundary.
