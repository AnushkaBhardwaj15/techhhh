# 0003. Server-Authoritative Game State and Verification

## Context
Tombola games are vulnerable to client-side manipulation, timing exploits, and race conditions if clients have authority over draws, ticket markings, or win declarations. Furthermore, if future questions or answer keys are leaked to the client bundle, players can gain an unfair advantage.

## Decision
The backend server is the **sole source of truth** for all game state:
1. **Zero-Knowledge Draws:** Future questions and answer keys are never sent to participant clients ahead of their draw time.
2. **Deterministic & Immutable Tickets:** Tickets are generated server-side with 15 unique keys (3 rows × 5 keys) and stored immutably in PostgreSQL.
3. **Server-Side Validation:** Every Participant Mark requires the Cell's Key to have already been officially drawn. Marks remain presentation/recovery state and are not trusted as proof of a win. Every Claim is recalculated from the assigned Ticket, official Draw history, configured Pattern, and Pattern closure before awarding a Winner.
4. **Client Role:** The React SPA is purely presentational, capturing tactile interactions and streaming verified updates.

## Consequences
- Impossible for client-side scripts to forge tickets, falsely claim prizes, or peek ahead at upcoming questions.
- Atomic database transactions protect against race conditions where multiple participants claim the same pattern simultaneously.
