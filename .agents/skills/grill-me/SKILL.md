---
name: grill-me
description: A relentless interview to sharpen a plan or design.
disable-model-invocation: true
---

Run a `/grilling` session.

**Tech Tombola mandatory topics** — cover these for any architecture, API, or feature scope (see `docs/ARCHITECTURE_CODING_STANDARDS.md`):

1. **Layer placement** — what belongs in Bun `domain` vs `service` vs `routes` vs React?
2. **Game rules & invariants** — ticket generation/immutability, mark validation, draw uniqueness, concurrent win claims, pattern closure
3. **API & WebSocket contract** — request/response shapes, error codes, idempotency on duplicate requests, broadcast event payloads
4. **Authority & presentation** — what is server-authoritative (Bun) vs pure client presentation (React)?
5. **Test scenarios** — list all unit-test cases before any code is written
6. **YAGNI / SOLID** — challenge any proposed interface, package, or abstraction: is there a second use case?

Do not propose code until the frontier is empty and the user confirms shared understanding.
