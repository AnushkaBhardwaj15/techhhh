# Agent Instructions — Tech Tombola

Instructions for AI agents working in this repository.

## Project context

- **Product:** Tech Tombola — technology-themed digital Tombola game for ~500 participants (see `docs/TECH_TOMBOLA_BACKEND_PRD.md` and `docs/TECH_TOMBOLA_FRONTEND_PRD.md`)
- **Backend:** Bun + TypeScript + Fastify server application (`backend/`)
- **Frontend:** React + TypeScript + Vite + GSAP web application (`frontend/`)
- **Database:** PostgreSQL
- **Real-time:** WebSocket (no Redis, no Socket.IO)
- **Architecture:** Modular monolith — routes → service → domain ← repository (see `docs/ARCHITECTURE_CODING_STANDARDS.md`)

## Critical product rule

> Tech Tombola is **not a quiz**. A question is a clue. Its answer (the "key") is revealed by the game engine. Participants find that key on their ticket and manually mark it. Participants do **not** submit answers to questions.

## Non-negotiable coding standards

These rules apply to **every** implementation task. Cursor loads them from `.cursor/rules/`; treat them as hard requirements even when using other tools.

### 1. Architecture — Bun + React layer boundaries

See `docs/ARCHITECTURE_CODING_STANDARDS.md`, `.cursor/rules/bun-backend.mdc`, `.cursor/rules/react-frontend.mdc`.

- **Bun/Fastify:** routes → service → domain ← repository. Game logic in `domain` modules only. No game-state mutations in route handlers.
- **React:** features/hooks/components/lib/api/types. No game-state calculations in the browser. All HTTP via `src/lib/api/`.
- **WebSocket:** server pushes events; client consumes. Client never determines draw validity, mark validity, or win eligibility.
- **Game authority:** The backend is the **source of truth** for all game-critical state — draws, marks, tickets, wins. The browser displays and requests actions but never decides their validity.

### 2. YAGNI and DRY — no over-abstraction

See `.cursor/rules/yagni-dry.mdc`.

- Build only what the current task requires.
- No speculative interfaces, base classes, plugin systems, or extra layers.
- Extract shared code only when the same **behavior** is genuinely duplicated.
- No Redis, Kafka, microservices, or event-sourcing until real load testing proves they are necessary.

### 3. SOLID — pragmatic, not ceremonial

See `.cursor/rules/solid-principles.mdc`.

- Single responsibility per layer and module.
- Interfaces only at real IO boundaries (database, email provider, WebSocket transport) — one implementation → concrete type.
- When SOLID and YAGNI conflict, YAGNI wins until a second use case appears.

### 4. Mandatory unit tests with full scenario coverage

See `.cursor/rules/mandatory-unit-tests.mdc`.

- Every dev task ships with unit tests in the same change.
- List all scenarios first; write a test for each (happy path, invalid input, boundaries, errors, domain edges).
- Domain/service tests: pure TypeScript, mock repository/IO. React tests: mock `lib/api/`, test user-visible behavior.
- Game-critical scenario categories: duplicate draws, concurrent claims, invalid marks, ticket immutability, race conditions, state-machine transitions.
- Task is incomplete until tests pass.

### 5. Mandatory `/grill-me` before planning or building

See `.cursor/rules/grill-me-mandatory.mdc`.

- **Never assume requirements.** Run `/grill-me` before specs, architecture changes, new API contracts, ticket breakdown, or code.
- Grill architecture topics: layer placement, API errors, game edge cases (duplicate draws, concurrent winners, ticket immutability), React vs Bun responsibilities, test seams.
- Use `/grill-with-docs` when grilling should also update `CONTEXT.md` and `docs/adr/`.
- Grilling is complete only when the frontier is empty and the user confirms shared understanding.

## Domain vocabulary

Precise terms prevent bugs. Use these consistently in code, tests, and conversation. The authoritative ubiquitous language and terms to avoid are documented in [`CONTEXT.md`](./CONTEXT.md).

| Term | Meaning |
|---|---|
| **Event** | A complete Tech Tombola occurrence (e.g. "Tech Tombola 2026") |
| **Round** | One traditional Tombola game within an event |
| **Key** | The answer value on a ticket cell (e.g. `RUSSIA`, `DOCKER`) |
| **Question** | The clue/prompt whose answer is a key |
| **Draw** | The act of revealing a question+key pair during a round |
| **Ticket** | A participant's 3×9 Tombola card with 15 populated cells |
| **Cell** | One slot in a ticket (populated with a key, or empty) |
| **Mark** | A participant's action of tapping a matching cell after a draw |
| **Claim** | A participant's assertion that they've completed a winning pattern |
| **Pattern** | A winning configuration (Early 5, Top Line, Middle Line, Bottom Line, Full House) |
| **Participant** | A player with a ticket |
| **Admin** | Operational event staff |
| **Super Admin** | Higher-privilege administrator who can manage other admins |

## Engineering Execution Workflow

### 1. Requirement-Driven Implementation
Every implementation task MUST originate from an explicit requirement in the applicable PRD.
- Identify the relevant PRD requirement (Functional or Non-Functional) from `docs/TECH_TOMBOLA_BACKEND_PRD.md` or `docs/TECH_TOMBOLA_FRONTEND_PRD.md`.
- Understand the requirement completely before coding. Read all details, business rules, acceptance criteria, and test expectations.
- Never invent missing business requirements.
- Use the project's existing `/grill-me` workflow when clarification or requirement refinement is needed.
- The PRDs define *WHAT* needs to be built. `AGENTS.md` defines *HOW* it must be executed. Do not duplicate PRD responsibilities in this file.

### 2. FE / BE Task Breakdown
For every task, explicitly break the work down into:
- **Backend**: domain logic, API routes, validation (Zod), persistence (Drizzle/SQL), business rules, WebSocket events, backend tests.
- **Frontend**: UI/client behavior, API integration, WebSocket event handling, loading/error states, GSAP animations, frontend tests.

**Important**: Respect project boundaries.
- Bun owns game logic, draw engine, winner evaluation, mark validation, ticket generation.
- React owns presentation, animation, and user interaction.
- Game calculations MUST NOT be reimplemented in the frontend; consume backend contracts instead.
- The client never determines whether a draw, mark, ticket, or win is valid.

### 3. Architecture and Coding Guidelines
Before generating code, identify and apply all relevant architecture and coding guidelines (see *Non-negotiable coding standards* above).
- Existing architecture and coding rules remain authoritative. Do not replace or weaken them.
- Follow strict layer boundaries, server-authoritative game state, YAGNI, DRY, and SOLID.
- Do not invent new architecture when an existing project rule already covers the task.

### 4. Mandatory Feature Branch Workflow
Every implementation task MUST be performed on a dedicated feature branch.
- **Synchronize first**: You MUST synchronize with the latest remote `main` before branching (`git fetch origin`, `git checkout main`, `git pull --ff-only origin main`). Do not assume local `main` is current.
- **Branch naming**: `feature/tombola_<requirement-slug>` (e.g., `feature/tombola_ticket_generation`, `feature/tombola_draw_engine`). Use lowercase snake_case. Do NOT use arbitrary branch names.
- Every independent requirement should have its own feature branch.

### 5. Mandatory Tests and Build Gates
- Unit tests MUST be created as part of implementation. Do NOT treat tests as optional follow-up work.
- Cover applicable scenarios: happy paths, invalid input, boundaries, error handling, game rules, security, concurrency/race conditions, state machine transitions.
- **Completion Gate**: A task is NOT complete merely because code was generated. BUILD PASS + REQUIRED TESTS PASS = mandatory completion gate.
- If the build fails or required tests fail/are missing, fix them before delivery. Never hide, skip, or disable tests.

#### 5.1 Backend testing gate
- Every Bun/TypeScript change ships with tests per the layer rules in `docs/ARCHITECTURE_CODING_STANDARDS.md`.
- Domain modules: pure unit tests, no external deps.
- Service modules: mock repository and IO boundaries.
- Route/integration tests: test HTTP contracts with supertest or equivalent.
- `bun test` must pass locally before PR.

#### 5.2 Frontend testing gate (git hooks)
Installed under `frontend/.husky/` and wired via `git config core.hooksPath frontend/.husky` (auto-configured by `bun install` in `frontend/`):

- **`pre-commit`** — runs `lint-staged`:
  - `scripts/check-adjacent-test.sh` warns (advisory) if a staged `frontend/src/**/*.{ts,tsx}` file has no adjacent `*.test.{ts,tsx}`.
  - `vitest related --run` runs the tests relevant to staged files.
- **`pre-push`** — runs `bun test --coverage` (or `npm test -- --coverage`) for the full frontend suite. Coverage thresholds (advisory): **lines 80 / functions 80 / branches 75 / statements 80** (see `frontend/vite.config.ts`).

Hooks are **advisory** — a `--no-verify` bypass exists — but the completion gate above still applies. Do not push failing tests.

### 6. Delivery, Testing, and PR Requirements
- **Feature Branch Isolation**: Commit changes ONLY to the dedicated feature branch (`feature/tombola_<slug>`), never directly to `main`.
- **Feature Branch Preservation**: The feature branch MUST NOT be deleted after merging. Keep all feature branches intact both locally and on GitHub.
- **Pull Request**: Create a PR targeting `main`. The PR must summarize the requirement, backend/frontend work, tests created/executed, and build results.
- **Explicit User Approval Gate**: The AI agent MUST NOT merge the PR or push feature changes to `main` until:
  1. All automated unit and end-to-end test cases have been executed and passed.
  2. The user has reviewed the test results and given explicit approval to merge into `main`.

### 7. Complete AI Implementation Workflow (The 16 Steps)

**STEP 1 — Understand**: Read the applicable PRD requirement completely (scope, business rules, criteria, tests).
**STEP 2 — Analyze**: Break the task into Backend, Frontend, API/data contract, WebSocket events, and tests.
**STEP 3 — Architecture**: Read and apply all applicable architecture/coding guidelines.
**STEP 4 — Clarify**: If ambiguous, use `/grill-me`. Ask for clarification, do not guess.
**STEP 5 — Synchronize Main**: Fetch remote changes and sync local `main` with `origin/main`.
**STEP 6 — Create Branch**: Create `feature/tombola_<requirement-slug>` from the latest `main`.
**STEP 7 — Implement**: Implement the smallest appropriate vertical slice (YAGNI/DRY/SOLID) purely on the feature branch.
**STEP 8 — Test**: Create applicable unit tests as part of implementation (list scenarios first). Add integration tests where required.
**STEP 9 — Validate**: Run required unit tests (`bun test` for backend and frontend), builds, and linting. Fix failures.
**STEP 10 — Review**: Run the project's `/code-review` process against PRD, NFRs, architecture, and tests before merge.
**STEP 11 — Commit**: Commit the completed changes to the feature branch.
**STEP 12 — Push**: Push the feature branch to `origin`.
**STEP 13 — PR**: Create PR targeting `main`.
**STEP 14 — User Testing & Approval Gate**: Present the comprehensive test execution results to the user and wait for explicit approval before merging.
**STEP 15 — Merge to Main**: Once user approval is granted, merge the PR into `main` without deleting the feature branch.
**STEP 16 — Confirmation & Sync**: Synchronize local `main` with `origin/main` and confirm completion.

Use `/tdd` when test-first fits the task. Use `/implement` for spec-driven work — it inherits all standards above.

## Agent skills

Project skills live in `.agents/skills/`. All dev skills enforce the standards in this file.

### Skill configuration & conventions

- **Issue tracker:** GitHub issues on `saransh-sh/TechTombola-muacm`. See [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).
- **Triage labels:** Canonical triage role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, etc.). See [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).
- **Domain docs:** Single-context repository (`CONTEXT.md` at root, ADRs in `docs/adr/`). See [`docs/agents/domain.md`](./docs/agents/domain.md).

### Core engineering & workflow skills

| Skill | Use when |
|---|---|
| `ask-saransh` | **Universal AI Skill Router.** Analyzes intent, discovers skills, resolves dependencies, and orchestrates execution |
| `grill-me` | **Required gate.** Stress-test requirements and architecture before spec or code |
| `grill-with-docs` | Grill + update `CONTEXT.md` and ADRs inline |
| `implement` | Implement from spec/ticket (Bun + React layers, tests, YAGNI/DRY/SOLID) |
| `tdd` | Test-first at agreed seams |
| `code-review` | Review against standards + spec |
| `to-spec` | Publish feature spec (after grilling) |
| `to-tickets` | Break spec into vertical slices (after grilling) |
| `codebase-design` | Module depth, seams, interfaces |
| `domain-modeling` | Domain terms, ADRs, ubiquitous language |
| `diagnosing-bugs` | Debugging failures or regressions |
| `improve-codebase-architecture` | Scan for deepening opportunities, present HTML report, and grill refactors |
| `prototype` | Throwaway code to answer design questions |
| `research` | Background reading with cited Markdown output |
| `triage` | Move issues and PRs through triage state machine |
| `wayfinder` | Chart and navigate decision maps for large efforts |
| `wait-what` | Re-pitch unclear concept in plain English using `CONTEXT.md` vocabulary |
| `loop-me` | Autonomous Ralph loop driving test-driven progress |
| `migrate-to-shoehorn` | Migrate test assertions to shoehorn |
| `wizard` | Interactive bash scripts for human-only steps (AWS setup, secrets, CI) |
| `resolving-merge-conflicts` | Resolve in-progress merge/rebase conflicts |
| `setup-pre-commit` | Configure Husky pre-commit hooks and lint-staged |
| `setup-ts-deep-modules` | Wire dependency-cruiser for boundary enforcement |
| `writing-for-agents` | Reference for writing skills, AGENTS.md, or agent docs |
| `git-guardrails-claude-code` | Prevent destructive git operations |

### Design & Frontend Skills

| Skill | Use when |
|---|---|
| `saransh_custom_antislop` | **Mandatory quality gate.** Runs Anti-Slop Pass before UI completion; eliminates tropes without swap-slop |
| `design-taste-frontend` | Anti-slop frontend styling, inferred design direction, GSAP motion, and layout variance |
| `gpt-taste` | Strict layout variance, aggressive anti-slop, and advanced GSAP motion directions |
| `image-to-code` | Image-first pipeline: analyze reference designs and implement matching frontend |
| `redesign-existing-projects` | Audit existing UI, eliminate generic AI patterns, and upgrade hierarchy/layout |
| `high-end-visual-design` | Studio-grade aesthetics, typography palettes, generous whitespace, spring physics |
| `minimalist-ui` | Editorial/Linear product aesthetic, monochrome palettes, crisp bento layouts |
| `industrial-brutalist-ui` | Swiss typographic grid, terminal styling, declassified/raw mechanical aesthetics |
| `stitch-design-taste` | Google Stitch-compatible semantic design rules and `DESIGN.md` exports |
| `full-output-enforcement` | Enforce full, unabridged code output without placeholders |
| `imagegen-frontend-web` | Generate section-by-section website visual references and comps |
| `imagegen-frontend-mobile` | Generate mobile app screen flows and mockup references |
| `brandkit` | Generate brand identity boards, logo explorations, and color direction |

## API contract summary

All public APIs live under `/api/v1/`. See `docs/TECH_TOMBOLA_BACKEND_PRD.md` §35–38 for the complete surface.

### Participant endpoints
```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/participant/event
GET    /api/v1/participant/round/current
GET    /api/v1/participant/ticket
GET    /api/v1/participant/draws
POST   /api/v1/participant/tickets/:ticketId/marks
DELETE /api/v1/participant/tickets/:ticketId/marks/:cellId
POST   /api/v1/participant/claims
GET    /api/v1/participant/claims
GET    /api/v1/participant/wins
```

### Admin endpoints
```
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/participants
POST   /api/v1/admin/participants
POST   /api/v1/admin/participants/import
GET    /api/v1/admin/participants/:id
PATCH  /api/v1/admin/participants/:id
GET    /api/v1/admin/keys
POST   /api/v1/admin/keys
PATCH  /api/v1/admin/keys/:id
GET    /api/v1/admin/questions
POST   /api/v1/admin/questions
PATCH  /api/v1/admin/questions/:id
DELETE /api/v1/admin/questions/:id
GET    /api/v1/admin/events
POST   /api/v1/admin/events
PATCH  /api/v1/admin/events/:id
GET    /api/v1/admin/rounds
POST   /api/v1/admin/rounds
PATCH  /api/v1/admin/rounds/:id
POST   /api/v1/admin/rounds/:id/start
POST   /api/v1/admin/rounds/:id/pause
POST   /api/v1/admin/rounds/:id/resume
POST   /api/v1/admin/rounds/:id/recover
POST   /api/v1/admin/rounds/:id/draws
POST   /api/v1/admin/rounds/:id/draws/manual
GET    /api/v1/admin/rounds/:id/draws
GET    /api/v1/admin/claims
POST   /api/v1/admin/claims/:id/verify
POST   /api/v1/admin/claims/:id/reject
GET    /api/v1/admin/winners
GET    /api/v1/admin/audit
```

### Super Admin endpoints
```
GET    /api/v1/super-admin/admins
POST   /api/v1/super-admin/admins
PATCH  /api/v1/super-admin/admins/:id
DELETE /api/v1/super-admin/admins/:id
GET    /api/v1/super-admin/system
POST   /api/v1/super-admin/recovery/*
```

### Live Display endpoints (read-only)
```
GET    /api/v1/live/event
GET    /api/v1/live/round
GET    /api/v1/live/draws
GET    /api/v1/live/winners
```

### WebSocket events
```
ROUND_STARTED
ROUND_PAUSED
ROUND_RESUMED
DRAW_CREATED
WIN_CLAIM_CREATED
WINNER_VERIFIED
ROUND_COMPLETED
ANNOUNCEMENT
```

## Critical game invariants

These rules must **never** be violated. Test each explicitly.

1. A participant can have only the ticket assigned to them for a round.
2. A ticket cannot contain duplicate keys.
3. A ticket has exactly 15 populated cells (3 rows × 5 per row).
4. A question cannot be drawn twice in one round.
5. A participant cannot mark an undrawn key.
6. A participant cannot claim a win without server-side eligibility.
7. A closed winning pattern cannot receive a new winner.
8. A completed round cannot silently resume.
9. Historical draws and winners are immutable.
10. Participants cannot access another participant's data.
11. Future answer keys must not be exposed to participants.
12. Plaintext passwords must never be persisted.
