# Audit fixes on ash

Requirement source: the user requested fixes for the 26 October audit and confirmed `ash` from latest `main`, including authentication hardening. Base: `a8df044`.

Applicable requirements: backend PRD §11 principal roles, §19 ticket immutability, §20–22 authoritative draws, §26–29 claims and winner verification, and authentication/session/security requirements; frontend PRD §10 authentication/session expiry, §21 reconnection, §26 claim UX, and §35 claim administration. CONTEXT.md defines officially drawn keys as eligibility evidence; marks are presentation state. Existing Bun/React layer boundaries remain authoritative.

## Backend

- Verify actual password hashes; remove shared passwords, plaintext acceptance, synthetic identities and memory sessions on database failure.
- Require active persisted sessions, current roles, event scope and active participant profiles on play actions. Existing email quick join requires password verification; registration hashes a private password.
- Keep unrevealed answers out of WebSocket events; participants refresh authoritative REST snapshots.
- Validate marks through the domain while holding the round transaction lock.
- Persist claims as pending; only host verification may create a winner and close a pattern. Eligibility uses official draws, without changing marks or awarding points on submission.
- Remove winner/claim persistence fallbacks that substituted identities or hid SQL errors.
- Filter pending claims by round before pagination. Align operational current-round selection with active play and report interrupted rounds separately.
- Propagate failed reads and expose server request IDs to the client.

## Frontend

- Remove demo credential presets and password persistence/display; add password to secure participant entry.
- Replace the 500 ms polling loop with serial 15-second snapshots, exponential failure backoff capped at 60 seconds, cancellation and terminal authentication handling. Admin consumes the received snapshot without fetching it again.
- Show load/action/claim errors after metrics have loaded; do not display an empty game list as a successful response to a failed request.
- Filter and paginate the embedded pending-claim queue. Restore its documented 15-second refresh interval.
- Use one WebSocket reconnect timer and authoritative snapshot refreshes. Maintain bounded public discovery so a live display can change rounds; private connected snapshots reconcile less frequently.
- Delegate claim eligibility to the server; remove the ticket query without a query function and fix waiting-room routing for READY rounds.

## Regression scenarios

Authentication covers correct/wrong passwords, former shared values, unknown/fuzzy identities, database lookup/write/revocation failures, inactive/expired/revoked sessions, changed roles, mismatched event scope, existing-account quick-join takeover and legitimate registration. Exact allowed origins and backend request-ID correlation are tested.

Gameplay covers hidden versus revealed draws, cross-participant access, undrawn/unrevealed/paused mark rejection through the real service/repository seam, pending claims without local marks, duplicate claims, host-only winner creation and closed-pattern capacity. PGlite exercises transactional persistence; opt-in external PostgreSQL concurrency tests remain separate.

Client coverage includes slow and failing requests, recovery, auth rejection, unmount cancellation, no duplicate fetches, error versus empty states, server-side claim pagination, reconnect teardown, READY socket scope, public round switching, credential-free storage and narrow login layout. Browser regressions simulate recurring HTTP 500 responses without using production data.

## Deployment and historical 500 diagnosis

These are source fixes, not a production deployment. Current production probes during the audit returned 200; the historical exception behind `/play/current` has not been proven. Backoff prevents the request storm and server request IDs now support correlation with backend logs. Apply the actual database/schema or connection repair only after matching logs establish it.

Before release, apply bundled migrations using the documented migration release step and confirm backend readiness. The repository's `frontend/nginx.conf` already proxies `/health` and `/ready`; the deployed host returned SPA HTML for both. Update the host's effective Nginx server block to route these exact paths to the backend, run `nginx -t`, then reload as part of deployment. Verify both responses have JSON content types and that `/ready` checks database connectivity and migration state. Changing only frontend assets will not update host Nginx configuration.

Invalidate previously issued sessions and rotate any persisted accounts that still have known demo passwords during deployment. Removing the bypass does not invalidate sessions issued before the fix or change an account's real password. Never print credentials or session tokens in rollout logs. Explicit merge approval is required; retain `ash` after merge.

## Validation results — 27 October 2026

| Check | Result |
| --- | --- |
| Backend `bun run test` | 351 passed, 7 skipped, 0 failed |
| Frontend Vitest suite | 541 passed across 74 files |
| Selected Playwright browser flows using installed Chrome | 9 passed, including credential storage and recurring-500 regressions |
| Backend typecheck and build | Passed |
| Frontend typecheck/build and ESLint | Passed |
| Frontend deployment-origin validation script | Passed |
| Additional PGlite lifecycle regression after final suite | 6 repository tests passed, including Full House verification and replay |
| Two-axis code review | Standards: no remaining findings; Spec: all four review findings corrected and re-reviewed |

Seven backend skips are existing opt-in external PostgreSQL concurrency checks and Windows-incompatible operational process tests. This is not a 500-participant production load test or a full production game rehearsal. Browser tests mock the HTTP API and never modify a live round. Historical server logs and effective host Nginx configuration remain deployment follow-ups.
