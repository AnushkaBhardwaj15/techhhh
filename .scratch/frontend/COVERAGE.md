# Frontend PRD Coverage

Source: [Frontend PRD](../../docs/TECH_TOMBOLA_FRONTEND_PRD.md). This is a requirement-to-work map, not a claim that any feature is implemented. The [README](README.md) supplies common architecture, error, privacy, motion, responsive, test and delivery gates. Every ticket has its own scenario list.

## Section 50 functional requirements

Identifiers are section-qualified because §16 reuses FR-FE-001 through FR-FE-006 with different meanings.

| Requirement | Behavior | Primary tickets |
|---|---|---|
| §50 FR-FE-001 | Login | [01](issues/01-application-authentication-and-role-routing.md) |
| §50 FR-FE-002 | Role routing | [01](issues/01-application-authentication-and-role-routing.md), [19](issues/19-super-admin-account-management.md) |
| §50 FR-FE-003 | Persistent Ticket | [03](issues/03-persistent-mobile-ticket.md), [08](issues/08-reconnect-and-state-recovery.md) |
| §50 FR-FE-004 | Current question | [04](issues/04-live-draw-feed-and-reveal.md) |
| §50 FR-FE-005 | Revealed key | [04](issues/04-live-draw-feed-and-reveal.md) |
| §50 FR-FE-006 | Matching Ticket cells | [04](issues/04-live-draw-feed-and-reveal.md) |
| §50 FR-FE-007 | Mark eligible cells | [05](issues/05-server-confirmed-marking.md) |
| §50 FR-FE-008 | Mark confirmation | [05](issues/05-server-confirmed-marking.md) |
| §50 FR-FE-009 | Submit Claim | [06](issues/06-participant-claims-and-status.md) |
| §50 FR-FE-010 | Claim status | [06](issues/06-participant-claims-and-status.md) |
| §50 FR-FE-011 | Winner state | [07](issues/07-participant-winners-and-results.md), [21](issues/21-public-live-display.md) |
| §50 FR-FE-012 | Recover participant state | [02](issues/02-participant-lobby-and-lifecycle.md), [08](issues/08-reconnect-and-state-recovery.md) |
| §50 FR-FE-013 | Admin dashboard | [09](issues/09-admin-dashboard-and-navigation.md), [15](issues/15-admin-round-live-operations.md) |
| §50 FR-FE-014 | Questions/Keys management | [12](issues/12-admin-questions-and-keys.md) |
| §50 FR-FE-015 | Participant management | [13](issues/13-admin-participant-management.md), [14](issues/14-participant-csv-onboarding.md) |
| §50 FR-FE-016 | Draw controls | [15](issues/15-admin-round-live-operations.md), [16](issues/16-admin-random-and-manual-draws.md) |
| §50 FR-FE-017 | Review Claims | [17](issues/17-admin-claim-adjudication.md) |
| §50 FR-FE-018 | Admin Winners | [18](issues/18-admin-winners-and-audit.md) |
| §50 FR-FE-019 | Live display | [21](issues/21-public-live-display.md) |
| §50 FR-FE-020 | WebSocket consumption | [04](issues/04-live-draw-feed-and-reveal.md), [08](issues/08-reconnect-and-state-recovery.md), [21](issues/21-public-live-display.md) |
| §50 FR-FE-021 | WebSocket recovery | [08](issues/08-reconnect-and-state-recovery.md), [21](issues/21-public-live-display.md) |

## Section 16 Ticket-specific requirements

| Requirement | Behavior | Primary tickets |
|---|---|---|
| §16 FR-FE-001 | Render exact server Ticket | [03](issues/03-persistent-mobile-ticket.md) |
| §16 FR-FE-002 | Persist through refresh/logout/reconnect/reopen | [03](issues/03-persistent-mobile-ticket.md), [08](issues/08-reconnect-and-state-recovery.md), [22](issues/22-critical-flow-and-authorization-e2e.md) |
| §16 FR-FE-003 | Only official drawn key can become markable | [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md); backend validates |
| §16 FR-FE-004 | Backend authoritative marked state | [05](issues/05-server-confirmed-marking.md), [08](issues/08-reconnect-and-state-recovery.md) |
| §16 FR-FE-005 | Prevent duplicate pending marks | [05](issues/05-server-confirmed-marking.md) |
| §16 FR-FE-006 | Confirm successful mark visibly | [05](issues/05-server-confirmed-marking.md) |

## Section 51 non-functional requirements

| Requirement | Obligation | Primary tickets |
|---|---|---|
| §51 NFR-FE-001 | Mobile-first Participant UX | [01](issues/01-application-authentication-and-role-routing.md), [02](issues/02-participant-lobby-and-lifecycle.md), [03](issues/03-persistent-mobile-ticket.md), [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [07](issues/07-participant-winners-and-results.md), [08](issues/08-reconnect-and-state-recovery.md), [23](issues/23-accessibility-responsive-browser-validation.md) |
| §51 NFR-FE-002 | React and TypeScript | [01](issues/01-application-authentication-and-role-routing.md) |
| §51 NFR-FE-003 | Purposeful GSAP motion | [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md), [07](issues/07-participant-winners-and-results.md), [21](issues/21-public-live-display.md), [24](issues/24-performance-and-safe-observability.md) |
| §51 NFR-FE-004 | Approximately 500 participants | [22](issues/22-critical-flow-and-authorization-e2e.md), [24](issues/24-performance-and-safe-observability.md), [25](issues/25-deployment-and-event-release-rehearsal.md) |
| §51 NFR-FE-005 | Mid-range mobile usability | [03](issues/03-persistent-mobile-ticket.md), [23](issues/23-accessibility-responsive-browser-validation.md), [24](issues/24-performance-and-safe-observability.md), [25](issues/25-deployment-and-event-release-rehearsal.md) |
| §51 NFR-FE-006 | Backend game authority | [03](issues/03-persistent-mobile-ticket.md), [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [07](issues/07-participant-winners-and-results.md), [08](issues/08-reconnect-and-state-recovery.md), [15](issues/15-admin-round-live-operations.md), [16](issues/16-admin-random-and-manual-draws.md), [17](issues/17-admin-claim-adjudication.md), [22](issues/22-critical-flow-and-authorization-e2e.md) |
| §51 NFR-FE-007 | Progress survives disconnect | [08](issues/08-reconnect-and-state-recovery.md), [22](issues/22-critical-flow-and-authorization-e2e.md), [25](issues/25-deployment-and-event-release-rehearsal.md) |
| §51 NFR-FE-008 | Reduced motion | [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md), [07](issues/07-participant-winners-and-results.md), [21](issues/21-public-live-display.md), [23](issues/23-accessibility-responsive-browser-validation.md) |
| §51 NFR-FE-009 | Accessible interactions | [01](issues/01-application-authentication-and-role-routing.md), [03](issues/03-persistent-mobile-ticket.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [14](issues/14-participant-csv-onboarding.md), [16](issues/16-admin-random-and-manual-draws.md), [17](issues/17-admin-claim-adjudication.md), [19](issues/19-super-admin-account-management.md), [23](issues/23-accessibility-responsive-browser-validation.md) |
| §51 NFR-FE-010 | Optimized production bundle | [01](issues/01-application-authentication-and-role-routing.md), [24](issues/24-performance-and-safe-observability.md), [25](issues/25-deployment-and-event-release-rehearsal.md) |

These are cross-cutting requirements even where a table lists primary owners. For example, accessibility and loading/errors apply to each feature, and ticket 23 verifies the integrated result.

## All PRD sections

Introductory, architecture and summary sections are shared constraints, not reasons to create speculative implementation tasks.

| Section | Topic | Ticket owners / shared constraint |
|---|---|---|
| §1 | Document purpose | README common gate |
| §2 | Product context | [02](issues/02-participant-lobby-and-lifecycle.md); README common gate |
| §3 | Frontend goals | [08](issues/08-reconnect-and-state-recovery.md), [24](issues/24-performance-and-safe-observability.md); README common gate |
| §4 | Non-goals | README common gate |
| §5 | Target users | [02](issues/02-participant-lobby-and-lifecycle.md), [09](issues/09-admin-dashboard-and-navigation.md), [10](issues/10-admin-event-management.md), [11](issues/11-admin-rounds-and-pattern-configuration.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md), [15](issues/15-admin-round-live-operations.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md), [21](issues/21-public-live-display.md) |
| §6 | Technology stack | [01](issues/01-application-authentication-and-role-routing.md) |
| §7 | Frontend architecture | [01](issues/01-application-authentication-and-role-routing.md); README common gate |
| §8 | Repository structure | [01](issues/01-application-authentication-and-role-routing.md); README common gate |
| §9 | Route architecture | [01](issues/01-application-authentication-and-role-routing.md), [02](issues/02-participant-lobby-and-lifecycle.md), [09](issues/09-admin-dashboard-and-navigation.md), [10](issues/10-admin-event-management.md), [11](issues/11-admin-rounds-and-pattern-configuration.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md), [18](issues/18-admin-winners-and-audit.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md), [21](issues/21-public-live-display.md) |
| §10 | Authentication UX | [01](issues/01-application-authentication-and-role-routing.md), [08](issues/08-reconnect-and-state-recovery.md), [19](issues/19-super-admin-account-management.md) |
| §11 | Participant UX | [02](issues/02-participant-lobby-and-lifecycle.md) |
| §12 | Lobby | [02](issues/02-participant-lobby-and-lifecycle.md) |
| §13 | Game screen | [03](issues/03-persistent-mobile-ticket.md), [04](issues/04-live-draw-feed-and-reveal.md) |
| §14 | Question/key distinction | [04](issues/04-live-draw-feed-and-reveal.md) |
| §15 | Ticket component | [03](issues/03-persistent-mobile-ticket.md), [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md), [07](issues/07-participant-winners-and-results.md) |
| §16 | Ticket-specific functional requirements | [03](issues/03-persistent-mobile-ticket.md), [05](issues/05-server-confirmed-marking.md) |
| §17 | Pending/optimistic policy | [05](issues/05-server-confirmed-marking.md) |
| §18 | Draw reveal | [04](issues/04-live-draw-feed-and-reveal.md) |
| §19 | GSAP | [04](issues/04-live-draw-feed-and-reveal.md), [07](issues/07-participant-winners-and-results.md), [21](issues/21-public-live-display.md), [23](issues/23-accessibility-responsive-browser-validation.md), [24](issues/24-performance-and-safe-observability.md) |
| §20 | WebSocket architecture | [04](issues/04-live-draw-feed-and-reveal.md), [08](issues/08-reconnect-and-state-recovery.md), [21](issues/21-public-live-display.md) |
| §21 | Reconnection | [08](issues/08-reconnect-and-state-recovery.md), [21](issues/21-public-live-display.md) |
| §22 | State management | [01](issues/01-application-authentication-and-role-routing.md), [04](issues/04-live-draw-feed-and-reveal.md), [06](issues/06-participant-claims-and-status.md), [08](issues/08-reconnect-and-state-recovery.md), [09](issues/09-admin-dashboard-and-navigation.md); README common gate |
| §23 | Data model | [03](issues/03-persistent-mobile-ticket.md), [04](issues/04-live-draw-feed-and-reveal.md); README common gate |
| §24 | API integration | [01](issues/01-application-authentication-and-role-routing.md), [04](issues/04-live-draw-feed-and-reveal.md); README common gate |
| §25 | Error handling | [01](issues/01-application-authentication-and-role-routing.md), [02](issues/02-participant-lobby-and-lifecycle.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [08](issues/08-reconnect-and-state-recovery.md), [09](issues/09-admin-dashboard-and-navigation.md), [10](issues/10-admin-event-management.md), [11](issues/11-admin-rounds-and-pattern-configuration.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md), [14](issues/14-participant-csv-onboarding.md), [15](issues/15-admin-round-live-operations.md), [16](issues/16-admin-random-and-manual-draws.md), [17](issues/17-admin-claim-adjudication.md), [18](issues/18-admin-winners-and-audit.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md), [21](issues/21-public-live-display.md); README common gate |
| §26 | Claim UX | [06](issues/06-participant-claims-and-status.md) |
| §27 | Winning Pattern UI | [06](issues/06-participant-claims-and-status.md), [11](issues/11-admin-rounds-and-pattern-configuration.md) |
| §28 | Winner experience | [07](issues/07-participant-winners-and-results.md), [21](issues/21-public-live-display.md) |
| §29 | Admin dashboard | [09](issues/09-admin-dashboard-and-navigation.md), [15](issues/15-admin-round-live-operations.md), [17](issues/17-admin-claim-adjudication.md), [20](issues/20-super-admin-system-and-recovery.md) |
| §30 | Admin navigation | [09](issues/09-admin-dashboard-and-navigation.md), [10](issues/10-admin-event-management.md), [11](issues/11-admin-rounds-and-pattern-configuration.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md), [15](issues/15-admin-round-live-operations.md), [18](issues/18-admin-winners-and-audit.md), [19](issues/19-super-admin-account-management.md) |
| §31 | Questions/Keys | [12](issues/12-admin-questions-and-keys.md) |
| §32 | Participant management/import | [13](issues/13-admin-participant-management.md), [14](issues/14-participant-csv-onboarding.md) |
| §33 | Draw controls | [15](issues/15-admin-round-live-operations.md), [16](issues/16-admin-random-and-manual-draws.md) |
| §34 | Manual Draw | [16](issues/16-admin-random-and-manual-draws.md) |
| §35 | Claims administration | [17](issues/17-admin-claim-adjudication.md) |
| §36 | Live display | [21](issues/21-public-live-display.md) |
| §37 | Display responsiveness | [21](issues/21-public-live-display.md), [23](issues/23-accessibility-responsive-browser-validation.md) |
| §38 | Responsive design | [03](issues/03-persistent-mobile-ticket.md), [05](issues/05-server-confirmed-marking.md), [21](issues/21-public-live-display.md), [23](issues/23-accessibility-responsive-browser-validation.md); README common gate |
| §39 | Touch requirements | [03](issues/03-persistent-mobile-ticket.md), [05](issues/05-server-confirmed-marking.md), [23](issues/23-accessibility-responsive-browser-validation.md); README common gate |
| §40 | Accessibility | [03](issues/03-persistent-mobile-ticket.md), [23](issues/23-accessibility-responsive-browser-validation.md); README common gate |
| §41 | Performance | [24](issues/24-performance-and-safe-observability.md) |
| §42 | Real-time performance | [04](issues/04-live-draw-feed-and-reveal.md), [16](issues/16-admin-random-and-manual-draws.md), [24](issues/24-performance-and-safe-observability.md) |
| §43 | Caching | [03](issues/03-persistent-mobile-ticket.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [08](issues/08-reconnect-and-state-recovery.md), [24](issues/24-performance-and-safe-observability.md); README common gate |
| §44 | Poor network/offline | [05](issues/05-server-confirmed-marking.md), [08](issues/08-reconnect-and-state-recovery.md); README common gate |
| §45 | Security | [01](issues/01-application-authentication-and-role-routing.md), [10](issues/10-admin-event-management.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md), [14](issues/14-participant-csv-onboarding.md), [18](issues/18-admin-winners-and-audit.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md), [21](issues/21-public-live-display.md), [22](issues/22-critical-flow-and-authorization-e2e.md); README common gate |
| §46 | Anti-cheat | [21](issues/21-public-live-display.md), [22](issues/22-critical-flow-and-authorization-e2e.md); README common gate |
| §47 | Browser support | [23](issues/23-accessibility-responsive-browser-validation.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §48 | Loading | [01](issues/01-application-authentication-and-role-routing.md), [02](issues/02-participant-lobby-and-lifecycle.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [09](issues/09-admin-dashboard-and-navigation.md), [10](issues/10-admin-event-management.md), [11](issues/11-admin-rounds-and-pattern-configuration.md), [12](issues/12-admin-questions-and-keys.md), [13](issues/13-admin-participant-management.md), [14](issues/14-participant-csv-onboarding.md), [15](issues/15-admin-round-live-operations.md), [16](issues/16-admin-random-and-manual-draws.md), [17](issues/17-admin-claim-adjudication.md), [18](issues/18-admin-winners-and-audit.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md); README common gate |
| §49 | Notifications | [04](issues/04-live-draw-feed-and-reveal.md), [05](issues/05-server-confirmed-marking.md), [06](issues/06-participant-claims-and-status.md), [07](issues/07-participant-winners-and-results.md), [17](issues/17-admin-claim-adjudication.md), [21](issues/21-public-live-display.md); README common gate |
| §50 | Formal functional requirements | [01](issues/01-application-authentication-and-role-routing.md), [06](issues/06-participant-claims-and-status.md), [09](issues/09-admin-dashboard-and-navigation.md), [22](issues/22-critical-flow-and-authorization-e2e.md); README common gate |
| §51 | Non-functional requirements | [24](issues/24-performance-and-safe-observability.md); README common gate |
| §52 | Testing | [08](issues/08-reconnect-and-state-recovery.md), [22](issues/22-critical-flow-and-authorization-e2e.md), [23](issues/23-accessibility-responsive-browser-validation.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §53 | Acceptance criteria | [03](issues/03-persistent-mobile-ticket.md), [06](issues/06-participant-claims-and-status.md), [07](issues/07-participant-winners-and-results.md), [12](issues/12-admin-questions-and-keys.md), [16](issues/16-admin-random-and-manual-draws.md), [17](issues/17-admin-claim-adjudication.md), [21](issues/21-public-live-display.md), [22](issues/22-critical-flow-and-authorization-e2e.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §54 | Definition of Done | [08](issues/08-reconnect-and-state-recovery.md), [10](issues/10-admin-event-management.md), [11](issues/11-admin-rounds-and-pattern-configuration.md), [14](issues/14-participant-csv-onboarding.md), [15](issues/15-admin-round-live-operations.md), [19](issues/19-super-admin-account-management.md), [20](issues/20-super-admin-system-and-recovery.md), [22](issues/22-critical-flow-and-authorization-e2e.md), [23](issues/23-accessibility-responsive-browser-validation.md), [24](issues/24-performance-and-safe-observability.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §55 | Deployment architecture | [25](issues/25-deployment-and-event-release-rehearsal.md) |
| §56 | Environment | [01](issues/01-application-authentication-and-role-routing.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §57 | Observability | [18](issues/18-admin-winners-and-audit.md), [20](issues/20-super-admin-system-and-recovery.md), [24](issues/24-performance-and-safe-observability.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §58 | UX state matrix | [02](issues/02-participant-lobby-and-lifecycle.md), [04](issues/04-live-draw-feed-and-reveal.md), [07](issues/07-participant-winners-and-results.md), [08](issues/08-reconnect-and-state-recovery.md), [15](issues/15-admin-round-live-operations.md) |
| §59 | Frontend invariants | [05](issues/05-server-confirmed-marking.md), [08](issues/08-reconnect-and-state-recovery.md), [15](issues/15-admin-round-live-operations.md), [16](issues/16-admin-random-and-manual-draws.md), [22](issues/22-critical-flow-and-authorization-e2e.md); README common gate |
| §60 | UI components | [01](issues/01-application-authentication-and-role-routing.md), [09](issues/09-admin-dashboard-and-navigation.md), [21](issues/21-public-live-display.md); README common gate |
| §61 | Visual direction | [23](issues/23-accessibility-responsive-browser-validation.md); README common gate |
| §62 | Animation direction | [04](issues/04-live-draw-feed-and-reveal.md), [07](issues/07-participant-winners-and-results.md), [21](issues/21-public-live-display.md), [23](issues/23-accessibility-responsive-browser-validation.md), [24](issues/24-performance-and-safe-observability.md); README common gate |
| §63 | Mobile-first priority | [02](issues/02-participant-lobby-and-lifecycle.md), [03](issues/03-persistent-mobile-ticket.md), [07](issues/07-participant-winners-and-results.md) |
| §64 | Milestones | [01](issues/01-application-authentication-and-role-routing.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §65 | Final architecture | [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §66 | Engineering principles | [08](issues/08-reconnect-and-state-recovery.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |
| §67 | MVP release gate | [22](issues/22-critical-flow-and-authorization-e2e.md), [25](issues/25-deployment-and-event-release-rehearsal.md); README common gate |

## Route coverage

| Route group | Owner |
|---|---|
| /login; protected-role redirects and logout | 01 |
| /participant; /participant/lobby | 02 |
| /participant/ticket | 03 |
| /participant/game | 03–08 |
| /participant/claims | 06 |
| /participant/results | 07 |
| /admin | 09 |
| /admin/event | 10 |
| /admin/rounds | 11, 15 |
| /admin/questions | 12 |
| /admin/participants | 13, 14 |
| /admin/draw | 16 |
| /admin/claims | 17 |
| /admin/winners; /admin/audit | 18 |
| /admin/administrators | 19 |
| /admin/settings (example Super Admin route) | 20; implementation fixes one supported route |
| /admin/event/configuration (PRD example) | 10; alias/detail only if it adds a real need |
| /display; /display/round; /display/winner | 21 |

## Contract gaps and release gates

- G01 exact winning-cell evidence blocks ticket 07; generic winner rendering is only partial fulfillment of §28.
- G02 complete Question/Key search/filter/status semantics block ticket 12.
- G03 Participant Ticket identifier/import-status semantics block ticket 13.
- G04–G07 record resolved presentation boundaries and conditional capabilities; they must not become invented APIs.
- Tickets 22–25 verify PRD §§52–54 and §67 against real backend and device/deployment evidence. An absent contract, pending hardware check or failed feature gate is still a release blocker.

