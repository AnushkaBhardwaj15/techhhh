# 20 — Critical-Flow End-to-End Verification

**What to build:** One repeatable black-box workflow proves the Backend MVP from Super Admin bootstrap through Event completion and authoritative reconnect recovery.

**PRD traceability:** §§54, 59, 73; all FR-001–FR-021.

**Blocked by:** 04–19 — all functional backend slices.

**Branch:** `feature/tombola_backend_e2e`

**Status:** done

## Scope and contracts

- Bun layers: black-box test harness only; production modules are consumed exclusively through their public HTTP/WebSocket contracts.
- Add `bun run test:e2e` using a production-like built server, isolated PostgreSQL database, real HTTP/WebSocket clients, and a fake external email server at the IO boundary.
- Flow: create Admin/Event/Round/Patterns/Keys/Questions/Participants, generate Tickets, ready/start, connect clients, Draw, Mark, Claim, verify Winner, reconnect from REST, complete Round.
- Assertions use only public APIs and persisted state inspection reserved for invariant verification.
- Frontend: none; backend black-box only.

## Non-goals

- No browser UI/E2E, load qualification, security fuzzing, production database, or production-code shortcut added solely for tests.

## Acceptance criteria

- [x] The command provisions and tears down its own isolated state and is rerunnable.
- [x] It verifies every audit/event side effect and the absence of future-Key/cross-Participant leakage.
- [x] Failure output identifies the workflow step, request ID, and relevant safe response.
- [x] The test runs in CI without order dependence on unit/integration suites.

## Required scenarios

- Happy-path workflow including random and manual Draws and every Pattern type across fixtures.
- Duplicate/idempotent command replay at critical steps.
- Disconnect before a Draw, reconnect, REST convergence, and subsequent event receipt.
- Invalid Mark/Claim and competing Winner branch included as negative subflows.

## Verification

Run `cd backend && bun run build && bun run test:e2e` twice consecutively, then every canonical backend command.

```bash
cd backend && bun run build && bun run test:e2e && bun run test:e2e && bun run typecheck && bun run lint && bun test && bun run test:integration
```

## Completion evidence

- [x] PR maps every workflow/negative subflow to named test steps and attaches two consecutive passing local runs.
- [x] Audit/event/leakage/reconnect evidence and isolated teardown proof are recorded in `docs/backend-critical-flow-testing.md`.
- [x] `/code-review` has no unresolved Standards or Spec findings.
