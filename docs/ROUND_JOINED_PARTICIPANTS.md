# Joined participants in game control

User requirement (27 October 2026): show all participants who joined the selected
game and its total joined count below the game code and QR area. This extends
backend FR-004 and frontend FR-FE-013/FR-FE-015 with a round roster.

- Admins and Super Admins can view names, email addresses and first join times.
- Count successful server-confirmed joins, once per participant per Round.
- Preassigned tickets do not count as joins. Disconnecting, rejoining, refreshing
  and signing in on another device do not remove or duplicate the participant.
- The backend owns membership, uniqueness and count; React displays the response.
- Persist a join only for an active participant with a ticket in a joinable Round.
  Reject new joins to completed, cancelled, draft or recovery-required Rounds.
- Keep the original first join timestamp on retries. Round row locks serialize
  recording with lifecycle changes; a database unique key prevents double entries.
- `GET /api/v1/admin/play/rounds/:id/participants` returns
  `{ roundId, total, participants: [{ id, name, email, joinedAt }] }`.
- No roster data is exposed to participants or public display endpoints. Errors:
  400 invalid Round ID, 401 unauthenticated, 403 wrong role, 404 missing Round.
- Refresh the panel every three seconds and on focus. Show loading, empty, retry,
  permission and stale-data states. Do not display zero before a response arrives.
- Earlier joins cannot be reconstructed from assigned tickets. Existing
  participants appear when they successfully rejoin after migration 0018.

Tests cover preassignment versus joins, repeated joins and first timestamp,
disconnected/inactive users retained, independent Rounds, Event mismatch, wrong
roles, missing ticket/Round, lifecycle rejection, IO failure, response validation,
UI refresh, error/empty/loading states and game switching without stale identities.

Implementation is on feature/tombola_round_joined_participants and includes the
unmerged auth feature as a dependency. Changes specific to this requirement are
reviewed against commit 78efd37. The broader browser-suite failures documented in
AUTH_PARTICIPANT_BATCHES_TEST_RESULTS.md remain a separate merge blocker.
