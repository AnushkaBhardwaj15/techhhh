---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Run a `/grilling` session, using the `/domain-modeling` skill.

Follow the Tech Tombola mandatory grilling topics in `/grill-me` (layers, game rules & invariants, API & WebSocket contracts, authority & presentation, tests, YAGNI/SOLID).

Update as decisions land:

- `CONTEXT.md` — domain terms (no implementation detail)
- `docs/adr/` — irreversible architectural decisions
- `docs/ARCHITECTURE_CODING_STANDARDS.md` — when layer or stack rules change
