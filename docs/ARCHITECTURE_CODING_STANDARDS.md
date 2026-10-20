# Architecture & Coding Standards — Tech Tombola

Authoritative reference for architecture, layer boundaries, data contracts, and coding standards across the Tech Tombola codebase.

## 1. System Overview

Tech Tombola is a technology-themed digital Tombola game for ~400–500 live participants. It is a **single modular monolith** backend serving three React frontends through REST + WebSocket.

```text
                     ┌───────────────────────┐
                     │ Participant (mobile)   │
                     ├───────────────────────┤
                     │ Admin (desktop/tablet) │
                     ├───────────────────────┤
                     │ Live Display (projector)│
                     └───────────┬───────────┘
                                 │
                          HTTPS / WebSocket
                                 │
                     ┌───────────▼───────────┐
                     │  Bun / Fastify         │
                     │  TypeScript            │
                     │  Modular Monolith      │
                     └───────────┬───────────┘
                                 │
                          Transactional SQL
                                 │
                     ┌───────────▼───────────┐
                     │     PostgreSQL         │
                     └───────────────────────┘
```

---

## 2. Technology Stack

### Backend

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Bun (v1.x) | Server runtime & package manager |
| Language | TypeScript (strict) | Type safety, API contracts |
| HTTP Framework | Fastify | Low-overhead HTTP server |
| Database | PostgreSQL | Source of truth for all game state |
| ORM/Query | Drizzle ORM + SQL migrations | Type-safe DB access with explicit transactions |
| Validation | Zod | Schema validation for all external input |
| Auth | JWT + Argon2id | Access tokens + secure password hashing |
| Real-time | Native WebSocket (ws) | Lightweight game event broadcasting |
| Email | External transactional provider | Credential delivery |
| Testing | Bun test / Vitest | Unit + integration tests |

### Frontend

| Layer | Technology | Purpose |
|---|---|---|
| UI | React | Component rendering |
| Language | TypeScript | Type-safe components and state |
| Build | Vite | Fast dev server and production builds |
| Animation | GSAP | Purposeful game event animations |
| Routing | React Router | SPA route management |
| Server State | TanStack Query | Cached, deduplicated server data |
| Client State | Zustand | Ephemeral UI state (WebSocket status, modals, animations) |
| Validation | Zod | Client-side schema validation (UX only) |
| Styling | CSS Modules / modern CSS | Scoped, maintainable styles |
| Real-time | Native WebSocket client | Live game event consumption |
| HTTP | Typed Fetch API client | Backend communication |
| Testing | Vitest + React Testing Library | Unit + component tests |
| E2E | Playwright | End-to-end critical flow tests |

---

## 3. Backend Architecture — Layer Boundaries

### Layer flow

```text
routes → service → domain ← repository
                         ← email
                         ← websocket
```

### Layer responsibilities

| Layer | Responsibility | May depend on | Must NOT do |
|---|---|---|---|
| **Routes** (`*.routes.ts`) | Parse HTTP request/response, validate with Zod, call service, return JSON | Service, Zod schemas | Contain game logic, call repository directly, broadcast WebSocket |
| **Service** (`*.service.ts`) | Orchestrate use-case: coordinate domain, repository, and side effects | Domain, Repository, WebSocket, Email | Contain game rules, parse HTTP, know about Fastify |
| **Domain** (`*.domain.ts` / `domain/`) | Pure game logic: ticket generation, draw validation, winner evaluation, state machines | Nothing external | Access database, HTTP, WebSocket, or any IO |
| **Repository** (`*.repository.ts`) | Database access: queries, transactions, persistence | Drizzle ORM, DB client | Contain game logic, validate business rules |
| **WebSocket** (`realtime/`) | Broadcast game events to connected clients | Event types | Determine game state, validate draws or wins |
| **Email** (`email/`) | Send transactional emails (credential delivery) | External email provider | Contain business logic |

### Example: Draw creation flow

```text
Admin clicks "Draw Next"
  ↓
POST /api/v1/admin/rounds/:id/draws
  ↓
draw.routes.ts — validate request, check auth/role
  ↓
draw.service.ts — check round is ACTIVE, call domain, persist, broadcast
  ↓
draw.domain.ts — select random unused question, validate draw rules
  ↓
draw.repository.ts — persist draw record in transaction
  ↓
websocket — broadcast DRAW_CREATED to all connected clients
  ↓
201 Created response
```

---

## 4. Frontend Architecture — Layer Boundaries

### Layer flow

```text
pages → features → hooks → lib/api → Bun backend
                 ↘ components
```

### Layer responsibilities

| Layer | Responsibility | May depend on | Must NOT do |
|---|---|---|---|
| **Pages** (`pages/`) | Route-level wiring of features and layouts | Features, Layouts | Contain fetch calls, game logic |
| **Features** (`features/`) | Feature-specific components, hooks, and logic | Hooks, Components, lib/api, Types | Duplicate game logic from backend |
| **Components** (`components/`) | Reusable presentational UI (props in, events out) | Types, Styles | Call API directly, manage server state |
| **Hooks** (`hooks/`) | Data fetching (TanStack Query), form state, derived UI state | lib/api, Zustand stores | Contain game rules |
| **lib/api** (`lib/api/`) | Typed HTTP client for all backend endpoints | Fetch, Types | Contain business logic |
| **lib/websocket** (`lib/websocket/`) | WebSocket connection management, event parsing | Types, Zustand stores | Determine game state validity |
| **Stores** (`stores/`) | Zustand stores for ephemeral client state | Types | Duplicate authoritative server state |
| **Types** (`types/`) | Shared TypeScript types mirroring backend DTOs | Nothing | Invent types that don't match the backend contract |

### Game authority principle

The backend is the **source of truth** for all game-critical state. The frontend:
- **Displays** server state
- **Requests** game actions (mark, claim)
- **Never decides** whether a draw, mark, ticket, or win is valid
- **Never exposes** future keys, undrawn questions, or other participants' data

### State management

| Category | Tool | Examples |
|---|---|---|
| Server state | TanStack Query | Ticket, draws, round status, claims, event, winners |
| Ephemeral UI state | Zustand | WebSocket connection status, animation state, modal visibility |
| Auth state | TanStack Query + cookies | Session, user profile, role |

Do NOT duplicate authoritative server state in Zustand.

---

## 5. Backend Module Structure

```text
backend/
├── src/
│   ├── app.ts                    # Fastify app setup
│   ├── server.ts                 # Server entry point
│   ├── config/
│   │   ├── env.ts                # Environment variable parsing (Zod)
│   │   └── constants.ts          # Application constants
│   ├── db/
│   │   ├── client.ts             # Database connection
│   │   ├── schema/               # Drizzle schema definitions
│   │   └── migrations/           # SQL migrations
│   ├── modules/
│   │   ├── auth/                 # Authentication (login, logout, session)
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schemas.ts
│   │   │   └── auth.test.ts
│   │   ├── users/                # User model and profile
│   │   ├── participants/         # Participant management, import
│   │   ├── admins/               # Admin management (super-admin only)
│   │   ├── events/               # Event lifecycle
│   │   ├── rounds/               # Round state machine
│   │   ├── keys/                 # Answer key management
│   │   ├── questions/            # Question management
│   │   ├── tickets/              # Ticket generation and persistence
│   │   │   ├── ticket.routes.ts
│   │   │   ├── ticket.service.ts
│   │   │   ├── ticket.domain.ts  # Pure ticket generation logic
│   │   │   ├── ticket.repository.ts
│   │   │   ├── ticket.schemas.ts
│   │   │   └── ticket.test.ts
│   │   ├── draws/                # Draw engine (random + manual)
│   │   ├── claims/               # Win claim submission
│   │   ├── winners/              # Winner evaluation engine
│   │   ├── live/                 # Live display read-only endpoints
│   │   ├── email/                # Transactional email
│   │   └── audit/                # Audit logging
│   ├── middleware/
│   │   ├── auth.ts               # JWT verification
│   │   ├── roles.ts              # Role-based authorization
│   │   └── rateLimit.ts          # Login rate limiting
│   ├── realtime/
│   │   ├── websocket.ts          # WebSocket server setup
│   │   └── events.ts             # Event type definitions
│   ├── shared/
│   │   ├── errors/               # Standardized error types
│   │   ├── validation/           # Shared Zod utilities
│   │   └── utils/                # Common helpers
│   └── tests/                    # Integration / E2E test helpers
├── drizzle/                      # Drizzle config
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

Each module follows: `routes → service → domain ← repository`.

---

## 6. Frontend Application Structure

```text
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx               # Root component
│   │   ├── router.tsx            # React Router config
│   │   └── providers.tsx         # TanStack Query, Zustand providers
│   ├── assets/                   # Static assets
│   ├── components/
│   │   ├── ui/                   # Button, Input, Modal, Card, Badge, etc.
│   │   ├── feedback/             # Toast, StatusIndicator, LoadingSkeleton
│   │   ├── navigation/           # Sidebar, breadcrumbs
│   │   └── animation/            # GSAP animation wrappers
│   ├── features/
│   │   ├── auth/                 # Login, session management
│   │   ├── participant/          # Lobby, game screen
│   │   ├── ticket/               # TombolaTicket, TombolaCell components
│   │   ├── game/                 # Draw display, question/key reveal
│   │   ├── claims/               # Claim submission, claim status
│   │   ├── admin/                # Admin dashboard, event management
│   │   ├── questions/            # Question & key management UI
│   │   ├── participants/         # Participant management, import
│   │   ├── live-display/         # Host/projector display
│   │   └── winners/              # Winner display, celebration
│   ├── hooks/                    # Shared custom hooks
│   ├── layouts/
│   │   ├── ParticipantLayout.tsx
│   │   ├── AdminLayout.tsx
│   │   └── DisplayLayout.tsx
│   ├── lib/
│   │   ├── api/                  # Typed HTTP client (all fetch calls)
│   │   ├── websocket/            # WebSocket client + reconnection
│   │   ├── auth/                 # Auth token management
│   │   ├── storage/              # LocalStorage helpers
│   │   └── utils/                # Formatting, date, etc.
│   ├── pages/                    # Route-level page components
│   ├── stores/                   # Zustand stores (ephemeral UI state)
│   ├── styles/                   # Global CSS, design tokens
│   ├── types/                    # TypeScript types (mirror backend DTOs)
│   └── main.tsx                  # App entry point
├── public/
├── tests/
├── playwright/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 7. Route Architecture

### Public
```
/login
```

### Participant
```
/participant
/participant/lobby
/participant/game
/participant/ticket
/participant/claims
/participant/results
```

### Admin
```
/admin
/admin/event
/admin/rounds
/admin/questions
/admin/participants
/admin/draw
/admin/claims
/admin/winners
/admin/audit
```

### Super Admin (role-based visibility within Admin routes)
```
/admin/settings
/admin/administrators
/admin/event/configuration
```

### Live Display
```
/display
/display/round
/display/winner
```

---

## 8. Database Schema (Core Entities)

```text
User
ParticipantProfile
AdminProfile
Event
Round
Key
Question
Ticket
TicketCell
TicketMark
Draw
WinningPattern
WinClaim
Winner
AuditLog
Session
EmailJob
IdempotencyRecord
```

### Key indexes (minimum)

```text
users.email                 (unique)
participants.user_id        (unique per event)
tickets.participant_id
tickets.round_id
ticket_cells.ticket_id
ticket_cells.key_id
questions.round_id
questions.key_id
draws.round_id
draws.question_id           (unique per round)
draws.sequence_number
claims.round_id
claims.participant_id
claims.status
winners.round_id
audit_logs.actor_id
audit_logs.created_at
```

### Transaction requirements

Transactions are **mandatory** for:

| Operation | Transaction scope |
|---|---|
| Draw creation | Lock/check question → create draw → update round state → commit → broadcast |
| Winner verification | Lock claim/pattern → verify eligibility → verify pattern capacity → create winner → close pattern if required → commit |
| Ticket generation | Generate → validate → persist ticket + cells → commit |
| Participant import | Validate row → create user/profile + hash credential → commit per participant → send credential from memory → record delivery metadata |
| Idempotent command | Reserve actor/operation/key → execute mutation → store replayable safe outcome → commit |

---

## 9. State Machines

### Event status
```
DRAFT → READY → LIVE → COMPLETED
                 ↓
              PAUSED → LIVE
                 ↓
             CANCELLED
```

### Round status
```
DRAFT → READY → ACTIVE → COMPLETED
                  ↓ ↑
               PAUSED
                  ↓
         RECOVERY_REQUIRED → ACTIVE
```

Invalid transitions MUST return an error. For example: `COMPLETED → ACTIVE` is rejected.

Only one round may be `ACTIVE` across the deployment. A Round may become
`READY` only after enabled Patterns, at least 15 eligible Question/Key
pairs, and immutable Tickets for all active Participants exist. Starting
the first Round promotes its `READY` Event to `LIVE` transactionally.

### Claim status
```
SUBMITTED → PENDING_VERIFICATION → VERIFIED
                                 → REJECTED
                                 → REJECTED_PATTERN_ALREADY_CLOSED
```

### Winning pattern status
```
OPEN → CLOSED
```

---

## 10. WebSocket Protocol

### Authenticated connection flow
```text
Participant/Admin connects with the HTTP-only browser session cookie
  ↓
Server validates JWT and active Session
  ↓
Client subscribed to round events
  ↓
Server pushes events as game progresses
```

The Live Display connects through a separate public, read-only channel.
That channel receives only explicitly allowlisted public events. Neither
channel accepts game-state mutations from client frames.

### Event types

| Event | Payload | Sent to |
|---|---|---|
| `ROUND_STARTED` | roundId, status | All connected clients |
| `ROUND_PAUSED` | roundId | All connected clients |
| `ROUND_RESUMED` | roundId | All connected clients |
| `DRAW_CREATED` | roundId, sequence, key, question, drawnAt | All connected clients |
| `WIN_CLAIM_CREATED` | claimId, participantName, pattern | Admin clients |
| `WINNER_VERIFIED` | winnerId, participantName, pattern | All connected clients |
| `ROUND_COMPLETED` | roundId | All connected clients |
| `ANNOUNCEMENT` | message | All connected clients |

### Client reconnection

```text
Connection lost → show "Reconnecting..." → exponential backoff
  → reconnect → fetch authoritative state via REST → replace stale state → resume
```

WebSocket = fast updates. REST API = authoritative recovery. Database = source of truth.

---

## 11. API Error Contract

All API errors follow a consistent format:

```json
{
  "error": {
    "code": "QUESTION_ALREADY_DRAWN",
    "message": "This question has already been drawn."
  },
  "requestId": "req_abc123"
}
```

### HTTP status conventions

| Status | Use case |
|---|---|
| `200` | Successful read |
| `201` | Resource created (draw, claim, participant) |
| `204` | Successful delete/update with no body |
| `400` | Invalid request shape (Zod validation failure) |
| `401` | Unauthenticated |
| `403` | Unauthorized (wrong role) |
| `404` | Resource not found |
| `409` | Conflict (duplicate draw, pattern already closed) |
| `422` | Unprocessable (invalid mark for undrawn key) |
| `429` | Rate limited (login attempts) |
| `500` | Internal server error |

Never expose stack traces or database errors to clients.

---

## 12. Security Requirements

### Authentication
- Argon2id password hashing — plaintext passwords NEVER stored
- Signed JWT in an HTTP-only secure cookie, with `jti` bound to an active database Session
- Protected HTTP and WebSocket requests validate both JWT and Session; logout revokes the Session immediately
- Session cookies use `SameSite` and Origin checks appropriate to browser mutation requests
- Login rate limiting + account lockout/throttling
- Session expiration with graceful re-authentication

### Authorization
Every protected endpoint verifies:
1. Authentication (valid token/session)
2. Role (Participant / Admin / Super Admin)
3. Resource ownership (participant can only access own ticket)
4. Event/round scope

### Data isolation
A participant must NEVER access:
- Another participant's ticket, claims, or account
- Admin endpoints
- Unpublished questions or undrawn keys
- Internal answer metadata

### Input validation
- All request bodies, query parameters, and path parameters validated with Zod
- Parameterized queries only (no string interpolation in SQL)
- No secrets in source code — use environment variables

---

## 13. Testing Strategy

### Backend test layers

| Layer | Test type | Dependencies | What to test |
|---|---|---|---|
| Domain | Pure unit test | None | Ticket generation, draw validation, winner evaluation, state machines |
| Service | Unit test with mocks | Mock repository, mock email | Use-case orchestration, error paths |
| Routes | Integration test | Supertest + test DB | HTTP contracts, auth, validation |
| Database | Transaction test | Test DB | Concurrent draws, winner race conditions |
| Security | Auth test | Test DB | Role enforcement, data isolation, session handling |

### Frontend test layers

| Layer | Test type | Dependencies | What to test |
|---|---|---|---|
| Components | React Testing Library | Mock data | Rendering, state transitions, user interactions |
| Hooks | renderHook | Mock API | Data fetching, WebSocket event handling |
| Features | Integration test | Mock API + mock WebSocket | Login → ticket → mark → claim flow |
| E2E | Playwright | Running backend | Full participant → admin → display flow |

### Game-critical test scenarios (mandatory)

```text
# Ticket generation
- Valid 3×9 layout, exactly 15 cells, 5 per row
- No duplicate keys within a ticket
- Insufficient key pool rejection

# Draw engine
- Random draw creates single draw
- Same question cannot be drawn twice
- Draw rejected when round inactive
- Concurrent draw requests produce only one draw
- Sequence numbers remain continuous

# Winner evaluation
- Each pattern type detected correctly (Early 5, Top/Middle/Bottom Line, Full House)
- Incomplete ticket rejected
- Eligibility recalculated from Ticket + official Draws + Pattern; Mark state ignored
- Second claim rejected after pattern closed

# Authentication
- Valid login, invalid password, inactive account
- Participant accessing another's ticket → 403
- Admin vs Super Admin permissions
- Expired session handling
```

---

## 14. Performance Requirements

### API latency targets (400–500 users)

| Metric | Target |
|---|---|
| p50 read | < 200ms |
| p95 read | < 500ms |
| p99 read | < 1s |
| Draw propagation (WebSocket) | < 1s after commit |

### Frontend performance targets (mid-range mobile)

| Metric | Target |
|---|---|
| First meaningful UI | < 2.5s |
| Interactive | < 3s |
| Ticket interaction | Visually immediate |
| Draw event rendering | < 300ms after receipt |

### Idempotency
Critical operations MUST be safe against accidental duplicate requests:
- Draw creation
- Winner verification
- Round start/resume
- Participant import
- Ticket generation

These commands require an `Idempotency-Key`. Results are scoped by
authenticated actor and operation, persisted transactionally, and replayed
for matching retries. Different keys are independent commands.

---

## 15. Deployment Architecture

```text
                     Internet
                        │
                        ▼
                 Frontend CDN
              React Static Build
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
      REST API                   WebSocket
          │                           │
          └─────────────┬─────────────┘
                        ▼
                  Bun / Fastify
                        │
                        ▼
                    PostgreSQL
```

- Single Bun process (no clustering for MVP)
- PostgreSQL single instance (no Multi-AZ for MVP)
- Static frontend on CDN
- ~$100 AWS budget target
- Health endpoints: `GET /health`, `GET /ready`

---

## 16. Environment Configuration

### Backend
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=...
SESSION_SECRET=...
EMAIL_PROVIDER_API_KEY=...
EMAIL_FROM=...
APP_URL=https://...
CORS_ORIGIN=https://...
LOG_LEVEL=info
```

### Frontend
```
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://api.example.com
VITE_APP_NAME=Tech Tombola
VITE_APP_ENV=production
```

**No secrets in `VITE_*` variables** — anything exposed to the browser is public.

---

## 17. Audit Logging

Minimum audited events:

```text
LOGIN_SUCCESS / LOGIN_FAILED
PARTICIPANT_CREATED / PARTICIPANT_IMPORTED
TICKET_GENERATED
QUESTION_CREATED / QUESTION_UPDATED
KEY_CREATED
ROUND_STARTED / ROUND_PAUSED / ROUND_RESUMED / ROUND_COMPLETED
DRAW_CREATED / MANUAL_DRAW_CREATED
MARK_CREATED / MARK_REMOVED
WIN_CLAIM_CREATED / WIN_CLAIM_REJECTED
WIN_VERIFIED
RECOVERY_STARTED / RECOVERY_COMPLETED
```

Each record includes: actor, action, resource, timestamp, relevant metadata, IP/user-agent where appropriate.

---

## 18. GSAP Animation Rules

GSAP is used for **purposeful game event animations**, not general UI decoration.

### High-value animations
| Event | Animation |
|---|---|
| Question reveal | Fade + slight vertical movement |
| Key reveal | Scale + opacity + highlight |
| Matching cell | Pulse / glow |
| Mark confirmation | Short confirmation transition |
| Winner | Controlled celebration |

### Rules
- Keep interactions fast — no long blocking transitions
- Respect `@media (prefers-reduced-motion: reduce)`
- Use transforms/opacity for performance
- Animations must NEVER block ticket interaction
- Do not animate every DOM element

---

## 19. Deep-Module Design (Codebase Design Vocabulary)

Apply deep-module thinking to the Bun + React layers:

| Seam | Deep module target | Shallow smell |
|---|---|---|
| Bun `domain` | Pure functions hiding game rules (draw, win, ticket) | Logic leaked into route handler or repository |
| Bun `service` | Use-case orchestration behind small methods | Route handler calling repository directly |
| Bun `repository` | Persistence behind narrow store interface | SQL strings in service layer |
| React `lib/api` | HTTP client hiding endpoint details | `fetch` in every component |
| React `hooks` | Data + UI state behind one hook per feature | 200-line components mixing fetch and render |
| React `lib/websocket` | Connection + event handling behind subscription API | Raw WebSocket in every component |

**SOLID + YAGNI**: deepen existing modules before adding new packages. Run `/grill-me` before moving a seam.

---

## 20. Authorization Matrix

| Capability | Participant | Admin | Super Admin |
|---|---|---|---|
| View own ticket | ✓ | — | — |
| Mark own ticket | ✓ | — | — |
| Claim win | ✓ | — | — |
| Manage participants | — | ✓ | ✓ |
| Manage questions/keys | — | ✓ | ✓ |
| Manage rounds | — | ✓ | ✓ |
| Draw question | — | ✓ | ✓ |
| Verify winner | — | ✓ | ✓ |
| View audit logs | — | ✓ | ✓ |
| Manage admins | — | — | ✓ |
| System recovery | — | Limited | ✓ |

---

## 21. Engineering Principles

1. **Tombola first, technology second.** Reliability beats architectural elegance.
2. **Backend is source of truth.** Browser displays; server decides.
3. **Question ≠ quiz.** Participants mark keys, they don't answer questions.
4. **WebSocket provides live updates; REST provides recovery.**
5. **Mobile participant UX has the highest priority.**
6. **Deliberately boring.** No Redis, no Kafka, no microservices until load testing proves otherwise.
7. **Persistent state must survive refresh, reconnect, and server restart.**
8. **Admin controls must be operationally safe** — confirmation dialogs, idempotent actions, no accidental double-draws.
9. **Accessibility and performance are requirements, not polish.**
10. **The frontend must never expose hidden/future game information.**
