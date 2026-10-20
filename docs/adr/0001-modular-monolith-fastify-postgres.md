# 0001. Modular Monolith with Fastify and PostgreSQL

## Context
Tech Tombola is designed for live events with 400–500 simultaneous participants. We evaluated microservices versus a modular monolith. Given the team size, operational simplicity, and low latency requirements during live rounds, distributed network hops and eventual consistency would add unacceptable failure modes.

## Decision
We chose a **Modular Monolith** architecture with Bun, Fastify, TypeScript, and PostgreSQL. The application is strictly partitioned into four layers:
`routes` → `service` → `domain` ← `repository`.
All game logic lives in pure TypeScript `domain` functions. Route handlers perform Zod validation and delegate to services. Services orchestrate use-cases and database transactions.

## Consequences
- High developer velocity and single-command local setup.
- Strict isolation of pure game logic makes unit testing fast and exhaustive without mocks.
- Vertical scaling and connection pooling on PostgreSQL easily handle 500 concurrent participants without microservice overhead.
