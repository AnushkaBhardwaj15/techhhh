# 09 — CSV Onboarding and Credential Delivery

**What to build:** Administrators can import up to 500 Participants from CSV and receive an exact partial-success report while credentials are delivered without ever persisting plaintext.

**PRD traceability:** §§41–43, 51–52; FR-020, FR-021; NFR-004.

**Blocked by:** 02 — Audit Foundation; 08 — Participant Management.

**Branch:** `feature/tombola_participant_import`

**Status:** done

## Scope and contracts

- Bun layers: import route/schema -> service -> row-validation domain <- Participant/idempotency repositories, email, and audit boundaries.
- API: `POST /api/v1/admin/participants/import`, multipart CSV fields `name,email,external_id`; `Idempotency-Key` required.
- Parse a maximum of 500 data rows. Each valid row commits User/Profile independently; invalid rows produce indexed safe errors without blocking valid rows.
- Reuse ticket 08's credential-delivery service for each created Participant: generate/hash, commit, then send through the external-email adapter while plaintext remains only in memory. Persist `PENDING | SENT | FAILED` metadata without message secrets.
- Repeating the same idempotency key returns the same redacted import report and sends no duplicate email.
- Frontend: none; publishes the import-report DTO.

## Non-goals

- No JSON/XLSX import, all-or-nothing batch transaction, background credential plaintext, ticket generation, or import above 500 rows.

## Acceptance criteria

- [x] Report totals reconcile exactly: received = created + skipped + failed.
- [x] Duplicate rows within the file and conflicts with existing data are deterministic.
- [x] Email failure never rolls back or deletes a committed Participant; regeneration is the recovery path.
- [x] No database row, audit metadata, idempotency result, or log contains the temporary password.

## Required scenarios

- Header only, one row, 500 rows, 501 rejection, BOM, quoted commas, blank lines, malformed CSV/UTF-8.
- Invalid/duplicate emails by case; duplicate external ID; mix of valid/invalid rows; transaction failure for one row.
- Provider success/failure/timeout; retry with same/new key; concurrent same-key requests; plaintext storage/log scan.
- Unauthorized role, wrong Event scope, report error redaction, audit totals.

## Verification

Run parser/property tests, 500-row integration fixture, email-adapter tests, idempotency race, and secret scan, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes multipart request/report/error examples and maps every scenario to a test.
- [x] 500-row, idempotency-race, provider-failure, audit, and plaintext-scan evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
