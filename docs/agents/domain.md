# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — defines the ubiquitous domain language and terms to avoid.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-modular-monolith-fastify-postgres.md
│       ├── 0002-native-websockets-over-redis.md
│       ├── 0003-server-authoritative-game-engine.md
│       └── 0004-bun-runtime-over-nodejs.md
└── (backend/ & frontend/)
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (e.g. use **Key** not "Answer", use **Question** not "Clue", use **Ticket** not "Card", use **Participant** not "Player").

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (native websockets over redis) — but worth reopening because…_
