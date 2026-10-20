# 0002. Native WebSockets over Redis and Socket.IO

## Context
During live rounds, 400–500 participants and projector displays must receive draw reveals and win announcements with sub-second latency. We considered Socket.IO and distributed pub/sub infrastructure like Redis or Kafka.

## Decision
We chose **Native WebSockets (`@fastify/websocket`)** managed in-memory on the Bun server without external brokers (no Redis, no Socket.IO, no Kafka). Participant and Admin connections authenticate through their browser session. The Live Display uses a separate public, read-only channel that emits only explicitly allowlisted public events. All WebSocket channels are broadcast-only; clients use REST for mutations and authoritative recovery.

## Consequences
- Zero external messaging broker dependencies, keeping infrastructure minimal and eliminating Redis connection failure modes during live games.
- A single Bun Fastify instance is qualified against the 500-connection target, with successful Draws expected to propagate within one second after commit.
- Public display connections never gain Participant or Admin privileges, and no channel exposes future Keys or unpublished Questions.
- If horizontal scaling is required in the future, a pub/sub adapter can be introduced behind the existing transport boundary.
