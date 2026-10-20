# 17 — Live Display Read Model and Feed

**What to build:** A public Live Display can recover and follow current Event, Round, Draw, and verified Winner state without gaining any Participant/Admin privilege or future information.

**PRD traceability:** §§33–34, 38, 45–47, 60; FR-017; NFR-002, NFR-004.

**Blocked by:** 05 — Events; 11 — Real-Time Transport; 12 — Round Operation; 13 — Draws; 16 — Winners.

**Branch:** `feature/tombola_live_display_api`

**Status:** done

## Scope and contracts

- Bun layers: public Live routes/serializers -> read service <- Event/Round/Draw/Winner repositories plus public WebSocket adapter; no game domain mutation.
- API: `GET /api/v1/live/event|round|draws|winners`; `/api/v1/live/ws` from ticket 11 supplies matching safe updates.
- Explicit response allowlists expose public display names and stable public IDs only; never emails, Session data, unverified Claims, future Questions/Keys, or internal audit metadata.
- Draws are chronological; Winners group by Pattern and include only VERIFIED records. Empty/no-live state has a documented `200` nullable payload rather than accidental 404 differences.
- The current Event is the latest `LIVE` Event by `startedAt` (nulls last, then ID). Its current Round is selected by `ACTIVE` → `PAUSED` → `RECOVERY_REQUIRED` → `READY` → latest `COMPLETED`; ties within a status use descending sequence, update time, then ID.
- `/live/event` returns `{ "event": null }` when no Event is live; `/live/round` returns `{ "round": null }` when no live Event or selected Round exists. Draws and Winners return `{ "roundId": null, "data": [] }` when no Round exists; Winners `data` is otherwise grouped by Pattern.
- Public WebSocket subscriptions can reconnect to a selected `READY`, `ACTIVE`, `PAUSED`, `RECOVERY_REQUIRED`, or `COMPLETED` Round. Authenticated subscriptions retain their `ACTIVE`/`PAUSED` scope.
- Indexed repository reads target PRD p50/p95/p99 thresholds; performance qualification belongs to ticket 22.
- Frontend: none; these are the complete Live Display contracts.

## Non-goals

- No Live Display authentication/privilege, mutation, unverified Claim visibility, theme system, cache layer, or future content.

## Acceptance criteria

- [x] REST recovery and public events represent the same committed state.
- [x] ACTIVE, PAUSED, RECOVERY_REQUIRED, COMPLETED, and no-live states serialize explicitly.
- [x] Cross-Event data cannot enter current-state responses.
- [x] A strict serializer fails tests when a sensitive field is added upstream.

## Implementation evidence

- Serializer/service unit coverage: `backend/src/modules/live/live.service.test.ts`; public route/null-state coverage: `backend/src/modules/live/live.routes.test.ts`.
- PostgreSQL/API coverage for Event and Round selection, Event isolation, chronological Draws, verified Winner filtering, 500 concurrent reads, query plans, and REST recovery after public start/draw/verify/complete events: `backend/tests/integration/live-display.test.ts`.
- Public WebSocket lifecycle subscription states and authenticated ACTIVE/PAUSED restriction: `backend/src/realtime/subscription.service.test.ts`.
- No frontend changes; `/live/ws` is supplied by the existing Ticket 11 transport.

## Required scenarios

- No Event/Round, each lifecycle state, zero/one/many Draws and Winners, deterministic ordering/grouping.
- Unverified/rejected Claim excluded; undrawn Question/Key excluded; email/internal ID/audit fields excluded.
- State changes after start/draw/verify/complete reflected in REST and public event; reconnect REST convergence.
- 500 concurrent read smoke fixture with correct indexes and query-count assertions.

## Verification

Run serializer leak tests, lifecycle fixtures, REST/WS convergence integration tests, query-plan checks, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun run test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes each public DTO/null state/event example and maps every scenario to a test.
- [x] Field-allowlist, cross-Event, query-plan, concurrency, and REST/WS convergence evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
