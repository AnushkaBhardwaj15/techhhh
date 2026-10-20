# 11 — Authenticated and Public Real-Time Transport

**What to build:** Reliable broadcast-only WebSocket delivery for authenticated game clients and a separately allowlisted public Live Display channel.

**PRD traceability:** §§33–34, 38, 60–61; FR-017; NFR-002, NFR-003. ADR-0002.

**Blocked by:** 03 — Authentication and Sessions; 05 — Event Lifecycle; 06 — Round Configuration.

**Branch:** `feature/tombola_realtime_transport`

**Status:** done

## Scope and contracts

- Bun layers: WebSocket handshake routes -> connection manager/dispatcher IO adapter; typed event schemas only, with no domain or repository access.
- Endpoints: `/api/v1/ws` authenticates the Session cookie; `/api/v1/live/ws` is public and read-only.
- Envelope: `{ type, eventId, roundId, occurredAt, payload }`; exact typed payloads for all PRD events and explicit audience metadata.
- Authenticated subscriptions are server-derived from principal/Event/Round scope. The public channel receives only Round state, Draw, verified Winner, and safe Announcement events.
- Heartbeat evicts dead sockets; closed/slow sockets cannot block commits or other broadcasts. Client data frames are rejected/ignored and never call services.
- Frontend: none; publishes event schemas and reconnect protocol.

## Non-goals

- No client commands, message replay log, Redis/Socket.IO, horizontal scaling adapter, or replacement for REST recovery.

## Acceptance criteria

- [x] Expired/revoked Sessions cannot connect or remain subscribed.
- [x] Admin-only Claim events never reach Participants or the public channel.
- [x] Broadcast happens only when a service supplies a committed domain event.
- [x] REST remains authoritative after reconnect; no replay log or broker is introduced.

## Required scenarios

- Valid Participant/Admin connection; missing/malformed/revoked cookie; public connection; wrong Event/Round isolation.
- Every serializer and audience; sensitive-field rejection; client mutation frame; malformed frame.
- Ping/pong success, timeout, clean close/error cleanup, slow/closed socket, simultaneous reconnects.
- 500 open connections smoke test with bounded memory and no cross-channel leakage.

## Verification

Run serializer/audience unit tests, real socket integration tests, 500-connection smoke command, then every canonical backend command.

```bash
cd backend && bun run typecheck && bun run lint && bun test && bun run test:integration && bun run build
```

## Completion evidence

- [x] PR includes every event envelope/payload/audience schema and close/error examples.
- [x] 500-connection, heartbeat, reconnect, and cross-channel leakage evidence are attached.
- [x] `/code-review` has no unresolved Standards or Spec findings.
