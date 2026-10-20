# Runtime route coverage

Generated from Fastify route registration. 68 declared operations/channels; implicit HEAD and CORS OPTIONS aliases are excluded.

| Registered operation | Access class | Auth checks | Owner/Event scope evidence |
|---|---|---|---|
| `DELETE /api/v1/admin/questions/:id` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `DELETE /api/v1/participant/tickets/:ticketId/marks/:cellId` | participant | 401 unauthenticated; 403 wrong role | session-owned Ticket/Cell and cross-Event Round 404 — ticket + mark-persistence integration tests |
| `DELETE /api/v1/super-admin/admins/:id` | super-admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/admin/audit` | admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/admin/claims` | admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/admin/dashboard` | admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/admin/events` | admin | 401 unauthenticated; 403 wrong role | Event resources are global Admin records — event integration tests |
| `GET /api/v1/admin/events/:id` | admin | 401 unauthenticated; 403 wrong role | Event resources are global Admin records — event integration tests |
| `GET /api/v1/admin/keys` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `GET /api/v1/admin/keys/:id` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `GET /api/v1/admin/participants` | admin | 401 unauthenticated; 403 wrong role | Event-scoped participant Profiles — participant + admin integration tests |
| `GET /api/v1/admin/participants/:id` | admin | 401 unauthenticated; 403 wrong role | Event-scoped participant Profiles — participant + admin integration tests |
| `GET /api/v1/admin/questions` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `GET /api/v1/admin/questions/:id` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `GET /api/v1/admin/rounds` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `GET /api/v1/admin/rounds/:id` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `GET /api/v1/admin/rounds/:id/draws` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `GET /api/v1/admin/rounds/:id/tickets` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `GET /api/v1/admin/winners` | admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/live/draws` | public | public access | Public endpoint or public WebSocket channel |
| `GET /api/v1/live/event` | public | public access | Public endpoint or public WebSocket channel |
| `GET /api/v1/live/round` | public | public access | Public endpoint or public WebSocket channel |
| `GET /api/v1/live/winners` | public | public access | Public endpoint or public WebSocket channel |
| `GET /api/v1/live/ws [websocket]` | public | public access | Public endpoint or public WebSocket channel |
| `GET /api/v1/me` | authenticated | 401 unauthenticated | authenticated identity — auth integration tests |
| `GET /api/v1/participant/claims` | participant | 401 unauthenticated; 403 wrong role | session-owned Claims/Winners, cross-Event claim 404, and Event isolation — claim-submission integration tests |
| `GET /api/v1/participant/draws` | participant | 401 unauthenticated; 403 wrong role | session-derived Event Draw history, cross-Event Round 404, and paginated future-Key exclusion — draw-engine integration tests |
| `GET /api/v1/participant/event` | participant | 401 unauthenticated; 403 wrong role | session-derived Event/Round — participant + round-operation integration tests |
| `GET /api/v1/participant/round/current` | participant | 401 unauthenticated; 403 wrong role | session-derived Event/Round — participant + round-operation integration tests |
| `GET /api/v1/participant/ticket` | participant | 401 unauthenticated; 403 wrong role | session-owned Ticket/Cell and cross-Event Round 404 — ticket + mark-persistence integration tests |
| `GET /api/v1/participant/wins` | participant | 401 unauthenticated; 403 wrong role | session-owned Claims/Winners, cross-Event claim 404, and Event isolation — claim-submission integration tests |
| `GET /api/v1/ping` | public | public access | Public endpoint or public WebSocket channel |
| `GET /api/v1/super-admin/admins` | super-admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/super-admin/admins/:id` | super-admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/super-admin/system` | super-admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `GET /api/v1/ws [websocket]` | authenticated | 401 unauthenticated | session and Event/Round subscription — realtime route integration tests |
| `GET /health` | public | public access | Public endpoint or public WebSocket channel |
| `GET /ready` | public | public access | Public endpoint or public WebSocket channel |
| `PATCH /api/v1/admin/events/:id` | admin | 401 unauthenticated; 403 wrong role | Event resources are global Admin records — event integration tests |
| `PATCH /api/v1/admin/keys/:id` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `PATCH /api/v1/admin/participants/:id` | admin | 401 unauthenticated; 403 wrong role | Event-scoped participant Profiles — participant + admin integration tests |
| `PATCH /api/v1/admin/questions/:id` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `PATCH /api/v1/admin/rounds/:id` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `PATCH /api/v1/super-admin/admins/:id` | super-admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `POST /api/v1/admin/claims/:id/reject` | admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `POST /api/v1/admin/claims/:id/verify` | admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |
| `POST /api/v1/admin/events` | admin | 401 unauthenticated; 403 wrong role | Event resources are global Admin records — event integration tests |
| `POST /api/v1/admin/keys` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `POST /api/v1/admin/participants` | admin | 401 unauthenticated; 403 wrong role | Event-scoped participant Profiles — participant + admin integration tests |
| `POST /api/v1/admin/participants/import` | admin | 401 unauthenticated; 403 wrong role | Event-scoped participant Profiles — participant + admin integration tests |
| `POST /api/v1/admin/questions` | admin | 401 unauthenticated; 403 wrong role | cross-Event Key/Question association — question integration tests |
| `POST /api/v1/admin/rounds` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/cancel` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/complete` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/draws` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/draws/manual` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/pause` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/ready` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/recover` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/resume` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/start` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/admin/rounds/:id/tickets/generate` | admin | 401 unauthenticated; 403 wrong role | Round/Event relation and Draw scope — round-operation + draw-engine integration tests |
| `POST /api/v1/auth/bootstrap-super-admin` | public | public access | Public endpoint or public WebSocket channel |
| `POST /api/v1/auth/login` | public | public access | Public endpoint or public WebSocket channel |
| `POST /api/v1/auth/logout` | public | public access | Public endpoint or public WebSocket channel |
| `POST /api/v1/participant/claims` | participant | 401 unauthenticated; 403 wrong role | session-owned Claims/Winners, cross-Event claim 404, and Event isolation — claim-submission integration tests |
| `POST /api/v1/participant/tickets/:ticketId/marks` | participant | 401 unauthenticated; 403 wrong role | session-owned Ticket/Cell and cross-Event Round 404 — ticket + mark-persistence integration tests |
| `POST /api/v1/super-admin/admins` | super-admin | 401 unauthenticated; 403 wrong role | N/A — role-global administrator operation |

Scenario suite: `bun run test:security`. Role checks run against every protected route; object ownership and Event boundaries are exercised by the named integration suites for scoped resources. `N/A` means the resource is intentionally global and has no per-Participant owner boundary.
