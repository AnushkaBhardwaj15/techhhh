# Tech Tombola

Tech Tombola is a technology-themed, real-time digital Tombola (Housie/Bingo) game engine engineered for 400–500 simultaneous live participants, featuring server-authoritative state synchronization, automated win verification, and zero-knowledge ticket security.

> **The Golden Rule:** Tech Tombola is **not a quiz**. A question is a clue. Its answer (the "key") is revealed by the game engine. Participants find that key on their ticket and manually mark it. Participants do **not** submit answers to questions.

## Language

### Core Game Concepts

**Event**:
A complete Tech Tombola occurrence containing one or more rounds (e.g. "Tech Tombola 2026").
_Avoid_: Tournament, competition, session, match

**Round**:
One traditional Tombola game instance within an event, running through drawn keys until all prize patterns are won.
_Avoid_: Game, match, stage, level

**Key**:
The canonical, Event-scoped technology value on a ticket cell revealed by the game engine during a Draw (e.g. `DOCKER`, `RUSSIA`, `POSTGRESQL`). A Key may be reused by Questions in different Rounds of the same Event, but may be revealed only once in a Round.
_Avoid_: Answer, value, bingo number, ball, number

**Question**:
The Round-scoped clue or prompt whose corresponding answer is exactly one Key. In the MVP, a Round has at most one active Question for a given Key.
_Avoid_: Trivia prompt, quiz question, problem, riddle

**Draw**:
The act of the game engine selecting and officially revealing a question-and-key pair during an active round.
_Avoid_: Call, roll, spin, question reveal, pull

**Ticket**:
A participant's unique 3×9 Tombola card containing exactly 15 populated cells (5 per row) with no duplicate keys.
_Avoid_: Card, board, sheet, grid, slip

**Cell**:
One slot in a ticket grid, which either holds a single key or is empty.
_Avoid_: Slot, square, tile, box

**Mark**:
A Participant's manual action of toggling a matching Cell after its Key has been drawn. A Mark is interaction state for presentation and recovery; it is not authoritative proof of winning eligibility.
_Avoid_: Dab, cross, check, stamp, strike

**Claim**:
A participant's submission asserting that they have completed an eligible winning pattern.
_Avoid_: Bingo call, shout, submission, win declaration

**Pattern**:
A recognized winning configuration of marked cells eligible for a prize award.
_Avoid_: Winning line, combination, rule

### Winning Patterns

**Early 5**:
The winning Pattern achieved when at least 5 Keys on a Participant's Ticket have been officially drawn, regardless of where those Cells appear.
_Avoid_: Quick 5, First 5, Corner 5

**Top Line**:
The winning pattern achieved by marking all 5 populated cells in Row 1 (the top row) of the ticket.
_Avoid_: First line, row 1

**Middle Line**:
The winning pattern achieved by marking all 5 populated cells in Row 2 (the middle row) of the ticket.
_Avoid_: Second line, row 2

**Bottom Line**:
The winning pattern achieved by marking all 5 populated cells in Row 3 (the bottom row) of the ticket.
_Avoid_: Third line, row 3

**Full House**:
The top-tier winning pattern achieved by marking all 15 populated cells across the entire ticket.
_Avoid_: Bingo, jackpot, blackout, coverall

### Roles & Surfaces

**Participant**:
An authenticated event attendee holding an assigned ticket for an active round.
_Avoid_: User, player, gamer, contestant

**Admin**:
An operational staff member who controls round state, initiates draws, and audits claims.
_Avoid_: Host, operator, mod, referee

**Super Admin**:
A privileged administrator who manages admin accounts, system configuration, and disaster recovery.
_Avoid_: Root, system owner, superuser

**Live Display**:
The public, read-only projector display showing active questions, drawn keys, historical draws, and verified winners in real time.
_Avoid_: Projector view, scoreboard, public screen, dashboard


**Participant Batch**:
An operator-named group of participant enrollments within one Event, such as
`testing1`, `testing2`, or `prod`. The name is entered when importing a file,
not stored as a column in that file. It supports removing test groups together.
_Avoid_: Academic batch, graduation year, login ID.
