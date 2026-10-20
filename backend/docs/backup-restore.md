# Backup and restore rehearsal

PRD §64, §73, FR-018, NFR-006. One Bun process and PostgreSQL remain authoritative. This procedure backs up game history; it does not recalculate or repair it.

## Before the Event

Assign an operator and a second reviewer. Enable the managed provider's automated backups and point-in-time recovery where supported. Verify retention, encryption, least-privilege access, restore permissions, monitoring and backup age with the provider. Keep backups through the Event and the agreed post-Event retention window; set the exact retention and acceptable recovery point/time with the Event owner before going live. Provider provisioning and backup retention configuration are outside this local rehearsal.

Run this rehearsal on the release branch before the Event. Prerequisites: Bun 1.4.2, Docker (Linux host networking), the pinned PostgreSQL 16 client image, and a loopback PostgreSQL 16 server account able to create databases and a temporary fixture role. Existing `backend/.env` holds credentials; never put them in command arguments, PRs or reports.

```bash
cd backend
# Set RESTORE_DATABASE_URL and RESTORE_ISOLATED=1 in the existing ignored .env.
bun run verify:restore
```

The harness creates only unique `tt_restore_source_<uuid>` and `tt_restore_target_<uuid>` databases. The URL identifies the local server, not a database to overwrite. It rejects a remote host, a missing isolation guard, unexpected identifiers, an identical source/target, and a nonempty restore target. A unique temporary login owns the synthetic source so dump owner metadata cannot collide with a shared development password. Its password is removed and login disabled after the run; the retained owner role has no login. It never drops the source. The only database it drops is its own generated target. No production restore or cutover is performed.

Expected local duration is under two minutes for the small synthetic fixture. Use the recorded `durationSeconds` as evidence, not a promise for a real backup. Measure the real backup size and restore time on deployment hardware before deciding the Event's recovery window.

## Evidence and rehearsal behavior

`tests/restore/reports/restore-verification.json` records generated database identifiers, per-table counts, snapshot/archive SHA-256, elapsed time, and checks. The mode-0600 custom archive is retained beside it and ignored by Git. The latest report is versioned; local `run-<uuid>.json` receipts retain each run’s source identifier for later inspection/cleanup and are ignored by Git. Reports contain no credentials or game data. The synthetic source database is retained for inspection; failed runs preserve it too. Temporary SQL, PostgreSQL tools container and generated target are removed.

The script validates empty-source refusal; checksum rejection of a changed archive body and an interrupted header before target writes; exact restored rows in every public table; refusal to overwrite a populated target; missing/unknown migration versions; original source unchanged on success and failure; and absence of plaintext fixture/application/database credentials in both custom and expanded backups. Password hashes are expected authoritative data and are retained. This scan is a fixture leak regression, not permission to publish real backups: real backups contain personal data and unrevealed Questions and require restricted encrypted storage.

The restored ACTIVE Round enters RECOVERY_REQUIRED on a fresh application instance. Draw/ordinary start/resume and unauthenticated recovery fail. An authenticated Admin explicitly confirms recovery. DRAFT and COMPLETED states remain unchanged; COMPLETED recovery fails. Ticket/cells, Marks, Claims, Draw snapshots, Winners, Pattern closure and prior audit rows remain unchanged; the next Draw has sequence six. Application startup and confirmation append recovery audit records.

Inspect retained sources with the operator's normal database client. When evidence is no longer needed, a human may delete **only the exact synthetic source identifier in that report** and remove its local archive. The harness has no source-drop command. Never use a wildcard cleanup on a shared PostgreSQL host.

## Pre-Event and pre-Round backup

Use the release's PostgreSQL client version (at least the server major version). Store connection details in a restricted `PGSERVICEFILE`/`PGPASSFILE`, with TLS verified for a remote provider. Set `PGSERVICE` to the operator-reviewed source service. Do not include a password/URL in shell history. Store outputs on encrypted storage outside the repository.

```bash
umask 077
pg_dump --format=custom --no-owner --no-acl --file="$BACKUP_PATH"
pg_restore --list "$BACKUP_PATH" > "$BACKUP_PATH.list"
sha256sum "$BACKUP_PATH" > "$BACKUP_PATH.sha256"
```

Use a new timestamped `BACKUP_PATH` before participant entry and before each Round where practical. Freeze configuration and pause play while taking the pre-Round checkpoint; record time, Event/Round, current Draw sequence, release SHA, migration inventory, source identifier and artifact hash in the private operations record. PostgreSQL dump provides a consistent database snapshot; stopping app writes gives an unambiguous recovery point. Confirm dump exit status, restricted file permissions and off-host encrypted upload before proceeding. Never log raw SQL or expand a real backup in a public artifact.

## Restore during an incident

1. Pause ingress and stop the old Bun process. Preserve the original database, backup and logs. Escalate to the Event owner/database operator; record the last acknowledged Draw and all evidence. Do not attempt concurrent active processes.
2. Select a verified backup and tested immutable application release with matching migration inventory. Create a **different empty database** with reviewed provider permissions. Validate archive checksum/listing before importing. Point `PGSERVICE` at the separately reviewed empty target.
3. Restore without `--clean`, `--create` or any source write:

   ```bash
   pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_TARGET_DATABASE" "$BACKUP_PATH"
   ```

4. With `DATABASE_URL` set to that target in the restricted environment file, run `bun run db:check`. A missing/unknown migration is a stop condition; do not blindly migrate or downgrade historical game data. Compare table counts and immutable Ticket/Draw/Winner/audit snapshots with the checkpoint, and validate continuous Draw sequences and closed Pattern capacities.
5. Start the selected release with ingress still paused. Confirm `/health` and `/ready`, inspect recovery audit/state, and authenticate as Admin. ACTIVE must become RECOVERY_REQUIRED. Confirm recovery through `POST /api/v1/admin/rounds/:id/recover` only after the operator and Event owner approve the checkpoint and any data loss since it. Confirm Draw sequence continuity, unchanged Winners/Pattern closure and participant REST state before reopening ingress.
6. Keep the original source and recovery evidence. If validation fails, stop the candidate app and leave ingress paused. Roll back application/configuration to the preserved source only after reviewing its integrity and avoiding two live processes. Never restore over the original database or auto-resume a disputed Round. Escalate corruption, mismatched migrations, missing Draws/Winners or possible lost acknowledged actions; replaying or inventing game history is not authorized.

A successful local fixture rehearsal proves these checks on this host. It does not prove managed-provider retention, deployment permissions, production backup timing, or a real incident cutover.
