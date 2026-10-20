# Security suite coverage

Run `bun run test:security` with the local PostgreSQL test database available.

`route-inventory.test.ts` compares the declared route inventory to Fastify's runtime route registration. The inventory has 68 declared HTTP operations and WebSocket channels; implicit `HEAD` aliases and the CORS `OPTIONS` handler are omitted. A route must occur once in the inventory and the registered surface must match it exactly.

`authorization-matrix.test.ts` expands every protected inventory entry and checks unauthenticated requests, then checks the wrong role for each participant, admin, and super-admin route. It also verifies that the private WebSocket channel rejects an unauthenticated upgrade. The generated report maps object ownership and Event boundaries to existing integration suites; global admin operations have no per-Participant owner boundary. Auth, operations, and realtime tests cover valid role access, session revocation, Origin rejection, rate limiting, and public versus authenticated WebSocket subscriptions.

| Security boundary | Verification |
|---|---|
| Cross-Participant Ticket and Cell IDs return non-enumerating 404s | `integration/mark-persistence.test.ts` — ownership scenario |
| Participant ticket reads are bound to session identity and omit question pool/other tickets | `integration/ticket.test.ts` — own-ticket scenario |
| Claims and wins remain participant/Event scoped | `integration/claim-submission.test.ts` — participant claim/win scope scenarios |
| Public Live reads include only committed Draws and verified Winners | `integration/live-display.test.ts` — public read and convergence scenarios |
| Cookie is HttpOnly, Path `/`, SameSite `Lax`, and expires after 24 hours; Secure is production-only | `integration/auth.test.ts`, `unit/auth.test.ts` |
| Logout revokes a Session; untrusted mutation Origin is rejected; failed login is rate limited | `integration/auth.test.ts` |
| Oversized JSON requests are rejected before route processing | `integration/auth.test.ts` — oversized JSON scenario |
| Oversized CSV imports and WebSocket frames are bounded | `integration/import.test.ts`, `src/realtime/realtime.routes.test.ts` |
| Unexpected errors omit SQL and stack details; audit metadata is allowlisted/redacted | `integration/errors.test.ts`, `src/modules/operations/operations.test.ts` |
| Fastify production redaction rules remove password, token, cookie, authorization, and bootstrap-secret fields | `unit/logger-security.test.ts` — actual Fastify logger |
| Undrawn Keys and Questions do not enter participant REST, paginated Draw history, public Live reads, or public WebSocket events; malformed error responses do not echo Key probes | `integration/draw-engine.test.ts`, `integration/live-display.test.ts`, `integration/claim-submission.test.ts`, `src/modules/live/live.service.test.ts`, `src/realtime/events.test.ts` |
| WebSocket client mutation and oversized frames are closed; revoked Sessions cannot receive later events | `src/realtime/realtime.routes.test.ts` |
| Temporary credentials are sent only through the email provider request and provider errors are sanitized | `src/shared/email/email.service.test.ts`; the application has no persistent email-job queue/table |

The suite reuses existing integration tests at the public HTTP, WebSocket, database, and serializer seams. The app has no persistent email-job queue/table, so the email adapter boundary is tested instead. It does not claim external penetration testing or scanning a deployed log sink.
