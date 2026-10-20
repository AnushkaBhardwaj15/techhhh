# Frontend Contract Gaps and Approved Boundaries

Baseline: read-only inspection of the local backend on 2026-10-17. Code presence is not live API, runtime verification or remote-main availability. Reinspect owning serializers/routes when executing a ticket.

The user approved local tickets and the policy: use existing backend contracts, identify unsupported required details as blockers, and keep game decisions in Bun. No backend extension or PRD requirement removal is authorized by this planning document.

## Resolution protocol

For an unresolved item: inspect the cited existing reads first, define the smallest exact request/response/error/security/test contract needed, use the project's grill/spec gate for business decisions, and create separate backend work if genuinely necessary. Link that deliverable and evidence here and in the affected ticket before changing `needs-info` to `ready-for-agent`. Until then preserve the required acceptance criterion as unchecked.

<a id="g01"></a>
## G01 — Exact winning-cell evidence

**State:** contract resolved and implementation candidate verified locally in `feature/tombola_winner_cell_evidence`; backend issue #20 remains open until the candidate is delivered and integrated. The frontend consumes only backend-selected evidence. Blocks integrated exact-cell acceptance for ticket 07 and downstream release completion.

- Frontend PRD §28 requires highlighting relevant Ticket cells.
- [Winner service](../../backend/src/modules/claims/winner.service.ts) returns winner/participant/Pattern data; [WS schema](../../backend/src/realtime/events.ts) provides winner ID, participant name and Pattern. Neither currently supplies contributing Ticket cell IDs.
- The browser must not reconstruct eligibility or choose an arbitrary five cells for Early 5. The backend selects the five eligible cells whose Keys were drawn earliest by official Draw sequence; line Patterns return the five cells in the winning row and Full House returns all populated cells.
- The same selected IDs are returned through authenticated participant own-wins REST and `WINNER_VERIFIED`. REST is scoped to the authenticated Participant; the event carries no other Participant's Ticket data.
- The candidate adds selector/unit coverage for all five Patterns, Early 5 with more than five drawn keys, and ineligible evidence; service coverage checks REST/event convergence and identity isolation.
- Candidate verification on 2026-10-18: backend package suite 253 passed, typecheck/build passed, and disposable PostgreSQL integration suite 144 passed (967 assertions); frontend 490 tests, typecheck, lint, deployment-config checks, and production build passed. Two-axis review found no remaining findings. Code is not yet committed or in a PR; hosted/main integration remains pending.
- The frontend tolerates absent evidence from older backend snapshots but never infers highlights from it. A display-name match is never proof of the current participant's win.

<a id="g02"></a>
## G02 — Complete Question/Key search, filters and used state

**State:** contract implemented and verified in PR #28 (stacked on PR #27 / `feature/tombola_winner_cell_evidence`). Closes [backend issue #21](https://github.com/saransh-sh/TechTombola-muacm/issues/21).

- Frontend PRD §31 requires search/filter and controls respecting used-data immutability.
- Backend implementation in branch `feature/tombola_question_key_global_search` extends `GET /api/v1/admin/keys` and `GET /api/v1/admin/questions` with optional `search` and `used` parameters.
- Search applies case-insensitive literal substring matching (`strpos`) over the complete Event/Round scope prior to pagination; `used` uses persisted Draw history; `canEdit` aligns with mutation endpoints; responses echo applied filters as `filters: { search, used }`.
- Verification on clean disposable PostgreSQL 17: 253 backend unit tests, 147 backend integration tests (1,000 assertions), typecheck and build passed.
- Frontend implementation in PR #24 consumes the echoed filters, displays server-confirmed usage, and disables locked row edits.
- PR #28 remains unmerged pending integration into the shared baseline.
- Question bulk import is conditional in the PRD ('where supported') and currently has no route. No bulk import is planned. There is no invented Key DELETE.

<a id="g03"></a>
## G03 — Participant Ticket identifier and import status

**State:** partial scope approved: Participant identity and CRUD can proceed; Ticket identifier/import status remain blocked pending a complete contract. Ticket 13 cannot claim full completion yet.

- Frontend PRD §32 asks for Ticket identifier and import status alongside Participant management.
- [Participant DTO](../../backend/src/modules/participants/participant.types.ts) supplies identity/Event/status and emailDeliveryStatus/error, not per-Round Ticket identifier or durable import history.
- [Admin Ticket reads](../../backend/src/modules/tickets/ticket.routes.ts) already list Round Tickets. Evaluate a bounded authorized read/composition before deciding a backend extension is needed. Unloaded joined pages are not proof a Participant has no Ticket.
- Clarify the Round represented by 'Ticket identifier' and distinguish import outcome from credential-delivery status. Immediate CSV report and email-delivery fields do not establish persistent import-job history.
- Needed evidence: agreed scope/read composition or approved backend field contract, permission/pagination/loading scenarios and actual missing-versus-unloaded state tests.
- The Participant PATCH schema does not permit Event reassignment. Display existing assignment and use supported creation, without inventing reassignment controls.

<a id="g04"></a>
## G04 — Announcements

**State:** consumption defined; no admin authoring feature planned.

- [WS events](../../backend/src/realtime/events.ts) include ANNOUNCEMENT, but inspection found no admin producer route.
- Ticket 21 consumes allowed incoming announcements and tests that UI with a safe fixture. It does not claim a production announcement has been sent.
- A new admin composer/producer requires its own product/backend requirement. Verified Winner announcements use the existing WINNER_VERIFIED flow.

<a id="g05"></a>
## G05 — Eligibility, rejection reason and winning identity

**State:** existing-contract presentation approved.

- Frontend PRD §27's available Pattern illustration is not an eligibility API.
- [Round DTO](../../backend/src/modules/rounds/round.types.ts) supplies enabled/configured OPEN/CLOSED Patterns. [Claim service](../../backend/src/modules/claims/claim.service.ts) evaluates eligibility only on submission; Participant Claim responses omit the stored rejection reason.
- Ticket 06 displays Pattern configuration/open state, lets the server validate, and polls/refetches pending Claims for terminal state. There is no participant rejection event.
- Use generic rejected status when the backend supplies no reason; do not infer incomplete Pattern from an admin rejection or exhausted capacity. A truthful 'eligible now' indicator or detailed rejection reason would need explicit server evidence.
- Winner messages contain public display names, not sufficient authenticated own-winner identity. Refetch own wins for that decision.

<a id="g06"></a>
## G06 — Lifecycle, timing and mutation affordances

**State:** existing-contract presentation approved.

- [Round types](../../backend/src/modules/rounds/round.types.ts) include RECOVERY_REQUIRED and CANCELLED, absent from the simplified frontend sample model. All lifecycle states must be represented.
- There is no server Round countdown field. Use actual schedule information only where provided, otherwise show waiting; a timer cannot transition a Round.
- DRAW_CREATED contains both question and key. Their animation sequence is presentation, never hidden server-timed reveal or a marking lock.
- [Realtime routes](../../backend/src/realtime/realtime.routes.ts) and [subscription service](../../backend/src/realtime/subscription.service.ts) limit allowed states. Lobby/terminal clients need REST observation rather than an endless rejected socket loop.
- [Recovery route](../../backend/src/modules/recovery/recovery.routes.ts) is Admin Round recovery; no generic /super-admin/recovery/* implementation was found. Super Admin reuses allowed operations and system reads.
- [Mark routes](../../backend/src/modules/marks/mark.routes.ts) include unmark, but the frontend PRD only requires marking. No extra undo affordance is planned.

<a id="g07"></a>
## G07 — CSV preview and progress

**State:** synchronous-import presentation approved. Per-Participant credential-delivery results are tracked by [backend issue #18](https://github.com/saransh-sh/TechTombola-muacm/issues/18); ticket 14 remains partial until the API returns that evidence.

- Frontend PRD §32 requests preview, validation, confirm, progress and summary.
- [Import route](../../backend/src/modules/participants/participant.routes.ts) and [service](../../backend/src/modules/participants/import/import.service.ts) implement one synchronous upload and final report, with no asynchronous job/dry-run/progress API.
- Ticket 14 provides local syntax/preview, explicit confirmation, indeterminate processing and actual server business-validation/import/delivery results.
- Local preview must not duplicate server account/business validation or promise database checks happened before upload. No invented row percentage, durable import job or automatic retry.
- Server-side preflight validation or durable import progress would require a separately scoped backend contract, not silently added by a frontend agent.

<a id="g08"></a>
## G08 — Credentialed cross-origin mutation preflight

**State:** candidate backend fix is proposed in [PR #26](https://github.com/saransh-sh/TechTombola-muacm/pull/26) for [issue #25](https://github.com/saransh-sh/TechTombola-muacm/issues/25); PR #26 is stacked on an unmerged backend branch and remains unmerged.

- Browser-smoke-tested against isolated backend PR #14 commit `a24d77c309a34f075f539b138b2fae6a1814f179`, not `main` or a hosted environment.
- An OPTIONS preflight for Event `PATCH` returned `204`, allowed origin `http://127.0.0.1:4173`, credentials `true`, methods `GET,HEAD,POST`, and headers `content-type`. The browser blocked the edit because `PATCH` was not allowed.
- The frontend uses `PATCH` and `DELETE` mutations and sends `Idempotency-Key` on some POST operations. Required backend method/header allowlists must match supported routes while retaining exact-origin validation and credentialed cookies.
- A same-origin Vite proxy allowed Event create/edit and persistence checks; this is a local workaround and does not complete cross-origin deployment acceptance.
- Backend `app.inject` integration now passes authenticated Event `PATCH` and Question `PATCH`/`DELETE` with the configured Origin and actual session cookies; it asserts credentialed CORS response headers. Event `PATCH` carries an idempotency header.
- Recheck OPTIONS and browser mutations against the integrated backend, including allowed/disallowed origins, cookies, `PATCH`, `DELETE`, and idempotency headers. Do not mark ticket 10 or release integration complete until the configured-origin browser path passes against the intended integration base.

