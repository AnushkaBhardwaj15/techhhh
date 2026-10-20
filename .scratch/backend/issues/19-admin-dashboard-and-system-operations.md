# 19 — Admin Dashboard and System Operations

**What to build:** Administrators get complete operational read models for the live game, audit trail, Winners, and recovery health without bypassing feature ownership or exposing secrets.

**PRD traceability:** §§36–40, 48, 63–65; FR-002, FR-019; NFR-006, NFR-008.

**Blocked by:** 04 — Admin Management; 08 — Participants; 12 — Round Operation; 13 — Draws; 16 — Winners; 18 — Recovery.

**Branch:** `feature/tombola_admin_operations`

**Status:** done

## Scope and contracts

- Bun layers: Admin/System read routes and serializers -> query services <- owning repositories; no domain mutation or duplicate rule calculation.
- API: `GET /api/v1/admin/dashboard`, `GET /api/v1/admin/audit`, existing Admin Winner history, and `GET /api/v1/super-admin/system`.
- Dashboard composes read-only counts/status from owning repositories; it does not duplicate or calculate game rules.
- Audit supports bounded pagination and actor/action/date filters with immutable chronological records and redacted metadata.
- System response covers version, readiness dependencies, recovery-required state, and last successful migration/backup metadata where available; never configuration values or secrets.
- Frontend: none; publishes Admin/Super Admin operational DTOs.

## Non-goals

- No analytics warehouse, mutable audit API, secret/config dump, game-rule duplication, repair command, or monitoring vendor integration.

## Acceptance criteria

- [x] Admin sees operational scope; only Super Admin sees system-wide endpoint and recovery diagnostics.
- [x] Pagination/filter queries use required indexes and stable cursors/order.
- [x] Dashboard data is transactionally consistent enough to avoid impossible mixed statuses.
- [x] Sensitive audit/system fields are serializer-denied.

## Required scenarios

- Empty and populated dashboard; each Round state; pending Claims and verified Winners; recovery-required alert.
- Audit filters singly/combined, cursor boundaries during concurrent inserts, deterministic ties, unknown filter, redaction regression.
- Participant/Admin/Super Admin matrix; cross-Event scope; system database-unready state; no secret leakage.
- Query-count/index plan checks and concurrent read during Draw/verification.

## Verification

Run read-model/serializer/security tests, pagination/index tests, concurrent consistency fixture, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes dashboard/audit/system DTO and error examples and maps every scenario to a test.
- [x] Pagination/index, consistency, role matrix, and redaction evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
