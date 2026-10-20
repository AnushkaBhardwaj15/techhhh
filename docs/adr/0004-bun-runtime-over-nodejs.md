# 0004. Bun Runtime over Node.js

## Context
Tech Tombola requires ultra-low latency, instant local startup, native TypeScript execution, and high-throughput I/O to handle 400–500 concurrent live participants during live Tombola rounds. We evaluated Node.js LTS against Bun for the server runtime, package management, and test runner.

## Decision
We chose **Bun** as the primary backend runtime, package manager, and test execution engine instead of Node.js. Fastify, Drizzle ORM, Zod, and PostgreSQL run on top of Bun.

## Consequences
- **Native TypeScript Execution:** Direct execution of `.ts` files without separate transpile-only loaders (`tsx` or `ts-node`), speeding up development and deployment startup times.
- **Fast Test Execution:** `bun test` provides native speed for running pure unit tests and integration tests with minimal overhead.
- **Node.js Compatibility:** Fastify and Node ecosystem packages (such as PostgreSQL clients and crypto modules) run seamlessly with Bun's Node compatibility layer.
- **Unified Tooling:** Single runtime toolchain for running, installing packages, and testing (`bun run`, `bun install`, `bun test`).
