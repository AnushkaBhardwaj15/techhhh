# 24 — Backup and Restore Rehearsal

**What to build:** A human-runnable and testable PostgreSQL backup/restore procedure proves an active Event can be recovered without losing or mutating authoritative game history.

**PRD traceability:** §§64, 73; NFR-001, NFR-006.

**Blocked by:** 18 — Crash Recovery; 23 — Deployment Verification.

**Branch:** `feature/tombola_backup_restore_rehearsal`

**Status:** implemented-unmerged

## Scope and contracts

- Bun layers: isolated operational verification harness and runbook; production recovery is validated; the reproduced ordinary start/resume bypasses is blocked so interrupted Rounds use the existing consistency validation.
- Document automated provider backup expectations plus explicit pre-event and pre-Round backup commands.
- Add a safe `bun run verify:restore` harness that seeds representative Event/Round/Ticket/Draw/Mark/Claim/Winner/Audit state, creates a backup, restores into a different empty database, starts a new app instance, and runs recovery validation.
- The harness refuses production-like targets unless an explicit isolated-test guard is satisfied; it never drops or overwrites the source database.
- Frontend: none.

## Non-goals

- No production destructive restore, cross-region DR, provider provisioning, arbitrary repair, or replacement for managed automated backups.

## Acceptance criteria

- [x] Restore verification compares row counts, immutable snapshots, sequence continuity, Pattern closure, and audit history.
- [x] Secrets and temporary credentials are absent from backup artifacts and logs.
- [x] Recovery from the restored ACTIVE fixture enters RECOVERY_REQUIRED and resumes only after Admin confirmation.
- [x] Runbook records prerequisites, expected duration, validation evidence, failure escalation, and rollback.

## Required scenarios

- Successful backup/restore; empty source; interrupted/corrupt artifact; incompatible migration version; wrong target guard.
- Restored DRAFT, ACTIVE, and COMPLETED Round fixtures; next Draw sequence and closed Pattern preserved.
- Audit/Winner/Ticket immutability comparison; no plaintext credential scan.
- Rehearsal failure leaves source untouched and produces actionable diagnostics.

## Verification

Run `cd backend && bun run verify:restore` only against isolated databases, retain the sanitized report path in the PR, then run canonical and recovery suites.

```bash
cd backend && bun run verify:restore && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR attaches guarded source/target identifiers, backup/restore output, comparison report, and recovery result.
- [x] Source-untouched, corruption, migration mismatch, immutability, and secret-scan evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.

Verified: guarded restore rehearsal with ten passing checks, 264 unit, 152 integration, 2 E2E, 162 security tests; typecheck/lint/build. Evidence: `backend/tests/restore/reports/`. Start/resume recovery bypasses reproduced before domain guards and covered by unit/integration/restore regressions. Both review axes have no unresolved findings. PR delivered closed unmerged; source fixtures are intentionally preserved.
