# 08 — Participant Management

**What to build:** Administrators can create and manage Event-scoped Participants while each Participant can authenticate only into its own identity and data scope.

**PRD traceability:** §§10–11, 35–36, 40, 43–45; FR-001, FR-002.

**Blocked by:** 03 — Authentication and Sessions; 05 — Event Lifecycle.

**Branch:** `feature/tombola_participant_management`

**Status:** done

## Scope and contracts

- Bun layers: Participant/auth routes and schemas -> services -> identity/scope domain <- repositories, email, and audit boundaries.
- API: `GET/POST /api/v1/admin/participants`, `GET/PATCH /api/v1/admin/participants/:id`.
- `ParticipantProfile` links a User to an Event with name, optional external ID, and active state. Email belongs to User and is normalized case-insensitively.
- Extend `POST /api/v1/auth/login` and `/me` for Participant principals only after ParticipantProfile and Event scope exist; Participant guards resolve exactly one active Event profile and never inherit Admin authority.
- Single creation generates/hashes a one-time credential, commits the account, sends it through the external-email boundary while plaintext remains only in memory, and records delivery metadata; no phone or self-registration in MVP.
- Deactivation revokes Participant Sessions and preserves Tickets/history.
- Frontend: none; publishes paginated Admin DTOs without password/session fields.

## Non-goals

- No self-registration, phone field, JSON/bulk import, password-reset workflow, or multi-Event active Participant session.

## Acceptance criteria

- [x] User/Event and external-ID uniqueness are database-enforced with explicit conflict errors.
- [x] Search/filter/pagination are bounded and Event-scoped.
- [x] Participant data cannot be enumerated across Event or principal boundaries.
- [x] Participant login, `/me`, and Participant-only guards enforce active identity and Event scope without changing administrator behavior from ticket 03.
- [x] Create/update/deactivate operations audit atomically.
- [x] Email failure preserves the account, exposes a safe FAILED delivery state, and requires credential regeneration; no database or log contains plaintext.

## Required scenarios

- Create/read/update/deactivate; normalized duplicate email; duplicate external ID; optional external ID absent.
- Missing/wrong Event; inactive Event policy; pagination/search boundaries; malformed IDs.
- Participant denied Admin APIs; cross-Event Admin scope; Session revocation; history preserved; audit rollback.
- Valid/inactive Participant login, administrator denied Participant-only guard, wrong-Event profile, and Participant `/me` DTO.
- Email success/failure/timeout, credential regeneration, and database/log/audit plaintext scan.

## Verification

Run focused Participant service, route, ownership, and constraint-race tests, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes Participant/auth/email DTO and error examples and maps every scenario to a test.
- [x] Event-scope, session-revocation, provider-failure, audit, and plaintext-scan evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
