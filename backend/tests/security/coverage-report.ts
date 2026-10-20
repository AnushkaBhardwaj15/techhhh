export function routeAccess(entry: string): 'public' | 'participant' | 'admin' | 'super-admin' | 'authenticated' {
  const route = entry.replace(/^\w+ /, '').replace(' [websocket]', '');
  if (route === '/api/v1/ws' || route === '/api/v1/me') return 'authenticated';
  if (route.startsWith('/api/v1/participant/')) return 'participant';
  if (route.startsWith('/api/v1/admin/')) return 'admin';
  if (route.startsWith('/api/v1/super-admin/')) return 'super-admin';
  return 'public';
}

function scopeEvidence(entry: string): string {
  if (entry.includes('/participant/ticket') || entry.includes('/participant/tickets/')) return 'session-owned Ticket/Cell and cross-Event Round 404 — ticket + mark-persistence integration tests';
  if (entry.includes('/participant/claims') || entry.includes('/participant/wins')) return 'session-owned Claims/Winners, cross-Event claim 404, and Event isolation — claim-submission integration tests';
  if (entry.includes('/participant/draws')) return 'session-derived Event Draw history, cross-Event Round 404, and paginated future-Key exclusion — draw-engine integration tests';
  if (entry.includes('/participant/event') || entry.includes('/participant/round/current')) return 'session-derived Event/Round — participant + round-operation integration tests';
  if (entry.includes('/api/v1/ws')) return 'session and Event/Round subscription — realtime route integration tests';
  if (entry.includes('/admin/participants')) return 'Event-scoped participant Profiles — participant + admin integration tests';
  if (entry.includes('/admin/questions') || entry.includes('/admin/keys')) return 'cross-Event Key/Question association — question integration tests';
  if (entry.includes('/admin/rounds')) return 'Round/Event relation and Draw scope — round-operation + draw-engine integration tests';
  if (entry.includes('/admin/events')) return 'Event resources are global Admin records — event integration tests';
  if (routeAccess(entry) === 'admin' || routeAccess(entry) === 'super-admin') return 'N/A — role-global administrator operation';
  if (entry.includes('/api/v1/me')) return 'authenticated identity — auth integration tests';
  return 'Public endpoint or public WebSocket channel';
}

export function renderRouteCoverageReport(entries: string[]): string {
  const rows = entries.map((entry) => {
    const access = routeAccess(entry);
    const auth = access === 'public' ? 'public access' : access === 'authenticated' ? '401 unauthenticated' : '401 unauthenticated; 403 wrong role';
    return `| \`${entry}\` | ${access} | ${auth} | ${scopeEvidence(entry)} |`;
  });
  return [
    '# Runtime route coverage',
    '',
    `Generated from Fastify route registration. ${entries.length} declared operations/channels; implicit HEAD and CORS OPTIONS aliases are excluded.`,
    '',
    '| Registered operation | Access class | Auth checks | Owner/Event scope evidence |',
    '|---|---|---|---|',
    ...rows,
    '',
    'Scenario suite: `bun run test:security`. Role checks run against every protected route; object ownership and Event boundaries are exercised by the named integration suites for scoped resources. `N/A` means the resource is intentionally global and has no per-Participant owner boundary.',
    '',
  ].join('\n');
}
