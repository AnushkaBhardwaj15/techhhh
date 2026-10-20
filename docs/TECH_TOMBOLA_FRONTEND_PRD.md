# TECH TOMBOLA --- FRONTEND PRODUCT REQUIREMENTS DOCUMENT

**Document Type:** Frontend Product Requirements Document (PRD)\
**Product:** Tech Tombola\
**Version:** 1.0 --- MVP\
**Status:** Engineering Specification\
**Frontend:** React + TypeScript + Vite + GSAP\
**Backend Contract:** Bun + TypeScript + Fastify + PostgreSQL +
WebSocket\
**Primary UX Target:** Mobile-first participant experience\
**Expected Scale:** \~400--500 active participants

------------------------------------------------------------------------

# 1. Document Purpose

This document defines the complete frontend requirements, architecture,
UX behavior, component system, state model, API integration model,
real-time synchronization, accessibility, performance, testing, and
deployment requirements for the Tech Tombola platform.

The frontend is one web application containing separate authenticated
and role-aware experiences:

1.  Participant application
2.  Admin application
3.  Super Admin application
4.  Live host/display interface

The frontend must preserve the mechanics of traditional Tombola while
adapting them to a live web-based technology event.

**Critical product rule:**

> Tech Tombola is not a quiz.

A question is presented as a clue/prompt. Its associated answer/key is
revealed by the game engine. The participant looks for that key on their
generated Tombola ticket and manually marks the matching ticket cell.

Participants do **not** submit answers to questions.

------------------------------------------------------------------------

# 2. Product Context

## 2.1 Core Game Flow

The frontend must support the following flow:

``` text
Participant Login
       ↓
Event Lobby
       ↓
Round Starts
       ↓
Question/Clue Revealed
       ↓
Answer / Key Revealed
       ↓
Participant Finds Key on Ticket
       ↓
Participant Marks Matching Cell
       ↓
Frontend Syncs State
       ↓
Participant Claims Winning Pattern
       ↓
Admin Verifies Claim
       ↓
Winner Announced
       ↓
Round Continues / Ends
```

## 2.2 Traditional Tombola Model

Each participant receives a persistent Tombola ticket.

The standard ticket structure is:

-   3 rows
-   9 columns
-   15 populated cells
-   5 populated cells per row

Empty cells remain visually distinct from playable cells.

A drawn key can only be marked when it exists on the participant's
ticket.

------------------------------------------------------------------------

# 3. Frontend Goals

## 3.1 Primary Goals

-   Deliver a reliable browser-based Tombola experience.
-   Make the participant interface mobile-first.
-   Provide clear real-time draw updates.
-   Make ticket interaction extremely simple.
-   Persist participant progress across logout, refresh, reconnect, and
    temporary network loss.
-   Provide efficient admin controls for running a live event.
-   Provide a dedicated live display/host experience.
-   Use GSAP for purposeful event/game animations.
-   Maintain accessibility and usable performance on mid-range mobile
    devices.
-   Recover authoritative state from the backend after reconnect.
-   Keep frontend architecture simple enough for an MVP.

## 3.2 Secondary Goals

-   Create a polished technology-event visual identity.
-   Make important game events visually obvious.
-   Reduce participant confusion during live rounds.
-   Minimize unnecessary navigation.
-   Keep the interface usable on unstable mobile networks.

------------------------------------------------------------------------

# 4. Non-Goals

The MVP frontend does not include:

-   Participant-created accounts
-   Participant password reset
-   Participant quiz-answer submission
-   Native Android/iOS applications
-   Offline gameplay without eventual server synchronization
-   Social chat
-   Voice/video calling
-   Complex gamification outside Tombola
-   Cryptocurrency/blockchain functionality
-   Microfrontend architecture
-   Multiple frontend applications/repositories
-   Heavy 3D/WebGL experiences
-   Client-authoritative game state

------------------------------------------------------------------------

# 5. Target Users

## 5.1 Participant

Primary user.

Needs:

-   Login
-   View event status
-   View ticket
-   Observe current draw
-   Identify matching keys
-   Mark ticket cells
-   Claim a winning pattern
-   See claim/winner status
-   Recover game state after reconnect

## 5.2 Admin

Operational event staff.

Needs:

-   Monitor event
-   Manage rounds
-   Manage questions and keys
-   Manage participants
-   Control draws
-   View claims
-   Verify winners
-   Correct operational issues where permitted
-   View audit-related information

## 5.3 Super Admin

Higher-privilege administrative user.

Needs all Admin capabilities plus privileged event/configuration
operations defined by the backend authorization model.

## 5.4 Host / Display Operator

Uses the live-display interface during the physical event.

Needs:

-   Current question
-   Current revealed key
-   Draw history
-   Current round status
-   Winner/announcement state
-   Large-screen readable presentation

------------------------------------------------------------------------

# 6. Technology Stack

## 6.1 Required Stack

  Layer             Technology
  ----------------- --------------------------------
  UI                React
  Language          TypeScript
  Build             Vite
  Animation         GSAP
  Routing           React Router
  Server State      TanStack Query
  Client State      Zustand
  Validation        Zod
  Styling           CSS Modules / modern CSS
  Real-Time         Native WebSocket client
  HTTP              Fetch / typed API client
  Testing           Vitest + React Testing Library
  E2E               Playwright
  Package Manager   bun / npm / pnpm

## 6.2 Why TypeScript

TypeScript is required even though the broader frontend requirement is
JavaScript-based.

Reasons:

-   Strong API contracts
-   Safer game-state handling
-   Safer WebSocket event handling
-   Better component interfaces
-   Reduced runtime mistakes
-   Easier maintenance by multiple club developers

------------------------------------------------------------------------

# 7. Frontend Architecture

The application should be a single React SPA with role-aware routing.

``` text
React Application
│
├── Public
│   └── Login
│
├── Participant
│   ├── Lobby
│   ├── Game
│   ├── Ticket
│   ├── Claim
│   └── Results
│
├── Admin
│   ├── Dashboard
│   ├── Event
│   ├── Rounds
│   ├── Questions & Keys
│   ├── Participants
│   ├── Draw Control
│   ├── Claims
│   └── Winners
│
├── Super Admin
│   └── Privileged Operations
│
└── Live Display
    ├── Waiting
    ├── Current Question
    ├── Current Key
    ├── Draw History
    └── Winner State
```

------------------------------------------------------------------------

# 8. Recommended Repository Structure

``` text
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   └── providers.tsx
│   │
│   ├── assets/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── feedback/
│   │   ├── navigation/
│   │   └── animation/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── participant/
│   │   ├── ticket/
│   │   ├── game/
│   │   ├── claims/
│   │   ├── admin/
│   │   ├── questions/
│   │   ├── participants/
│   │   ├── live-display/
│   │   └── winners/
│   │
│   ├── hooks/
│   │
│   ├── layouts/
│   │   ├── ParticipantLayout.tsx
│   │   ├── AdminLayout.tsx
│   │   └── DisplayLayout.tsx
│   │
│   ├── lib/
│   │   ├── api/
│   │   ├── websocket/
│   │   ├── auth/
│   │   ├── storage/
│   │   └── utils/
│   │
│   ├── pages/
│   │
│   ├── stores/
│   │
│   ├── styles/
│   │
│   ├── types/
│   │
│   └── main.tsx
│
├── public/
├── tests/
├── playwright/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

------------------------------------------------------------------------

# 9. Route Architecture

## 9.1 Public Routes

``` text
/login
```

## 9.2 Participant Routes

``` text
/participant
/participant/lobby
/participant/game
/participant/ticket
/participant/claims
/participant/results
```

The primary game experience should normally remain within
`/participant/game` to minimize navigation.

## 9.3 Admin Routes

``` text
/admin
/admin/event
/admin/rounds
/admin/questions
/admin/participants
/admin/draw
/admin/claims
/admin/winners
/admin/audit
```

## 9.4 Super Admin Routes

Privileged operations should use the same Admin application with
role-based visibility and authorization.

Example:

``` text
/admin/settings
/admin/administrators
/admin/event/configuration
```

The frontend must never rely solely on hidden UI for authorization. The
backend remains authoritative.

## 9.5 Live Display Routes

``` text
/display
/display/round
/display/winner
```

The display interface should be optimized for large screens/projectors.

------------------------------------------------------------------------

# 10. Authentication UX

## 10.1 Login

Participant login requires:

-   Email
-   Password
-   Login action
-   Loading state
-   Invalid credential state
-   Network error state

Admin login uses the same authentication mechanism with role-aware
routing.

## 10.2 Authentication Requirements

The frontend must:

-   Never store plaintext passwords.
-   Never log credentials.
-   Use secure backend authentication.
-   Persist only the minimum session information required.
-   Restore the authenticated session after page refresh when supported
    by backend session design.
-   Redirect unauthorized users away from protected routes.

## 10.3 Session Expiration

If the backend reports an expired/invalid session:

``` text
Current screen
     ↓
Session Expired
     ↓
Re-authenticate
     ↓
Restore participant state
```

The user must not silently lose their ticket or game progress.

------------------------------------------------------------------------

# 11. Participant Experience

## 11.1 Participant UX Principle

The participant should be able to understand the game without reading a
long instruction manual.

The screen should answer four questions immediately:

1.  What is happening?
2.  What question/key was just drawn?
3.  What do I need to mark?
4.  What can I claim?

------------------------------------------------------------------------

# 12. Participant Lobby

The lobby appears before a round starts.

## Required Information

-   Participant name
-   Event name
-   Ticket identifier
-   Event status
-   Round status
-   Countdown where applicable
-   Basic rules/help
-   Connection status

Example:

``` text
TECH TOMBOLA

Welcome, Saransh

Ticket #A104

ROUND 1
Starting soon...

● Connected
```

## Lobby States

``` text
WAITING
READY
ROUND_STARTING
ROUND_ACTIVE
ROUND_PAUSED
EVENT_COMPLETED
```

------------------------------------------------------------------------

# 13. Participant Game Screen

The game screen is the most important frontend screen.

## 13.1 Mobile Layout

Recommended order:

``` text
┌──────────────────────────┐
│ Round / Connection       │
├──────────────────────────┤
│                          │
│       QUESTION           │
│  "Largest country..."    │
│                          │
├──────────────────────────┤
│      REVEALED KEY        │
│        RUSSIA            │
├──────────────────────────┤
│                          │
│       TOMBOLA TICKET     │
│                          │
├──────────────────────────┤
│ Claims / Game Status     │
└──────────────────────────┘
```

The ticket remains the primary interaction surface.

------------------------------------------------------------------------

# 14. Question and Key Display

The frontend must visually distinguish:

-   Question/clue
-   Revealed answer/key

Example:

``` text
QUESTION

What is the largest country
in the world by area?

ANSWER / KEY

RUSSIA
```

The participant must not be presented with an input asking them to
answer the question.

------------------------------------------------------------------------

# 15. Ticket Component

## 15.1 Ticket Structure

The ticket is rendered as:

``` text
3 rows × 9 columns
```

Example:

``` text
┌────┬────┬────┬────┬────┬────┬────┬────┬────┐
│ 12 │    │ 27 │    │ 44 │    │ 61 │    │ 82 │
├────┼────┼────┼────┼────┼────┼────┼────┼────┤
│    │ 19 │    │ 35 │    │ 52 │    │ 74 │ 89 │
├────┼────┼────┼────┼────┼────┼────┼────┼────┤
│  7 │    │ 24 │ 38 │    │    │ 66 │ 71 │    │
└────┴────┴────┴────┴────┴────┴────┴────┴────┘
```

For Tech Tombola, populated values are the dynamic keys associated with
questions.

## 15.2 Cell States

Each populated cell must support:

``` text
UNMARKED
DRAWN_AVAILABLE
MARKED
WINNING
DISABLED
```

Empty cells:

``` text
EMPTY
```

## 15.3 Interaction

When a participant receives a key:

1.  Frontend receives draw event.
2.  It determines whether that key exists on the ticket.
3.  Matching cell receives `DRAWN_AVAILABLE`.
4.  Participant taps the cell.
5.  Frontend sends mark request to backend.
6.  Backend validates the operation.
7.  Backend confirms marked state.
8.  UI changes to `MARKED`.

The client must not assume that a mark is valid merely because the cell
visually appears eligible.

------------------------------------------------------------------------

# 16. Ticket Interaction Requirements

## FR-FE-001 --- Ticket Rendering

The frontend shall render the participant's server-generated ticket
exactly as returned by the backend.

## FR-FE-002 --- Persistent Ticket

The frontend shall restore the same ticket after:

-   Refresh
-   Logout/login
-   Reconnect
-   Browser reopening during the event

## FR-FE-003 --- Valid Cell Marking

Only a drawn key can become markable.

## FR-FE-004 --- Server Authority

The frontend shall treat the backend as authoritative for marked state.

## FR-FE-005 --- Duplicate Mark Prevention

Repeated taps must not create duplicate mark operations.

## FR-FE-006 --- Visual Feedback

Every successful mark must provide immediate visual confirmation.

------------------------------------------------------------------------

# 17. Optimistic UI Policy

Ticket marking may use optimistic UI only if carefully controlled.

Recommended approach:

``` text
Tap
 ↓
Pending visual state
 ↓
POST mark
 ↓
Backend confirms
 ↓
Marked
```

If rejected:

``` text
Pending
 ↓
Backend rejects
 ↓
Revert
 ↓
Show reason
```

The frontend must never permanently mark a cell based only on local
state.

------------------------------------------------------------------------

# 18. Draw Reveal Experience

A draw consists of:

``` text
Question
+
Associated Key
```

## Recommended Animation Sequence

``` text
New draw event
      ↓
Question card enters
      ↓
Question settles
      ↓
Key reveal animation
      ↓
Matching ticket cell highlights
      ↓
Participant can mark
```

GSAP may be used for:

-   Question reveal
-   Key reveal
-   Matching-cell pulse
-   Winner celebration
-   Round transitions

Animations must never block the user's ability to mark the ticket.

------------------------------------------------------------------------

# 19. GSAP Requirements

GSAP is required for major event animations but should not be used
indiscriminately.

## Animation Rules

-   Keep interactions fast.
-   Avoid excessive bouncing.
-   Respect `prefers-reduced-motion`.
-   Do not animate every DOM element.
-   Avoid long blocking transitions.
-   Avoid animations that hide critical information.
-   Use transforms/opacity where possible for performance.

## Reduced Motion

When:

``` css
@media (prefers-reduced-motion: reduce)
```

the frontend must reduce or disable non-essential animations.

Critical state changes must remain visible without animation.

------------------------------------------------------------------------

# 20. Real-Time WebSocket Architecture

The backend is authoritative and sends live game events.

## Client Flow

``` text
React App
   │
   ├── REST → Initial State
   │
   └── WebSocket → Live Events
                    │
                    ├── Round Started
                    ├── Question Revealed
                    ├── Key Drawn
                    ├── Round Paused
                    ├── Claim Submitted
                    ├── Winner Verified
                    └── Round Completed
```

## 20.1 WebSocket States

``` text
CONNECTING
CONNECTED
RECONNECTING
DISCONNECTED
```

Connection status must be visible to participants.

------------------------------------------------------------------------

# 21. WebSocket Reconnection

A dropped connection must not destroy local game state.

## Reconnection Flow

``` text
Connection lost
      ↓
Show "Reconnecting..."
      ↓
Attempt reconnect
      ↓
Connected
      ↓
Request authoritative state
      ↓
Replace stale client state
      ↓
Resume gameplay
```

The frontend should use exponential backoff with a bounded retry
strategy.

------------------------------------------------------------------------

# 22. State Management

The application should separate:

1.  Server state
2.  Ephemeral UI state
3.  Authentication state

## 22.1 TanStack Query

Use for:

-   Participant profile
-   Ticket data
-   Event state
-   Round state
-   Questions
-   Participants
-   Claims
-   Winners
-   Admin dashboard data

## 22.2 Zustand

Use for:

-   Current UI state
-   WebSocket status
-   Active animation state
-   Temporary ticket interaction state
-   Modal state
-   Display preferences

Do not duplicate authoritative server state unnecessarily inside
Zustand.

------------------------------------------------------------------------

# 23. Frontend Data Model

Representative types:

``` ts
type UserRole =
  | "PARTICIPANT"
  | "ADMIN"
  | "SUPER_ADMIN";

type RoundStatus =
  | "DRAFT"
  | "READY"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED";

interface TombolaCell {
  id: string;
  row: number;
  column: number;
  keyId: string | null;
  keyValue: string | null;
  marked: boolean;
}

interface Ticket {
  id: string;
  participantId: string;
  cells: TombolaCell[];
}

interface Draw {
  id: string;
  roundId: string;
  questionId: string;
  questionText: string;
  keyId: string;
  keyValue: string;
  sequence: number;
  drawnAt: string;
}
```

Exact API schemas must follow the backend contract.

------------------------------------------------------------------------

# 24. API Integration

The frontend should use a typed API client.

Example structure:

``` text
src/lib/api/
├── client.ts
├── auth.ts
├── participant.ts
├── ticket.ts
├── rounds.ts
├── questions.ts
├── draws.ts
├── claims.ts
└── admin.ts
```

The API client must provide:

-   Base URL configuration
-   Authentication handling
-   JSON parsing
-   Typed responses
-   Standardized errors
-   Request cancellation
-   Timeout handling where appropriate

------------------------------------------------------------------------

# 25. Error Handling

Every important screen must support:

1.  Loading
2.  Success
3.  Empty
4.  Error
5.  Reconnecting
6.  Permission denied

## Example

``` text
Loading ticket...
      ↓
Ticket loaded

OR

Unable to load ticket.
[Retry]
```

Errors should be understandable to participants.

Technical details belong in logs/diagnostics rather than
participant-facing UI.

------------------------------------------------------------------------

# 26. Participant Claim UX

Claims are a major game action.

## Claim Flow

``` text
Participant believes pattern is complete
          ↓
Tap "Claim Win"
          ↓
Show pattern confirmation
          ↓
Confirm
          ↓
Submit claim
          ↓
Backend validates
          ↓
Claim status displayed
```

The frontend should clearly show:

``` text
Claim Submitted
Waiting for verification...
```

or:

``` text
Claim Verified
Congratulations!
```

or:

``` text
Claim Rejected
The required pattern was not complete.
```

------------------------------------------------------------------------

# 27. Winning Pattern UI

MVP supported patterns:

-   Early 5
-   Top Line
-   Middle Line
-   Bottom Line
-   Full House

The frontend should show:

``` text
AVAILABLE CLAIMS

✓ Early 5
○ Top Line
○ Middle Line
○ Bottom Line
○ Full House
```

The backend remains responsible for determining actual eligibility.

------------------------------------------------------------------------

# 28. Winner Experience

When a claim is verified:

-   Show winner state.
-   Highlight the relevant ticket cells.
-   Display winning pattern.
-   Show appropriate celebration animation.
-   Keep the result visible until the event moves forward.

For a live event, the winner state must also propagate through WebSocket
to other clients where appropriate.

------------------------------------------------------------------------

# 29. Admin Dashboard

The admin interface is desktop/tablet-first.

## Dashboard Information

``` text
EVENT STATUS
ACTIVE ROUND
PARTICIPANTS
CONNECTED USERS
DRAW COUNT
PENDING CLAIMS
WINNERS
SYSTEM STATUS
```

Important actions should be visible without deep navigation.

------------------------------------------------------------------------

# 30. Admin Navigation

Recommended navigation:

``` text
Dashboard
Event
Rounds
Questions & Keys
Participants
Draw Control
Claims
Winners
Audit
```

Super Admin-only navigation can be displayed conditionally.

------------------------------------------------------------------------

# 31. Question & Key Management UI

Admin must be able to:

-   Create question
-   Create key
-   Associate question with key
-   Edit question
-   Edit key before use
-   Disable/remove unused question-key pairs
-   Search
-   Filter
-   Bulk import where supported

Example table:

  Question              Key      Status   Used
  --------------------- -------- -------- ------
  Largest country?      RUSSIA   Ready    No
  AWS object storage?   S3       Ready    No

Once a question/key pair has been used in a live draw, frontend controls
must respect backend immutability rules.

------------------------------------------------------------------------

# 32. Participant Management UI

Admin interface must support:

-   Participant list
-   Search
-   Filtering
-   Participant status
-   Ticket identifier
-   Event assignment
-   Import status
-   Active/inactive status

Bulk participant import should provide:

``` text
Upload CSV
 ↓
Preview
 ↓
Validation results
 ↓
Confirm import
 ↓
Import progress
 ↓
Completion summary
```

------------------------------------------------------------------------

# 33. Draw Control Interface

The draw control page is a high-risk operational interface.

It must clearly show:

``` text
ROUND 1
STATUS: ACTIVE

NEXT DRAW

[ Draw Question ]

CURRENT DRAW
Question:
...

Key:
...

DRAW HISTORY
1. AWS
2. RUSSIA
3. PYTHON
```

## Safety

Destructive or irreversible operations require confirmation.

The Draw button must have a clear loading/disabled state while a draw
request is processing.

The UI must prevent accidental double submission.

------------------------------------------------------------------------

# 34. Manual Draw Support

Where backend permits manual/entered draws, the frontend must
distinguish:

``` text
RANDOM DRAW
MANUAL DRAW
```

Manual draw operations should display confirmation before execution.

The frontend must never bypass backend duplicate-draw validation.

------------------------------------------------------------------------

# 35. Claims Administration

Admin claim screen:

``` text
Pending Claims
----------------------------
Participant
Pattern
Submitted At
Status
Actions

[View]
[Verify]
[Reject]
```

Verification actions should require explicit confirmation.

------------------------------------------------------------------------

# 36. Live Display Interface

The live display is optimized for:

-   Projector
-   Large monitor
-   Event hall screen

It should not resemble the participant dashboard.

## Primary Content

``` text
TECH TOMBOLA

ROUND 1

QUESTION

What is the largest country
in the world?

ANSWER

RUSSIA

RECENT DRAWS
AWS | PYTHON | RUSSIA

STATUS
GAME ACTIVE
```

Use large typography and strong contrast.

------------------------------------------------------------------------

# 37. Live Display Responsiveness

Primary target:

``` text
16:9 desktop/projector
```

Secondary support:

``` text
1920×1080
1366×768
1280×720
```

The display should remain readable from a distance.

------------------------------------------------------------------------

# 38. Responsive Design

## Participant

Mobile-first breakpoints:

``` text
320px
375px
390px
430px
768px
1024px+
```

The ticket must remain usable without requiring horizontal scrolling
where practical.

If the device is too narrow for a comfortable ticket:

-   Reduce spacing
-   Use responsive cell sizing
-   Preserve touch targets
-   Avoid shrinking text below usability thresholds

## Admin

Desktop/tablet-first.

## Display

Large-screen-first.

------------------------------------------------------------------------

# 39. Touch Requirements

Participant ticket cells must be touch-friendly.

Requirements:

-   Adequate tap target
-   No hover-only interaction
-   Visible pressed state
-   Clear marked state
-   Prevent accidental double taps
-   No reliance on precise mouse movement

------------------------------------------------------------------------

# 40. Accessibility

The frontend shall target WCAG 2.2 AA-level practices where practical
for the MVP.

Requirements:

-   Keyboard navigation
-   Visible focus states
-   Semantic HTML
-   Accessible labels
-   Screen-reader-friendly controls
-   Sufficient color contrast
-   No color-only state indication
-   Reduced-motion support
-   Error messages associated with controls
-   Accessible modals/dialogs

Ticket states must not rely only on color.

Example:

``` text
DRAWN
✓

MARKED
●

WINNING
★
```

------------------------------------------------------------------------

# 41. Performance Requirements

## Participant

Target on a mid-range mobile device:

-   Initial meaningful UI: \<2.5 seconds on a good connection
-   Interactive UI: \<3 seconds
-   Ticket interactions: visually immediate
-   Draw event rendering: \<300ms after event receipt where practical

## Runtime

The frontend should avoid:

-   Excessive re-renders
-   Large unnecessary dependencies
-   Heavy animation timelines
-   Unoptimized images
-   Memory leaks from WebSocket listeners

------------------------------------------------------------------------

# 42. Real-Time Performance

WebSocket events should update only the affected parts of the interface.

Example:

A new draw should not cause the entire participant application to
remount.

Preferred:

``` text
Draw Event
 ↓
Game state update
 ↓
Question component update
 ↓
Key component update
 ↓
Matching Ticket Cell update
```

Not:

``` text
Draw Event
 ↓
Full application reload
```

------------------------------------------------------------------------

# 43. Client Caching

Use server-state caching carefully.

Recommended:

-   Cache stable participant profile.
-   Cache ticket data.
-   Keep active round state fresh.
-   Invalidate/refetch after important mutations.
-   Treat WebSocket events as triggers for state synchronization.

The client must not use stale cached state to make authoritative game
decisions.

------------------------------------------------------------------------

# 44. Offline / Poor Network Behavior

The MVP does not provide unrestricted offline gameplay.

However, the UI should tolerate temporary connectivity loss.

During disconnection:

``` text
CONNECTION LOST

Reconnecting...
```

The participant may continue viewing already-known state, but new
authoritative game actions must be synchronized with the backend.

------------------------------------------------------------------------

# 45. Security Requirements

The frontend must:

-   Never store plaintext passwords.
-   Never expose backend secrets.
-   Never contain admin credentials.
-   Never trust client-side role checks for authorization.
-   Never trust local ticket state for claims.
-   Never expose sensitive participant information unnecessarily.
-   Avoid unsafe HTML rendering.
-   Sanitize user-generated display content where required.
-   Use HTTPS in production.
-   Use secure authentication/session handling defined by backend.

------------------------------------------------------------------------

# 46. Anti-Cheat UX

The frontend must not expose hidden game data.

It must not preload:

-   Future draw sequence
-   Undrawn answers
-   Hidden question/key mappings beyond what is currently authorized
-   Other participants' tickets
-   Admin-only controls

The participant application should render only the information allowed
by the backend.

------------------------------------------------------------------------

# 47. Browser Support

MVP target:

-   Latest Chrome/Chromium
-   Latest Edge
-   Latest Firefox
-   Latest Safari
-   Modern Android Chrome
-   Modern iOS Safari

Legacy browsers are not a target.

------------------------------------------------------------------------

# 48. Loading States

Every network-dependent action must have a clear loading state.

Examples:

``` text
Logging in...
Loading ticket...
Submitting claim...
Drawing...
Verifying...
Reconnecting...
```

Buttons that trigger mutations must become disabled while the request is
pending unless the operation explicitly supports concurrent execution.

------------------------------------------------------------------------

# 49. Notifications

Use a consistent notification system for:

-   Successful mark
-   Invalid mark
-   Claim submitted
-   Claim rejected
-   Winner verified
-   Connection lost
-   Connection restored
-   Round started
-   Round paused

Notifications must not obscure the ticket.

------------------------------------------------------------------------

# 50. Frontend Functional Requirements

  -----------------------------------------------------------------------
  ID                                  Requirement
  ----------------------------------- -----------------------------------
  FR-FE-001                           User shall be able to log in.

  FR-FE-002                           User shall be routed according to
                                      role.

  FR-FE-003                           Participant shall view their
                                      persistent ticket.

  FR-FE-004                           Participant shall view current
                                      question.

  FR-FE-005                           Participant shall view revealed
                                      key.

  FR-FE-006                           Participant shall identify matching
                                      ticket cells.

  FR-FE-007                           Participant shall mark eligible
                                      cells.

  FR-FE-008                           Participant shall receive marking
                                      confirmation.

  FR-FE-009                           Participant shall submit a claim.

  FR-FE-010                           Participant shall view claim
                                      status.

  FR-FE-011                           Participant shall view winner
                                      state.

  FR-FE-012                           Participant state shall recover
                                      after reconnect.

  FR-FE-013                           Admin shall view event dashboard.

  FR-FE-014                           Admin shall manage questions/keys.

  FR-FE-015                           Admin shall manage participants.

  FR-FE-016                           Admin shall control draws.

  FR-FE-017                           Admin shall review claims.

  FR-FE-018                           Admin shall view winners.

  FR-FE-019                           Live display shall show current
                                      game state.

  FR-FE-020                           Frontend shall consume real-time
                                      WebSocket events.

  FR-FE-021                           Frontend shall gracefully recover
                                      from WebSocket disconnection.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 51. Non-Functional Requirements

  -----------------------------------------------------------------------
  ID                                  Requirement
  ----------------------------------- -----------------------------------
  NFR-FE-001                          Participant UI shall be
                                      mobile-first.

  NFR-FE-002                          Frontend shall use React and
                                      TypeScript.

  NFR-FE-003                          GSAP shall be used for purposeful
                                      game/event animation.

  NFR-FE-004                          Frontend shall support
                                      approximately 500 concurrent
                                      participants.

  NFR-FE-005                          UI shall remain usable on mid-range
                                      mobile devices.

  NFR-FE-006                          Critical game state shall come from
                                      the backend.

  NFR-FE-007                          WebSocket disconnection shall not
                                      destroy participant progress.

  NFR-FE-008                          UI shall support reduced motion.

  NFR-FE-009                          Frontend shall follow accessible
                                      interaction practices.

  NFR-FE-010                          Production bundle shall be
                                      optimized for fast delivery.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 52. Testing Strategy

## 52.1 Unit Tests

Test:

-   Ticket cell state
-   Claim visibility
-   Draw-state transitions
-   Formatting helpers
-   WebSocket event reducers
-   Permission helpers

## 52.2 Component Tests

Test:

-   Login form
-   Ticket
-   Draw card
-   Key reveal
-   Claim dialog
-   Admin draw control
-   Question editor

## 52.3 Integration Tests

Test:

``` text
Login
→ Load participant
→ Load ticket
→ Receive draw
→ Mark cell
→ Claim
→ Receive verification
```

## 52.4 E2E Tests

Critical scenario:

``` text
Participant login
→ Lobby
→ Round starts
→ Draw received
→ Correct ticket cell identified
→ Cell marked
→ Claim submitted
→ Admin verifies
→ Winner state appears
```

## 52.5 Reconnection Test

``` text
Active game
→ Disable network
→ WebSocket disconnect
→ Restore network
→ Reconnect
→ State resync
→ Continue game
```

------------------------------------------------------------------------

# 53. Acceptance Criteria

## Participant

-   Login works with backend credentials.
-   Participant sees their correct ticket.
-   Ticket remains identical after refresh.
-   Current question/key updates in real time.
-   Only eligible cells can be marked.
-   Mark state survives refresh/reconnect.
-   Claim flow works.
-   Winner state is clearly visible.

## Admin

-   Admin can access operational dashboard.
-   Questions/keys can be managed according to backend rules.
-   Draw controls work without duplicate submissions.
-   Claims can be reviewed.
-   Winner information is visible.

## Live Display

-   Current question is visible.
-   Current key is visible.
-   Recent draw history is visible.
-   Round state is visible.
-   Winner announcements are visible.

------------------------------------------------------------------------

# 54. Definition of Done

A frontend feature is complete only when:

-   UI is implemented.
-   Responsive behavior is implemented.
-   Loading/error states exist.
-   Backend integration works.
-   WebSocket behavior is implemented where required.
-   Accessibility basics are addressed.
-   Mobile behavior is tested.
-   Relevant unit/component tests exist.
-   E2E behavior is covered for critical flows.
-   No console errors exist during normal operation.
-   No obvious memory leaks exist.
-   Unauthorized access is blocked by routing and backend authorization.
-   Feature works after refresh/reconnect where persistence is required.

------------------------------------------------------------------------

# 55. Deployment Architecture

Recommended:

``` text
                    Internet
                       │
                       ▼
                Frontend CDN
              React Static Build
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
      REST API                 WebSocket
          │                         │
          └────────────┬────────────┘
                       ▼
               Bun Backend
                       │
                       ▼
                  PostgreSQL
```

The frontend should be deployed as static assets through a CDN/static
hosting service.

For the expected 400--500-user event, a separate frontend server is
unnecessary.

------------------------------------------------------------------------

# 56. Environment Configuration

Example:

``` env
VITE_API_BASE_URL=
VITE_WS_BASE_URL=
VITE_APP_NAME=Tech Tombola
VITE_APP_ENV=production
```

No secret value may be placed in `VITE_*` variables.

Anything exposed to the browser must be considered public.

------------------------------------------------------------------------

# 57. Observability

Frontend should capture:

-   API errors
-   WebSocket disconnects
-   Reconnection failures
-   Critical rendering errors
-   Failed mutations
-   Route-level errors

Do not collect unnecessary personal data.

Production logging must not include:

-   Passwords
-   Authentication tokens
-   Sensitive participant data
-   Private admin data

------------------------------------------------------------------------

# 58. UX State Matrix

  Situation              Participant UI
  ---------------------- ---------------------------
  Waiting                Lobby
  Round starting         Countdown
  Question revealed      Question card
  Key revealed           Key card
  Key exists on ticket   Matching cell highlighted
  Cell marked            Marked state
  Claim submitted        Waiting state
  Claim verified         Winner state
  Claim rejected         Rejection feedback
  Connection lost        Reconnecting banner
  Connection restored    Resync state
  Round paused           Pause overlay
  Round complete         Results state

------------------------------------------------------------------------

# 59. Critical Frontend Invariants

The frontend must preserve these invariants:

1.  A participant never answers the question as a quiz.
2.  A question is associated with a key.
3.  A key is what the participant looks for on the ticket.
4.  Participant ticket state is persistent.
5.  Backend state is authoritative.
6.  Client-side role checks are not security controls.
7.  A participant cannot reveal future keys through frontend state.
8.  A participant cannot mark an undrawn key as valid.
9.  Reconnect must recover authoritative state.
10. Admin actions must prevent accidental duplicate operations.
11. Real-time events must not require a full-page reload.
12. Animation must never prevent critical game interaction.

------------------------------------------------------------------------

# 60. Recommended UI Component System

Core reusable components:

``` text
Button
Input
Select
Modal
Dialog
Toast
Badge
Card
Tabs
Table
Pagination
StatusIndicator
LoadingSkeleton
ErrorState
EmptyState
ConnectionIndicator
Countdown
```

Game components:

``` text
TombolaTicket
TombolaCell
QuestionCard
KeyReveal
DrawHistory
RoundStatus
ClaimPanel
WinningPattern
WinnerBanner
```

Admin components:

``` text
AdminSidebar
DashboardCard
QuestionTable
QuestionEditor
ParticipantTable
DrawController
ClaimQueue
WinnerTable
AuditLogTable
```

------------------------------------------------------------------------

# 61. Visual Design Direction

The frontend should feel like a technology event rather than a generic
SaaS dashboard.

Recommended principles:

-   Strong visual hierarchy
-   Dark/light contrast where appropriate
-   Modern typography
-   Subtle technology-inspired visual elements
-   Clear status indicators
-   Controlled use of gradients
-   Minimal unnecessary decoration
-   Strong ticket focus
-   Consistent spacing
-   Consistent component radius
-   High readability

The visual system should remain subordinate to gameplay clarity.

------------------------------------------------------------------------

# 62. Animation Direction

Animation should communicate game events rather than decorate every
interaction.

High-value animations:

### Question Reveal

``` text
Fade + slight vertical movement
```

### Key Reveal

``` text
Scale + opacity + highlight
```

### Matching Cell

``` text
Pulse / glow
```

### Mark

``` text
Short confirmation transition
```

### Winner

``` text
Controlled celebration
```

Avoid:

-   Constant background motion
-   Excessive particle effects
-   Long transitions
-   Animations on every table row
-   Animation that blocks interaction

------------------------------------------------------------------------

# 63. Mobile-First Priority

Participant mobile experience is the highest frontend priority.

The development order should therefore be:

``` text
1. Mobile Participant Login
2. Participant Lobby
3. Mobile Ticket
4. Draw / Key Reveal
5. Marking
6. Claims
7. Reconnect
8. Results
9. Admin
10. Live Display
```

This ensures the core game is usable before secondary operational
interfaces are polished.

------------------------------------------------------------------------

# 64. Suggested Development Milestones

## Milestone 1 --- Foundation

-   React + TypeScript + Vite
-   Routing
-   Styling system
-   API client
-   Authentication
-   Error handling

## Milestone 2 --- Participant Core

-   Lobby
-   Ticket rendering
-   Game screen
-   Draw display
-   Cell marking

## Milestone 3 --- Real-Time

-   WebSocket
-   Draw events
-   Reconnect
-   State synchronization

## Milestone 4 --- Claims

-   Claim UI
-   Claim status
-   Winner state

## Milestone 5 --- Admin

-   Dashboard
-   Questions/keys
-   Participants
-   Draw control
-   Claims

## Milestone 6 --- Live Display

-   Host screen
-   Large-screen layout
-   Draw history
-   Winner announcements

## Milestone 7 --- Hardening

-   E2E tests
-   Mobile testing
-   Performance
-   Accessibility
-   Security review
-   Load-event rehearsal

------------------------------------------------------------------------

# 65. Final Frontend Architecture

``` text
                         TECH TOMBOLA
                              │
                     React + TypeScript
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   PARTICIPANT              ADMIN             LIVE DISPLAY
   MOBILE-FIRST          DESKTOP-FIRST         LARGE SCREEN
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                       Shared API Layer
                              │
                    ┌─────────┴─────────┐
                    │                   │
                   REST              WebSocket
                    │                   │
                    └─────────┬─────────┘
                              │
                         Bun Backend
                              │
                         PostgreSQL
```

------------------------------------------------------------------------

# 66. Final Engineering Principles

1.  **Tombola first, technology second.**
2.  **The participant ticket is the primary UI.**
3.  **Question ≠ quiz answer submission.**
4.  **Backend is the source of truth.**
5.  **WebSocket provides live updates; REST provides recovery.**
6.  **Mobile participant UX has the highest priority.**
7.  **GSAP enhances important game moments, not every interaction.**
8.  **Persistent state must survive refresh and reconnect.**
9.  **Admin controls must be operationally safe.**
10. **No unnecessary infrastructure should be introduced for an MVP of
    \~500 users.**
11. **Accessibility and performance are requirements, not polish.**
12. **The frontend must never expose hidden/future game information.**

------------------------------------------------------------------------

# 67. MVP Release Gate

The frontend is ready for the live event only when the following
complete end-to-end flow passes:

``` text
Participant receives credentials
            ↓
Participant logs in
            ↓
Participant sees persistent ticket
            ↓
Admin starts round
            ↓
Participant receives question
            ↓
Key is revealed
            ↓
Matching ticket cell becomes available
            ↓
Participant marks it
            ↓
Backend confirms mark
            ↓
Participant reaches winning pattern
            ↓
Participant submits claim
            ↓
Admin verifies claim
            ↓
Winner appears on participant UI
            ↓
Winner appears on live display
            ↓
Participant refreshes/reconnects
            ↓
Correct state is restored
```

**Release principle:** If this flow is reliable on a real mobile device
over an imperfect network, the MVP frontend has achieved its primary
objective.
