# 02 — Append-Only Audit Foundation

**What to build:** The reusable audit boundary that lets every security-sensitive and game-critical mutation record an immutable, redacted event in its transaction.

**PRD traceability:** §48; FR-019; NFR-005, NFR-008.

**Blocked by:** 01 — Backend Application Shell and Test Harness.

**Branch:** `feature/tombola_audit_foundation`

**Status:** done

## Scope and contracts

- Layers: pure audit payload builder, audit service, repository, schema/migration. No HTTP query endpoint yet.
- Persist actor when known, action, resource type/id, safe metadata, IP, user agent, request ID, and timestamp.
- Audit rows are insert-only. Critical services receive the audit writer as an IO boundary and write the audit row inside their transaction.
- Frontend: none.

## Non-goals

- No audit HTTP endpoint, analytics pipeline, external log platform, or event-sourcing framework.

## Acceptance criteria

- [x] The full PRD audit-action vocabulary is a closed TypeScript union.
- [x] Metadata redaction rejects passwords, tokens, cookies, secrets, and temporary credentials recursively.
- [x] Application repository APIs expose append/read only; update/delete attempts are absent and database-protected where supported.
- [x] A failed critical audit insert rolls back its owning critical mutation.

## Required scenarios

- Authenticated actor and anonymous security event; metadata present/absent; request context captured.
- Nested sensitive key redaction; harmless metadata retained; oversized metadata rejected or bounded.
- Same-transaction success and rollback; ordering by timestamp/id; attempted mutation rejected.

## Verification

Run focused audit domain/repository transaction tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [ ] PR maps every required scenario to a test and includes rollback/redaction output.
- [ ] Migration and append-only database proof are attached.
- [ ] `/code-review` has no unresolved Standards or Spec findings.
