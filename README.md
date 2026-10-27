# Tech Tombola 🎟️⚡

> A technology-themed, real-time digital Tombola (Housie/Bingo) engine engineered for live events of 400–500 simultaneous participants.

[![Bun](https://img.shields.io/badge/Bun-1.x-fbf0df?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?style=flat&logo=fastify&logoColor=white)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18.x-61dafb?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646cff?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169e1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![WebSocket](https://img.shields.io/badge/Real--time-WebSocket-010101?style=flat&logo=websocket&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

---

## 📌 Overview

**Tech Tombola** transforms traditional Tombola into an interactive, digital, tech-centric competition. Built with a modular monolith architecture, it is purpose-built to deliver low-latency real-time state synchronization, verifiable ticket generation, and automated win eligibility checks within tight infrastructure budgets.

### ⚠️ The Golden Rule: Tech Tombola is NOT a Quiz

> **A question is simply a clue.** Its corresponding answer (**the "key"**) is officially revealed by the game engine. Participants find that key on their ticket and manually mark it. **Participants do NOT submit answers to questions.**

```
       [ Question / Clue ]
                │
                ▼
      [ Predefined Key (Answer) ]
                │
                ▼
  [ Revealed by Game Engine (Draw) ]
                │
                ▼
 [ Participant finds Key on Ticket ]
                │
                ▼
    [ Participant Marks Cell ]
                │
                ▼
 [ Server Evaluates Winning Pattern ]
```

*Example:*  
- **Clue/Question:** *"What is the containerization platform symbolized by a blue whale?"*  
- **Key (Answer):** `DOCKER`  
- If `DOCKER` exists on a player's ticket, they can mark that cell once the engine draws it!

---

## 🚀 Key Features

- **📱 Mobile-First Participant App:** Fast, responsive 3×9 Tombola card interface with intuitive tactile cell marking and one-tap claim submissions.
- **🖥️ Live Projector / Host Display:** Public read-only screen displaying active questions, drawn keys, historical draws, and verified winners in real time.
- **🛠️ Admin Command Center:** Comprehensive control over events, rounds, question banks, manual/automated draws, and real-time claim verification.
- **🛡️ Server-Authoritative Game State:** The backend is the single source of truth. Clients cannot falsify ticket marks, draw sequences, or winning claims.
- **⚡ Native Real-Time Protocol:** WebSocket event streaming ensures sub-100ms draw and announcement broadcasts without requiring Redis or complex pub/sub clusters.
- **🔒 Zero-Knowledge Ticket Integrity:** Cryptographically valid ticket distribution preventing duplicate keys per ticket and protecting future draw keys from player discovery.

---

## 🏆 Winning Patterns

Tech Tombola supports the standard traditional winning patterns evaluated in real-time:

| Pattern | Description |
|---|---|
| **Early 5** | First participant(s) to correctly mark any 5 numbers/keys across their entire ticket. |
| **Top Line** | All 5 populated cells in the top row (Row 1) marked. |
| **Middle Line** | All 5 populated cells in the middle row (Row 2) marked. |
| **Bottom Line** | All 5 populated cells in the bottom row (Row 3) marked. |
| **Full House** | All 15 populated cells across the entire 3×9 ticket marked. |

---

## 🏗️ Architecture & Technology Stack

Tech Tombola follows a **Modular Monolith** architecture governed by strict layer boundaries:

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│  React 18 + TypeScript + Vite + GSAP + TanStack Query + Zustand
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP REST & Native WebSocket
┌──────────────────────────────▼──────────────────────────────┐
│                  Backend (Bun + Fastify)                    │
│                                                             │
│   ┌──────────────┐     ┌──────────────┐    ┌────────────┐   │
│   │ Route Layer  │ ──> │ Service Layer│ ──>│   Domain   │   │
│   │(Zod Validate)│     │(Orchestration)│    │(Game Rules)│   │
│   └──────────────┘     └──────┬───────┘    └─────▲──────┘   │
│                               │                  │          │
│                        ┌──────▼───────┐          │          │
│                        │  Repository  │──────────┘          │
│                        │ (Drizzle/SQL)│                     │
│                        └──────┬───────┘                     │
└───────────────────────────────┼─────────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │   PostgreSQL   │
                        └────────────────┘
```

### Layer Responsibilities
- **`routes/`**: Handles HTTP / WebSocket transport, input validation via Zod schemas, and maps HTTP requests to services.
- **`service/`**: Orchestrates application use cases, database transactions, email dispatch, and event broadcasts.
- **`domain/`**: Pure TypeScript business and game logic (ticket layout validation, draw randomness, pattern eligibility). No database or framework dependencies.
- **`repository/`**: Database persistence layer using SQL queries and transactions against PostgreSQL.

### Technology Stack
- **Backend:** Bun (v1.x), TypeScript, Fastify, Drizzle ORM / postgres, Zod
- **Frontend:** React 18, TypeScript, Vite, GSAP micro-animations, TanStack Query, Zustand
- **Real-time:** Native WebSocket (`@fastify/websocket`)
- **Database:** PostgreSQL 16+
- **Testing:** Vitest, Supertest, advisory Git hooks (Husky)

---

## 🔒 Critical Game Invariants

These invariants are enforced server-side and tested at all layer boundaries:

1. **Ticket Uniqueness & Invariance:** A participant has exactly one ticket per round. Tickets consist of 3 rows × 9 columns with exactly 15 populated keys (5 per row) and no duplicate keys.
2. **Draw Uniqueness:** A question/key cannot be drawn more than once within the same round.
3. **Valid Marks Only:** A participant cannot mark a key that has not yet been drawn by the server.
4. **Server-Side Win Eligibility:** A participant cannot claim a pattern without full server-side verification against draw and mark history.
5. **Pattern Closure:** Once a winning pattern's prize slots are filled, the pattern is permanently closed.
6. **Immutable Audit Trail:** Historical draws, marks, and verified wins cannot be rewritten.
7. **Secret Key Concealment:** Undrawn questions and future keys are never transmitted to client devices ahead of time.

---

## 📂 Repository Structure

```text
.
├── .agents/                    # Agent skills, workflows, and developer conventions
├── .cursor/rules/              # Cursor AI architectural rules and standards
│   ├── bun-backend.mdc         # Bun backend layer boundaries and rules
│   ├── react-frontend.mdc      # React frontend guidelines
│   ├── solid-principles.mdc    # Pragmatic SOLID application
│   ├── yagni-dry.mdc           # YAGNI & DRY constraints
│   ├── mandatory-unit-tests.mdc# Unit testing requirements
│   └── grill-me-mandatory.mdc  # Requirement stress-testing protocol
├── docs/                       # Specifications, ADRs, and architecture docs
│   ├── adr/                    # Architecture Decision Records
│   ├── agents/                 # Issue tracking, triage, and domain conventions
│   ├── ARCHITECTURE_CODING_STANDARDS.md  # System standards and API designs
│   ├── TECH_TOMBOLA_BACKEND_PRD.md       # Complete backend specification
│   └── TECH_TOMBOLA_FRONTEND_PRD.md      # Complete frontend specification
├── AGENTS.md                   # Authoritative instructions for AI assistants
├── CONTEXT.md                  # Ubiquitous domain language and terminology glossary
├── .gitignore                  # Git ignore definitions
└── README.md                   # Project overview and documentation
```

---

## 🛠️ API & WebSocket Surface

### Public REST Endpoints (`/api/v1/`)

- **Authentication:** `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/me`
- **Participant:**
  - `GET /api/v1/participant/event`
  - `GET /api/v1/participant/round/current`
  - `GET /api/v1/participant/ticket`
  - `GET /api/v1/participant/draws`
  - `POST /api/v1/participant/tickets/:ticketId/marks`
  - `DELETE /api/v1/participant/tickets/:ticketId/marks/:cellId`
  - `POST /api/v1/participant/claims`
  - `GET /api/v1/participant/claims`
  - `GET /api/v1/participant/wins`
- **Admin & Super Admin:**
  - Game control: `/api/v1/admin/rounds/:id/(start|pause|resume|recover|draws)`
  - Pool & Ticket management: `/api/v1/admin/(participants|keys|questions|events|rounds)`
  - Claims & Verification: `/api/v1/admin/claims/:id/(verify|reject)`, `/api/v1/admin/winners`
- **Live Display:**
  - `GET /api/v1/live/(event|round|draws|winners)`

### Real-Time WebSocket Events
- `ROUND_STARTED`
- `ROUND_PAUSED` / `ROUND_RESUMED`
- `DRAW_CREATED`
- `WIN_CLAIM_CREATED`
- `WINNER_VERIFIED`
- `ROUND_COMPLETED`
- `ANNOUNCEMENT`

---

## 🚀 Running with Bun (Pure Bun Architecture)

Tech Tombola is engineered to run natively with Bun without requiring Docker containers:

```bash
# 1. Backend (Fastify + TypeScript on Bun)
cd backend
bun install
bun run db:migrate   # Applies database migrations
bun run db:seed      # Creates only the initial configured Super Admin
bun run dev          # Starts backend on http://localhost:3000

# 2. Frontend (Vite + React on Bun)
cd ../frontend
bun install
bun run dev          # Starts frontend on http://localhost:5173
```


---

## 🚦 Engineering Execution Workflow

Contributors and AI assistants follow a disciplined 16-step development process outlined in [`AGENTS.md`](./AGENTS.md):
- **Requirement-driven:** Originates from explicit requirements in `docs/TECH_TOMBOLA_*_PRD.md`.
- **Feature Branches:** Built on dedicated branches (`feature/tombola_<slug>`).
- **Mandatory Tests:** Pure unit tests for domain logic, mock repositories for services, and supertest for API endpoints.
- **Test Seams & Review:** Tested with full boundary coverage before merge approval.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).


### Initial authentication setup and participant batches

Set `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (12–128 characters),
`SUPER_ADMIN_NAME`, and `SUPER_ADMIN_BOOTSTRAP_SECRET` (at least 32 characters)
in the backend environment, then run `bun run db:migrate` and `bun run db:seed`
from `backend/`. The seed creates one Super Admin, never resets existing
credentials, and creates no demo participants, administrators, or game data.

The Super Admin signs in with email/password and creates administrators from
Administrator management. Both roles can import participants from Participant
management: select an Event, choose CSV/Excel, and enter a batch name. Required
columns are `email,password`; `name,external_id` are optional. Passwords must
contain 8–128 characters. Use plain text cell values in a single Excel sheet.
Both college and personal emails are supported. An Event must exist before
participant enrollment; it can be created from Event management.

Use Participant batches to remove a test group. Groups with tickets are disabled
and sessions revoked, preserving history. Unused groups are permanently deleted;
other groups and Events are preserved. Old installations are not automatically
cleared by the seed.
