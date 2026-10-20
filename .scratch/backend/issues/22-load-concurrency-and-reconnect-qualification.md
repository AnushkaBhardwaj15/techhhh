# 22 — Load, Concurrency, and Reconnect Qualification

**What to build:** A repeatable performance harness proves the single Bun/PostgreSQL deployment supports the target event without duplicate Draws, corrupt Winners, leaked data, or missed recovery.

**PRD traceability:** §§5, 30, 60–61; NFR-001–NFR-003, NFR-005.

**Blocked by:** 17 — Live Display; 18 — Recovery; 19 — Admin Operations; 20 — E2E; 21 — Security Suite.

**Branch:** `feature/tombola_backend_load_qualification`

**Status:** implemented-unmerged

## Scope and contracts

- The harness drives public HTTP/WebSocket contracts. Fixes for the measured Draw idempotency race and read-query overhead stay within existing service/repository seams and preserve server authority.
- Add `bun run test:load` with documented hardware/database assumptions, seeded fixture, warm-up, duration, concurrency, thresholds, and machine-readable report artifact.
- Simulate 500 authenticated Participants, ticket reads, live-state reads, simultaneous reconnects, host Draws, Marks, and competing Claims.
- Targets: read p50 <200 ms, p95 <500 ms, p99 <1 s; committed Draw propagation <1 s.
- No Redis, clustering, cache, or speculative production abstraction.

## Non-goals

- No internet-scale benchmark, distributed deployment, autoscaling, production traffic, Redis/cache introduction, or threshold waiver.

## Acceptance criteria

- [x] Threshold failure exits nonzero and identifies endpoint/event percentiles and error rates.
- [x] Invariants are checked after load: no duplicate/gapped Draws, cross-user data, lost Tickets, or excess Winners.
- [x] Database pool saturation, memory, event-loop delay, and WebSocket connection count are captured.
- [x] Results record hardware/runtime and use documented fixture, warm-up, duration, concurrency, and thresholds.

## Required scenarios

- 500 logins/ticket reads/current-state reads; 500 sockets; burst reconnect with REST recovery.
- Double-click and independent concurrent Draw commands; simultaneous final-slot Claims; mark bursts.
- Public Live Display reads/events under Participant load; email/import excluded from live-game baseline but measured separately.
- Graceful degradation at threshold and recovery after load stops.

## Verification

Run `cd backend && bun run test:load`, preserve the report path in the PR, then run canonical, E2E, and security suites.

```bash
cd backend && bun run test:load && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build && bun run test:e2e && bun run test:security
```

## Completion evidence

- [x] PR attaches harness configuration, host/database assumptions, machine-readable results, and invariant report.
- [x] Threshold, reconnect, Draw, Claim race, resource, and recovery evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.

**Latest qualification (passed, 2026-10-17T08:38:24.098Z):** Full defaults on the user-selected local host: 500 authenticated Participants, 500 true concurrent clients, 10-second warm-up, 30-second sustained workload, and 20 application database connections. Actual allowed CPU sets: backend `0-3`, driver `4-7`. Zero request errors and no failed thresholds or invariants. Client wall-time p50/p95/p99 (ms):

- ticket_read: 138/236/241.
- participant_state_read: 100/167/171.
- live_state_read: 86/115/116.
- reconnect_rest_recovery: 159/249/252.
- sustained_read: 137/234/284.
- live_under_participant_load: 58/92/316.
- post_load_recovery: 106/177/181.

Draw propagation: 149 ms. All 500 Participant sockets and the public Live Display socket received exact ordered committed payloads (9 public Draw events); 500 simultaneous reconnect attempts and REST recovery matched committed history. Invariants: 500 Tickets, 7,500 cells, 500 Marks, 500 Participant Sessions, 14 gap-free unique Draws, one Winner and 499 closed-Pattern rejections. Same-key retry created one Draw. Five-row import created five Participants and delivered five emails. Health/readiness recovered.

Measured fixes: reuse parameterized SQL without caching authorization or game state; project only participant-visible Draw fields; finish authenticated subscription validation before acknowledging the WebSocket connection; reset the benchmark histogram after each one-second sample. The handshake regression failed before the fix and passes afterward.

Gates: typecheck, lint, build, 256 unit tests, 150 integration tests, one production-server E2E, and 160 security tests passed. Standards and Spec reviews have no unresolved findings. Evidence: `backend/tests/load/reports/load-qualification.json` and `backend/tests/load/reports/verification-summary.json`.
