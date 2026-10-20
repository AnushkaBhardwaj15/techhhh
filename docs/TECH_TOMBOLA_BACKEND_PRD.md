# Tech Tombola --- Backend Product Requirements Document

**Document:** Backend PRD\
**Version:** 1.0\
**Status:** Draft for Engineering Review\
**Product:** Tech Tombola\
**Target Scale:** 400--500 active participants per live game\
**Deployment Constraint:** Approximately \$100 AWS budget /
free-tier-oriented deployment\
**Primary Backend Stack:** Bun + TypeScript\
**Database:** PostgreSQL\
**API Style:** REST + lightweight real-time transport\
**Architecture:** Modular monolith\
**Frontend Contract:** React-based web clients consume this backend

------------------------------------------------------------------------

## 1. Backend Product Definition

The Tech Tombola backend is the authoritative game engine and
application API for a technology-themed digital Tombola event.

The backend is responsible for:

-   participant authentication and identity;
-   admin and super-admin authorization;
-   event and round management;
-   question and key management;
-   ticket generation and persistence;
-   random question drawing;
-   official draw history;
-   participant ticket state;
-   winning-pattern evaluation;
-   win claims;
-   admin winner verification;
-   live game state;
-   event recovery;
-   audit logging;
-   email-based participant credential delivery;
-   API contracts consumed by participant, admin, and live-display
    frontends.

The backend is the **source of truth** for all game-critical state.

> **Core principle:** The browser may display and request game actions,
> but it must never be trusted to determine whether a draw, mark,
> ticket, or win is valid.

------------------------------------------------------------------------

# 2. Product/Game Model

Tech Tombola is traditional Tombola implemented as a web game with
technology-themed content.

The participant does **not answer questions**.

Instead:

``` text
Question
    ↓
Predefined Answer / Key
    ↓
Key is revealed during the draw
    ↓
Participant checks their ticket
    ↓
Participant manually marks matching key
    ↓
Winning pattern is evaluated
```

Example:

``` text
Question:
"What is the largest country in the world?"

Answer / Key:
"RUSSIA"
```

If `RUSSIA` exists on a participant's ticket, that participant may mark
it after the key has officially been drawn.

------------------------------------------------------------------------

# 3. Goals

## 3.1 Primary goals

The backend must:

1.  Support 400--500 active participants.
2.  Support multiple traditional Tombola rounds.
3.  Generate valid persistent Tombola tickets.
4.  Maintain server-authoritative draw state.
5.  Randomly select unused questions.
6.  Resolve each question to its key.
7.  Persist every official draw.
8.  Allow participants to manually mark valid cells.
9.  Validate winning claims server-side.
10. Allow admins to verify winners.
11. Recover a game after a backend restart.
12. Support live updates to connected clients.
13. Provide reliable administrative controls.
14. Remain inexpensive to operate on AWS.
15. Avoid unnecessary distributed infrastructure.

------------------------------------------------------------------------

# 4. Non-Goals

The backend MVP does not include:

-   participant self-registration;
-   participant password-reset workflow;
-   payment processing;
-   sponsor management;
-   AI question generation;
-   AI-powered gameplay;
-   native mobile applications;
-   complex analytics;
-   arbitrary visual ticket designers;
-   arbitrary winning-pattern designers;
-   multi-tenant SaaS architecture;
-   microservice deployment;
-   Kubernetes;
-   Kafka;
-   Redis cluster;
-   event-sourcing infrastructure;
-   multiple simultaneous games within one deployment.

------------------------------------------------------------------------

# 5. Target Scale and Capacity

The initial event is expected to have approximately:

-   400--500 active participants;
-   one active game at a time;
-   multiple rounds during an event;
-   up to 90 traditional Tombola-style positions per round;
-   frequent participant reads during draws;
-   relatively low write volume compared with read volume.

The backend must prioritize:

1.  correctness;
2.  recovery;
3.  predictable latency;
4.  operational simplicity;
5.  low cost.

Massive horizontal scaling is not an MVP requirement.

------------------------------------------------------------------------

# 6. Architecture Decision

## 6.1 Architecture style

The backend must be implemented as a **modular monolith**.

``` text
                    ┌───────────────────────┐
                    │ React Participant UI  │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │                       │
                    │     Bun API           │
                    │     TypeScript        │
                    │                       │
                    │ ┌───────────────────┐ │
                    │ │ Auth              │ │
                    │ │ Events            │ │
                    │ │ Rounds            │ │
                    │ │ Questions         │ │
                    │ │ Keys              │ │
                    │ │ Tickets           │ │
                    │ │ Draw Engine       │ │
                    │ │ Winning Engine    │ │
                    │ │ Claims            │ │
                    │ │ Admin             │ │
                    │ │ Audit             │ │
                    │ └───────────────────┘ │
                    └───────────┬───────────┘
                                │
                         ┌──────▼──────┐
                         │ PostgreSQL  │
                         └─────────────┘
```

The system should remain deployable as one application
process/container.

------------------------------------------------------------------------

# 7. Recommended Backend Technology Stack

## 7.1 Runtime

**Bun (v1.x)**

Bun should be used as the production runtime.

## 7.2 Language

**TypeScript**

TypeScript is required for application code.

Strict TypeScript should be enabled.

## 7.3 HTTP framework

Recommended:

**Fastify**

Reasons:

-   low overhead;
-   strong TypeScript ecosystem;
-   schema validation support;
-   suitable for the expected traffic;
-   simple deployment.

Express is acceptable, but Fastify is the preferred implementation.

## 7.4 Database

**PostgreSQL**

PostgreSQL is the source of truth for all persistent game state.

## 7.5 Database access

Recommended:

**Drizzle ORM + SQL migrations**

Alternative:

**Prisma**

The implementation must not hide critical transactional logic behind
opaque ORM behavior.

Game-critical operations should use explicit database transactions.

## 7.6 Validation

**Zod**

All external API input must be schema-validated.

## 7.7 Authentication

Recommended:

-   JWT access tokens;
-   secure refresh/session mechanism;
-   HTTP-only cookies where practical for browser clients.

## 7.8 Password hashing

Use:

**Argon2id**

Plaintext passwords must never be stored.

## 7.9 Real-time transport

The backend must support real-time game-state propagation.

Preferred:

**WebSocket**

The implementation should remain lightweight and should not require
Redis.

------------------------------------------------------------------------

# 8. AWS Deployment Architecture

The deployment should intentionally remain simple.

Recommended MVP:

``` text
                     Internet
                        │
                        ▼
                 AWS entry point
                        │
                        ▼
              Bun application
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
         PostgreSQL          Email Provider
```

Depending on final AWS availability/pricing, the application may use:

-   EC2;
-   Lightsail;
-   AWS App Runner;
-   another low-cost AWS compute option.

The architecture must not depend on a large AWS service mesh.

------------------------------------------------------------------------

# 9. AWS Cost Constraints

The backend must be designed around approximately **\$100 of available
AWS budget/free credit**.

Avoid by default:

-   ECS cluster with unnecessary replicas;
-   EKS;
-   ElastiCache;
-   RDS Multi-AZ for MVP;
-   OpenSearch;
-   MSK/Kafka;
-   Lambda fan-out architecture;
-   NAT Gateway where avoidable;
-   multiple always-on servers.

For 400--500 participants, a single appropriately sized application
instance plus PostgreSQL is sufficient for the expected workload.

------------------------------------------------------------------------

# 10. Domain Model

The minimum persistent entities are:

``` text
User
ParticipantProfile
AdminProfile
Event
Round
Key
Question
Ticket
TicketCell
Draw
WinningPattern
WinClaim
Winner
AuditLog
Session
EmailJob
```

------------------------------------------------------------------------

# 11. User and Role Model

## Roles

Exactly two administrative roles are required:

``` text
SUPER_ADMIN
ADMIN
```

Participants are separate from the administrative role model. `User` is the shared login identity. A Participant is identified by an Event-scoped `ParticipantProfile`; an administrator is identified by an `AdminProfile` carrying either `ADMIN` or `SUPER_ADMIN`. A browser session resolves to exactly one principal kind and never derives administrative authority from a Participant profile.

### Super Admin

Can:

-   manage admins;
-   manage events;
-   manage rounds;
-   manage participants;
-   manage questions;
-   manage keys;
-   generate tickets;
-   control game;
-   verify winners;
-   inspect audit logs;
-   perform recovery operations.

### Admin

Can:

-   manage participants;
-   manage questions;
-   manage keys;
-   manage tickets;
-   manage rounds;
-   operate the live game;
-   verify winners;
-   access operational logs.

Admin management remains restricted to Super Admin.

------------------------------------------------------------------------

# 12. Event Model

An event represents the complete Tech Tombola occurrence.

Example:

``` text
Tech Tombola 2026
    ├── Round 1
    ├── Round 2
    ├── Round 3
    └── Final Round
```

Event fields should include:

-   id;
-   name;
-   description;
-   status;
-   scheduled start;
-   scheduled end;
-   created_by;
-   created_at;
-   updated_at.

Event statuses:

``` text
DRAFT
READY
LIVE
PAUSED
COMPLETED
CANCELLED
```

------------------------------------------------------------------------

# 13. Round Model

A round is an individual traditional Tombola game.

Each round has:

-   event_id;
-   name;
-   sequence_number;
-   status;
-   question pool;
-   key pool;
-   participant ticket assignments;
-   draw history;
-   winning patterns;
-   winners.

Round statuses:

``` text
DRAFT
READY
ACTIVE
PAUSED
RECOVERY_REQUIRED
COMPLETED
CANCELLED
```

Only one round may be `ACTIVE` across the deployment at a time.

A round may become `READY` only when it has enabled winning patterns,
at least fifteen distinct eligible question/key pairs, and an immutable
ticket for every active participant in the Event. Starting the first
Round promotes a `READY` Event to `LIVE` in the same transaction.

------------------------------------------------------------------------

# 14. Key Model

A key is the answer/value that can appear on a participant's ticket.

Examples:

``` text
RUSSIA
AWS-S3
DOCKER
LINUX
PYTHON
IEEE-01
GIT
TCP
```

A key should contain:

-   internal UUID;
-   event_id;
-   human-readable value;
-   category;
-   optional description;
-   active status;
-   created_at;
-   updated_at.

The database ID must be independent of the displayed key.

Key values are trimmed, uppercased, and have internal whitespace
collapsed before persistence. The normalized value is unique within an
Event. MVP values are 2--50 characters and contain letters, digits,
spaces, or hyphens.

------------------------------------------------------------------------

# 15. Question Model

A question represents the content used to reveal a key.

Required fields:

-   id;
-   round_id;
-   question_text;
-   key_id;
-   category;
-   difficulty;
-   active;
-   created_at;
-   updated_at.

Example:

``` text
Question:
Which AWS service provides object storage?

Key:
AWS-S3
```

A question must reference exactly one key.

For the MVP, a Round may have at most one active Question for a given
Key. The same Event-scoped Key may be used by Questions in different
Rounds.

------------------------------------------------------------------------

# 16. Question/Key Validation

A question cannot be activated if:

-   question text is empty;
-   key does not exist;
-   key is inactive;
-   question belongs to another incompatible round;
-   duplicate active draw content violates round constraints.

Question edits after a draw must not mutate historical draw records.

Historical draws must preserve the question/key snapshot necessary for
auditability.

------------------------------------------------------------------------

# 17. Ticket Model

A ticket belongs to:

-   participant;
-   event;
-   round.

A ticket contains exactly 15 populated cells.

Layout:

``` text
3 rows × 9 columns
5 populated cells per row
15 populated cells total
```

Each populated cell references a key.

------------------------------------------------------------------------

# 18. Ticket Generation

Ticket generation must be deterministic enough to test and random enough
for real events.

The generator must:

-   produce valid 3×9 Tombola layouts;
-   produce exactly five populated cells per row;
-   produce exactly fifteen populated cells;
-   prevent duplicate keys within a ticket;
-   use only keys available to the round;
-   persist the generated ticket;
-   preserve the ticket after game start.

Ticket generation must happen server-side.

------------------------------------------------------------------------

# 19. Ticket Immutability

After a round becomes `ACTIVE`:

> Participant ticket layout is immutable.

No automatic ticket regeneration is permitted.

Administrative ticket changes after activation must require explicit
elevated action and must be audited.

Preferred MVP rule:

**Ticket changes are forbidden after round activation.**

------------------------------------------------------------------------

# 20. Draw Engine

The draw engine is one of the most critical backend modules.

The primary action is:

``` http
POST /api/admin/rounds/:roundId/draws
```

The backend must:

1.  verify the caller has permission;
2.  verify the round is active;
3.  select an unused eligible question;
4.  create a draw record;
5.  resolve its key;
6.  commit the transaction;
7.  broadcast the draw event;
8.  update clients.

------------------------------------------------------------------------

# 21. Random Draw Rules

A question can be drawn only once per round.

The backend must prevent:

``` text
Question A → Draw 1
Question A → Draw 2
```

even under concurrent requests.

The draw operation must use a database transaction/locking strategy to
guarantee uniqueness.

------------------------------------------------------------------------

# 22. Manual Draw

The host may manually select a question/key.

Manual draw must validate:

-   question exists;
-   question belongs to round;
-   question is active;
-   question has not already been drawn;
-   round is active;
-   caller has authorization.

Manual draws must be indistinguishable from automatic draws in the
official history except for the recorded `draw_mode`.

Possible values:

``` text
RANDOM
MANUAL
```

------------------------------------------------------------------------

# 23. Draw Record

A draw must preserve historical state.

Recommended fields:

``` text
id
round_id
question_id
key_id
sequence_number
draw_mode
drawn_at
drawn_by
```

The draw record is immutable.

------------------------------------------------------------------------

# 24. Participant Marking

Participants manually mark ticket cells.

The client may request:

``` http
POST /api/participant/tickets/:ticketId/marks
```

with a cell identifier.

The server must verify:

1.  ticket belongs to authenticated participant;
2.  cell belongs to ticket;
3.  cell contains a key;
4.  key has been officially drawn;
5.  round is active or the mark is otherwise valid according to round
    state.

Invalid marking requests must be rejected.

------------------------------------------------------------------------

# 25. Mark State

The backend persists participant marking state for UX/recovery.

However:

> Mark state must never be trusted for winner validation.

Winner validation must ignore Mark state and recalculate eligibility from:

``` text
Official Draws
+
Ticket Layout
+
Winning Pattern configuration
```

The persisted mark is a participant interaction state, not the final
authority.

------------------------------------------------------------------------

# 26. Winner Evaluation Engine

The winner engine evaluates:

``` text
Ticket
+
Official Draw History
+
Winning Pattern
```

Supported MVP patterns:

-   Early 5;
-   Top Line;
-   Middle Line;
-   Bottom Line;
-   Full House.

Early 5 is satisfied when at least five Keys on the assigned Ticket
have been officially drawn. A Claim does not become invalid merely
because additional Keys were drawn before submission.

The implementation should use a generic pattern interface so future
patterns can be added without rewriting the draw engine.

------------------------------------------------------------------------

# 27. Winning Pattern Configuration

Each round contains enabled winning patterns.

Example:

``` json
{
  "type": "TOP_LINE",
  "enabled": true,
  "maxWinners": 1
}
```

Pattern state:

``` text
OPEN
CLOSED
```

The system must not issue a new claim for a closed pattern.

------------------------------------------------------------------------

# 28. Win Claim

A participant can submit:

``` http
POST /api/participant/claims
```

A claim request must contain:

-   round;
-   winning pattern.

The backend derives the Ticket from the authenticated Participant and
Round; a client cannot nominate another Ticket.

The server recalculates eligibility.

If structurally valid but ineligible:

``` http
422 Unprocessable Entity
```

with a safe explanation.

Duplicate Claims and Claims for closed Patterns return `409 Conflict`.

If valid:

``` text
PENDING_VERIFICATION
```

is created.

------------------------------------------------------------------------

# 29. Winner Verification

Admin endpoint:

``` http
POST /api/admin/claims/:claimId/verify
```

Possible actions:

``` text
VERIFY
REJECT
```

Verification creates a winner record.

Winner record must contain:

-   claim_id;
-   participant_id;
-   round_id;
-   pattern;
-   verified_by;
-   verified_at.

------------------------------------------------------------------------

# 30. Winner Race Conditions

Two participants may become eligible for the same pattern at nearly the
same time.

The backend must use a transaction to prevent conflicting winner
assignment.

If:

``` text
maxWinners = 1
```

only one claim can become the official winner.

The second claim must be marked:

``` text
REJECTED_PATTERN_ALREADY_CLOSED
```

if the category has already been awarded.

------------------------------------------------------------------------

# 31. Round Completion

The system must not automatically destroy or mutate state after a final
winner.

When a final winning condition is detected:

``` text
FINAL CONDITION DETECTED
        ↓
ADMIN CONFIRMATION
        ↓
ROUND COMPLETED
```

This preserves human control during the live event.

------------------------------------------------------------------------

# 32. Recovery

If the application crashes during an active round:

1.  PostgreSQL remains authoritative.
2.  Draw history remains intact.
3.  Tickets remain intact.
4.  Claims remain intact.
5.  Winner records remain intact.
6.  Startup changes the previously active Round to
    `RECOVERY_REQUIRED`.
7.  The backend validates Draw sequences, Tickets, Marks, Claims,
    Winners, and Pattern closure directly from PostgreSQL.
8.  Admin confirms resume.
9.  Round returns to `ACTIVE`.

No draw should be silently repeated.

No game-critical cache is reconstructed as a second source of truth.
Only connection registries and other transport state remain in memory.

------------------------------------------------------------------------

# 33. Real-Time Game Events

The backend exposes two broadcast-only WebSocket channels for active
Rounds:

-   a browser-session-authenticated channel for Participants and Admins;
-   a public, read-only Live Display channel restricted to an explicit
    safe-event allowlist.

WebSocket client messages never mutate game state. REST commands are
the only mutation surface.

Example events:

``` text
ROUND_STARTED
ROUND_PAUSED
ROUND_RESUMED
DRAW_CREATED
WIN_CLAIM_CREATED
WINNER_VERIFIED
ROUND_COMPLETED
ANNOUNCEMENT
```

Example payload:

``` json
{
  "type": "DRAW_CREATED",
  "roundId": "round_123",
  "sequence": 18,
  "key": "RUSSIA",
  "question": "Which is the largest country by area?",
  "drawnAt": "2026-10-06T12:00:00Z"
}
```

Sensitive participant data must never be broadcast globally.

------------------------------------------------------------------------

# 34. Connection Recovery

A reconnecting participant must not depend solely on missed WebSocket
messages.

The client must be able to fetch the current authoritative round state
through REST.

Therefore:

``` text
WebSocket = fast updates
REST API  = authoritative recovery/synchronization
Database  = source of truth
```

------------------------------------------------------------------------

# 35. Participant API Surface

Minimum endpoints:

``` text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/participant/event
GET    /api/participant/round/current
GET    /api/participant/ticket
GET    /api/participant/draws
POST   /api/participant/tickets/:ticketId/marks
DELETE /api/participant/tickets/:ticketId/marks/:cellId
POST   /api/participant/claims
GET    /api/participant/claims
GET    /api/participant/wins
```

------------------------------------------------------------------------

# 36. Admin API Surface

Minimum endpoints:

``` text
GET    /api/admin/dashboard

GET    /api/admin/participants
POST   /api/admin/participants
POST   /api/admin/participants/import
GET    /api/admin/participants/:id
PATCH  /api/admin/participants/:id

GET    /api/admin/keys
POST   /api/admin/keys
PATCH  /api/admin/keys/:id

GET    /api/admin/questions
POST   /api/admin/questions
PATCH  /api/admin/questions/:id
DELETE /api/admin/questions/:id

GET    /api/admin/events
POST   /api/admin/events
PATCH  /api/admin/events/:id

GET    /api/admin/rounds
POST   /api/admin/rounds
PATCH  /api/admin/rounds/:id

POST   /api/admin/rounds/:id/start
POST   /api/admin/rounds/:id/ready
POST   /api/admin/rounds/:id/pause
POST   /api/admin/rounds/:id/resume
POST   /api/admin/rounds/:id/complete
POST   /api/admin/rounds/:id/cancel
POST   /api/admin/rounds/:id/recover

POST   /api/admin/rounds/:id/tickets/generate

POST   /api/admin/rounds/:id/draws
POST   /api/admin/rounds/:id/draws/manual
GET    /api/admin/rounds/:id/draws

GET    /api/admin/claims
POST   /api/admin/claims/:id/verify
POST   /api/admin/claims/:id/reject

GET    /api/admin/winners
GET    /api/admin/audit
```

------------------------------------------------------------------------

# 37. Super Admin API Surface

Super Admin-only endpoints:

``` text
GET    /api/super-admin/admins
POST   /api/super-admin/admins
PATCH  /api/super-admin/admins/:id
DELETE /api/super-admin/admins/:id

GET    /api/super-admin/system
POST   /api/super-admin/recovery/*
```

Authorization must be enforced server-side.

------------------------------------------------------------------------

# 38. Live Display API

The live display requires a read-only API.

``` text
GET /api/live/event
GET /api/live/round
GET /api/live/draws
GET /api/live/winners
```

The live screen must not have participant or admin privileges.

------------------------------------------------------------------------

# 39. Authentication Requirements

Authentication must:

-   identify the user;
-   enforce role;
-   expire sessions appropriately;
-   prevent token/session reuse after logout where required;
-   protect admin routes;
-   protect participant data from cross-user access.

Participants must only access their own ticket.

Browser authentication uses an HTTP-only secure cookie containing a
signed JWT whose `jti` references an active database Session. Protected
requests validate both artifacts. Logout revokes the Session
immediately, and WebSocket authentication uses the same cookie rather
than a token in a query string.

For browser clients, `CORS_ORIGIN` is a comma-separated exact allowlist.
Credentialed responses must echo only a configured origin; wildcard
origins are not permitted. Preflight must allow the API's supported
methods (`GET`, `HEAD`, `POST`, `PATCH`, and `DELETE`) and the request
headers used by the client (`Content-Type` and `Idempotency-Key`). Keep
the method list aligned with registered routes when the API changes.

------------------------------------------------------------------------

# 40. Authorization Matrix

  Capability              Participant     Admin   Super Admin
  --------------------- ------------- --------- -------------
  View own ticket                 Yes        No            No
  Mark own ticket                 Yes        No            No
  Claim win                       Yes        No            No
  Manage participants              No       Yes           Yes
  Manage questions                 No       Yes           Yes
  Manage keys                      No       Yes           Yes
  Manage rounds                    No       Yes           Yes
  Draw question                    No       Yes           Yes
  Verify winner                    No       Yes           Yes
  View audit logs                  No       Yes           Yes
  Manage admins                    No        No           Yes
  System recovery                  No   Limited           Yes

------------------------------------------------------------------------

# 41. Participant Import

The backend must support bulk participant import.

CSV fields:

``` text
name
email
optional external_id
```

Import processing must:

-   validate email;
-   detect duplicates;
-   report invalid rows;
-   create valid accounts;
-   generate initial credentials;
-   assign tickets where configured;
-   produce an import result report.

Import is transactional per participant and returns a complete report
of created, skipped, and failed rows. A bad row does not roll back valid
rows. The MVP accepts CSV with `name`, `email`, and optional
`external_id`; JSON import and participant phone numbers are outside
scope.

------------------------------------------------------------------------

# 42. Email Delivery

Participant credentials must be deliverable by email.

The backend should integrate with an external transactional email
provider rather than operating its own mail server.

Credential email is sent after the participant transaction commits.
The generated temporary password exists only in process memory long
enough to hash and send it; it is never written to an EmailJob, audit
record, application log, or database column. Delivery metadata may be
recorded asynchronously. A failed delivery leaves the account intact
and requires an administrator to regenerate the credential.

Required email states:

``` text
PENDING
SENT
FAILED
```

Email failures must not delete participant accounts.

------------------------------------------------------------------------

# 43. Password Requirement

The product team requested administrative access to participant
passwords.

The backend must **not store plaintext passwords**.

Instead:

-   store Argon2id password hashes;
-   provide credential issuance;
-   allow admin-controlled credential regeneration if needed;
-   email the newly generated temporary credential.

This maintains the operational requirement without creating a plaintext
password database.

------------------------------------------------------------------------

# 44. Security Requirements

## Authentication

-   Argon2id password hashing.
-   Secure session/token handling.
-   Login rate limiting.
-   Account lockout/throttling where appropriate.

## Authorization

Every protected endpoint must verify:

1.  authentication;
2.  role;
3.  resource ownership;
4.  event/round scope.

## Input validation

All request bodies, query parameters, and path parameters must be
validated.

## Database

Use parameterized queries/ORM-safe queries.

## Secrets

Never store secrets in source code.

Use environment variables or AWS secret management.

------------------------------------------------------------------------

# 45. Data Isolation

A participant must never be able to access:

-   another participant's ticket;
-   another participant's claims;
-   another participant's account details;
-   admin endpoints;
-   unpublished questions;
-   internal answer metadata not intended for the participant.

Authorization must be tested explicitly.

------------------------------------------------------------------------

# 46. Answer-Key Exposure

The backend should carefully control what information is returned before
a draw.

Before a question is drawn, participant APIs must not expose:

``` text
question.answer/key
```

for future questions.

The participant only receives the key after it is officially drawn.

This prevents participants from obtaining the complete future answer
pool.

------------------------------------------------------------------------

# 47. Anti-Cheat Requirements

The backend must assume that users can inspect browser requests.

Therefore:

-   future keys cannot be sent to participant clients;
-   full question pools cannot be exposed;
-   winner calculations must be server-side;
-   marks must be validated;
-   draws must be authoritative;
-   tickets must be immutable during active gameplay;
-   admin endpoints must be protected.

------------------------------------------------------------------------

# 48. Audit Logging

The backend must record security and game-critical events.

Minimum events:

``` text
LOGIN_SUCCESS
LOGIN_FAILED
PARTICIPANT_CREATED
PARTICIPANT_IMPORTED
TICKET_GENERATED
QUESTION_CREATED
QUESTION_UPDATED
KEY_CREATED
ROUND_STARTED
ROUND_PAUSED
ROUND_RESUMED
DRAW_CREATED
MANUAL_DRAW_CREATED
MARK_CREATED
MARK_REMOVED
WIN_CLAIM_CREATED
WIN_CLAIM_REJECTED
WIN_VERIFIED
ROUND_COMPLETED
RECOVERY_STARTED
RECOVERY_COMPLETED
```

Audit records should include:

-   actor;
-   action;
-   resource;
-   timestamp;
-   relevant metadata;
-   IP/user-agent where appropriate.

------------------------------------------------------------------------

# 49. Error Handling

API errors must be consistent.

Example:

``` json
{
  "error": {
    "code": "QUESTION_ALREADY_DRAWN",
    "message": "This question has already been drawn."
  },
  "requestId": "req_123"
}
```

Do not expose stack traces or database errors to clients.

------------------------------------------------------------------------

# 50. HTTP Status Conventions

Use:

``` text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

Examples:

-   invalid ticket mark → `422`;
-   duplicate draw → `409`;
-   unauthenticated → `401`;
-   unauthorized admin action → `403`;
-   invalid request shape → `400`.

------------------------------------------------------------------------

# 51. Idempotency

Critical game operations must be safe against accidental duplicate
requests.

Particularly:

-   draw creation;
-   winner verification;
-   round start;
-   round resume;
-   participant import.
-   ticket generation.

A double-click on `DRAW NEXT` must not create two draws.

These operations require an `Idempotency-Key` header. The backend stores
the outcome under the authenticated actor, operation, and key, and
replays that outcome for a retry. A different key represents an
independent command. Idempotency records contain no credentials or
sensitive response fields.

------------------------------------------------------------------------

# 52. Database Transaction Requirements

Transactions are mandatory for:

### Draw creation

``` text
lock/check question
→ create draw
→ update round state
→ commit
→ broadcast
```

### Winner verification

``` text
lock claim/pattern
→ verify eligibility
→ verify pattern capacity
→ create winner
→ close pattern if required
→ commit
```

### Ticket generation

``` text
generate
→ validate
→ persist ticket + cells
→ commit
```

------------------------------------------------------------------------

# 53. State Machine Requirements

Round transitions must be explicit.

Valid examples:

``` text
DRAFT → READY
READY → ACTIVE
ACTIVE → PAUSED
PAUSED → ACTIVE
ACTIVE → RECOVERY_REQUIRED
RECOVERY_REQUIRED → ACTIVE
ACTIVE → COMPLETED
```

Invalid transitions must return an error.

For example:

``` text
COMPLETED → ACTIVE
```

must be rejected.

------------------------------------------------------------------------

# 54. Testing Requirements

No game-critical backend feature is considered complete without
automated tests.

Testing layers:

1.  Unit tests
2.  Integration tests
3.  API tests
4.  Database transaction tests
5.  Security/authorization tests
6.  End-to-end critical-flow tests

------------------------------------------------------------------------

# 55. Unit Test Requirements

## Ticket generator

Must test:

-   exactly 3 rows;
-   exactly 9 columns;
-   exactly 15 populated cells;
-   exactly 5 populated cells per row;
-   no duplicate keys;
-   invalid key pool;
-   insufficient keys;
-   deterministic seeded generation.

Suggested tests:

``` text
TestTicketGenerator_validTraditionalLayout
TestTicketGenerator_exactly15Cells
TestTicketGenerator_fiveCellsPerRow
TestTicketGenerator_noDuplicateKeys
TestTicketGenerator_insufficientKeyPool
```

------------------------------------------------------------------------

# 56. Draw Engine Test Requirements

``` text
TestDraw_randomDrawCreatesSingleDraw
TestDraw_sameQuestionCannotBeDrawnTwice
TestDraw_manualDrawRejectsAlreadyDrawnQuestion
TestDraw_drawRejectedWhenRoundInactive
TestDraw_concurrentDrawRequestsProduceOneDraw
TestDraw_sequenceNumbersRemainContinuous
```

------------------------------------------------------------------------

# 57. Winner Engine Test Requirements

Test:

-   Early 5;
-   Top Line;
-   Middle Line;
-   Bottom Line;
-   Full House;
-   incomplete tickets;
-   invalid marks;
-   false claims;
-   simultaneous claims;
-   closed patterns.

Example:

``` text
TestWinner_topLineDetected
TestWinner_middleLineDetected
TestWinner_bottomLineDetected
TestWinner_fullHouseDetected
TestWinner_invalidClaimRejected
TestWinner_secondClaimRejectedAfterPatternClosed
```

------------------------------------------------------------------------

# 58. Authentication Test Requirements

Test:

-   valid login;
-   invalid password;
-   inactive account;
-   participant accessing another ticket;
-   admin accessing participant-only endpoint;
-   admin vs super-admin permissions;
-   expired session/token;
-   rate limiting.

------------------------------------------------------------------------

# 59. Integration Test Requirements

Critical scenario:

``` text
Create Event
    ↓
Create Round
    ↓
Create Keys
    ↓
Create Questions
    ↓
Import Participants
    ↓
Generate Tickets
    ↓
Start Round
    ↓
Draw Question
    ↓
Participant Receives Key
    ↓
Participant Marks Key
    ↓
Participant Claims Win
    ↓
Admin Verifies
    ↓
Winner Recorded
    ↓
Round Completed
```

This flow must be tested end-to-end.

------------------------------------------------------------------------

# 60. Performance Requirements

For the target 400--500 active-user event:

### API

Normal read APIs should target:

-   p50 \< 200ms;
-   p95 \< 500ms;
-   p99 \< 1s under expected load.

Game-control APIs should remain responsive under participant load.

### Draw propagation

A successful draw should become visible to connected clients within
approximately 1 second under normal network conditions.

------------------------------------------------------------------------

# 61. Load Testing

Before the event, simulate at minimum:

-   500 authenticated users;
-   500 ticket reads;
-   500 concurrent game-state reads;
-   simultaneous reconnects;
-   multiple participants claiming wins;
-   host drawing while users are connected.

The test must verify:

-   no duplicate draws;
-   no cross-user data;
-   no lost ticket state;
-   no corrupted winner state.

------------------------------------------------------------------------

# 62. Database Indexing Requirements

Indexes should exist for common access patterns.

At minimum:

``` text
users.email
participants.user_id
tickets.participant_id
tickets.round_id
ticket_cells.ticket_id
ticket_cells.key_id
questions.round_id
questions.key_id
draws.round_id
draws.question_id
draws.sequence_number
claims.round_id
claims.participant_id
claims.status
winners.round_id
audit_logs.actor_id
audit_logs.created_at
```

Unique constraints must enforce critical game invariants.

------------------------------------------------------------------------

# 63. Observability

MVP observability should remain lightweight.

Required:

-   application logs;
-   request IDs;
-   structured error logging;
-   database error logging;
-   authentication failure logging;
-   game-action logging;
-   basic health endpoint.

Endpoints:

``` http
GET /health
GET /ready
```

------------------------------------------------------------------------

# 64. Backup and Recovery

PostgreSQL data must have a backup strategy.

At minimum:

-   automated database backups where supported;
-   pre-event backup;
-   pre-round backup/snapshot where practical;
-   documented restore procedure.

Before the live event, the team must perform a restore test.

------------------------------------------------------------------------

# 65. Health Checks

`/health` should verify application availability.

`/ready` should verify dependencies required to serve traffic,
especially:

-   database connectivity;
-   required configuration.

------------------------------------------------------------------------

# 66. Environment Configuration

Environment variables should include:

``` text
NODE_ENV
PORT
DATABASE_URL
JWT_SECRET
SESSION_SECRET
EMAIL_PROVIDER_API_KEY
EMAIL_FROM
APP_URL
CORS_ORIGIN
LOG_LEVEL
```

Secrets must never be committed to Git.

------------------------------------------------------------------------

# 67. Recommended Repository Structure

``` text
backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   └── constants.ts
│   │
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── participants/
│   │   ├── admins/
│   │   ├── events/
│   │   ├── rounds/
│   │   ├── keys/
│   │   ├── questions/
│   │   ├── tickets/
│   │   ├── draws/
│   │   ├── winners/
│   │   ├── live/
│   │   ├── email/
│   │   └── audit/
│   │
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── roles.ts
│   │   └── rateLimit.ts
│   │
│   ├── realtime/
│   │   ├── websocket.ts
│   │   └── events.ts
│   │
│   ├── shared/
│   │   ├── errors/
│   │   ├── validation/
│   │   └── utils/
│   │
│   └── tests/
│
├── drizzle/
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

------------------------------------------------------------------------

# 68. Module Responsibilities

Each module should own its domain behavior.

Example:

``` text
draws/
  draw.service.ts
  draw.repository.ts
  draw.routes.ts
  draw.schemas.ts
  draw.test.ts
```

The draw module should not directly manipulate unrelated participant
internals.

This keeps the monolith modular and maintainable.

------------------------------------------------------------------------

# 69. API Versioning

All public APIs should begin under:

``` text
/api/v1/
```

Example:

``` text
/api/v1/participant/ticket
/api/v1/admin/rounds
```

This avoids breaking clients if the API evolves.

------------------------------------------------------------------------

# 70. Functional Requirements

## FR-001 Authentication

The system shall authenticate registered participants and
administrators.

## FR-002 Authorization

The system shall enforce Participant/Admin/Super Admin permissions.

## FR-003 Event Management

Admins shall create and configure events.

## FR-004 Round Management

Admins shall create and operate multiple Tombola rounds.

## FR-005 Key Management

Admins shall create and manage answer keys.

## FR-006 Question Management

Admins shall create questions associated with keys.

## FR-007 Ticket Generation

The system shall generate valid traditional Tombola tickets.

## FR-008 Ticket Persistence

Tickets shall remain persistent throughout the event.

## FR-009 Draw

The system shall randomly draw unused questions.

## FR-010 Manual Draw

Admins shall be able to manually select an eligible question.

## FR-011 Draw History

Every draw shall be persisted.

## FR-012 Participant Marking

Participants shall manually mark drawn keys.

## FR-013 Mark Validation

The backend shall reject marks for undrawn keys.

## FR-014 Winner Detection

The backend shall evaluate supported winning patterns.

## FR-015 Win Claims

Participants shall submit winning claims.

## FR-016 Winner Verification

Admins shall verify/reject claims.

## FR-017 Live Updates

Connected clients shall receive game updates.

## FR-018 Recovery

The system shall recover game state after application restart.

## FR-019 Audit

Game-critical operations shall be auditable.

## FR-020 Bulk Participant Import

Admins shall import participants from CSV.

## FR-021 Email

The system shall send participant credentials.

------------------------------------------------------------------------

# 71. Non-Functional Requirements

## NFR-001 Availability

The backend should remain available throughout the event.

## NFR-002 Performance

Normal API requests should remain below the defined latency targets
under expected load.

## NFR-003 Scalability

The system must support at least 500 active participants without
architectural changes.

## NFR-004 Security

No plaintext passwords or unauthorized participant data exposure.

## NFR-005 Integrity

Official draws and winners must be transactionally consistent.

## NFR-006 Recovery

Game state must survive application restart.

## NFR-007 Maintainability

Backend must use modular TypeScript architecture.

## NFR-008 Observability

Errors and game-critical operations must be traceable.

## NFR-009 Cost

The architecture should remain within the club's approximately \$100 AWS
budget/free-tier target.

## NFR-010 Portability

The application should be containerizable and deployable without
infrastructure-specific application logic.

------------------------------------------------------------------------

# 72. Critical Invariants

These rules must never be violated:

1.  A participant can have only the ticket assigned to them for a round.
2.  A ticket cannot contain duplicate keys.
3.  A ticket has exactly 15 populated cells.
4.  Each row has exactly 5 populated cells.
5.  A question cannot be drawn twice in one round.
6.  A key cannot be officially drawn twice through separate questions
    unless explicitly allowed by the round configuration.
7.  A participant cannot mark an undrawn key.
8.  A participant cannot claim a win without server-side eligibility.
9.  A closed winning pattern cannot receive a new winner.
10. A completed round cannot silently resume.
11. Historical draws cannot be edited.
12. Historical winners cannot be silently deleted.
13. Participants cannot access another participant's data.
14. Future answer keys must not be exposed to participants.
15. Plaintext passwords must never be persisted.

------------------------------------------------------------------------

# 73. Definition of Done --- Backend MVP

Backend MVP is complete only when:

-   [ ] Authentication works.
-   [ ] Role authorization works.
-   [ ] Participant CSV import works.
-   [ ] Credential email workflow works.
-   [ ] Events can be created.
-   [ ] Multiple rounds can be configured.
-   [ ] Keys can be created.
-   [ ] Questions can be created and associated with keys.
-   [ ] Valid tickets can be generated.
-   [ ] Tickets persist.
-   [ ] A round can start/pause/resume.
-   [ ] Random draws work.
-   [ ] Manual draws work.
-   [ ] Duplicate draws are impossible.
-   [ ] Participant marks are validated.
-   [ ] Winning patterns work.
-   [ ] Claims work.
-   [ ] Winner verification works.
-   [ ] Concurrent winner claims are handled safely.
-   [ ] Live game events propagate.
-   [ ] REST state recovery works after reconnect.
-   [ ] Application restart recovery works.
-   [ ] Audit logs work.
-   [ ] Security tests pass.
-   [ ] 500-user load test passes.
-   [ ] Database backup/restore is tested.
-   [ ] Deployment fits the agreed AWS cost envelope.

------------------------------------------------------------------------

# 74. Engineering Principle

The backend should be deliberately boring.

The event is live, competitive, and time-sensitive. Reliability is more
valuable than architectural complexity.

The preferred implementation is:

``` text
TypeScript
   +
Bun
   +
Fastify
   +
PostgreSQL
   +
Drizzle
   +
Zod
   +
WebSocket
```

deployed as a modular monolith.

The architecture should be capable of becoming more distributed later,
but the MVP must not pay the operational and financial cost of
distributed infrastructure before it is needed.

------------------------------------------------------------------------

# 75. Final Backend Architecture

``` text
                         ┌───────────────────┐
                         │ Participant React │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Admin React       │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Live Display      │
                         └─────────┬─────────┘
                                   │
                              HTTPS / WS
                                   │
                    ┌──────────────▼──────────────┐
                    │        Bun / Fastify        │
                    │          TypeScript         │
                    │                             │
                    │ Auth / RBAC                 │
                    │ Participants                │
                    │ Events / Rounds             │
                    │ Questions / Keys            │
                    │ Tickets                     │
                    │ Draw Engine                 │
                    │ Winner Engine               │
                    │ Claims                      │
                    │ Live Events                 │
                    │ Audit                       │
                    │ Email                       │
                    └──────────────┬──────────────┘
                                   │
                         Transactional SQL
                                   │
                    ┌──────────────▼──────────────┐
                    │        PostgreSQL           │
                    │                             │
                    │ Users                       │
                    │ Events                      │
                    │ Rounds                      │
                    │ Questions                   │
                    │ Keys                        │
                    │ Tickets                     │
                    │ Draws                       │
                    │ Claims                      │
                    │ Winners                     │
                    │ Audit Logs                  │
                    └─────────────────────────────┘
```

**Backend architectural decision:** Keep the first production version as
a **single Bun/TypeScript modular monolith backed by PostgreSQL**,
with WebSocket-based live updates and no Redis/Kafka/microservices
unless real load testing proves they are necessary.
