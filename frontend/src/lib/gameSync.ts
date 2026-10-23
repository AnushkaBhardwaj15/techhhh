export interface ActiveDrawRecord {
  id: string;
  sequenceNumber: number;
  questionId: number;
  prompt: string;
  answer: string;
  key: string;
  domain: string;
  drawnAt: string;
}

export interface ActiveClaimRecord {
  id: string;
  patternType: 'EARLY_5' | 'TOP_LINE' | 'MIDDLE_LINE' | 'BOTTOM_LINE' | 'FULL_HOUSE';
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  userId: string;
  userName?: string;
  ticketId?: string;
  claimedAt: string;
}

export interface SyncGameRecord {
  id: string;
  name: string;
  code: string;
  status: 'DRAFT' | 'READY' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  qrUrl?: string;
  createdAt: string;
  roundSequence: number;
  draws?: ActiveDrawRecord[];
  claims?: ActiveClaimRecord[];
}

const DEFAULT_SEED_GAME: SyncGameRecord = {
  id: 'a1b2c3d4-e5f6-47a8-b9c0-112233445566',
  name: 'Tech Tombola - Tournament Round 1',
  code: '8679DE',
  status: 'READY',
  createdAt: '2026-10-23T10:00:00Z',
  roundSequence: 1,
  draws: [],
  claims: [],
};

// Cross-tab broadcast channel
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('tech_tombola_sync_channel');
  }
} catch {
  // ignore
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export async function fetchActiveGame(): Promise<{ game: SyncGameRecord; games: SyncGameRecord[] }> {
  // Try /api/v1/active-game then /api/active-game
  const endpoints = [`${API_BASE}/api/v1/active-game`, `${API_BASE}/api/active-game`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data?.game?.code) {
          // Cache locally as fallback
          localStorage.setItem('tt_current_active_game', JSON.stringify(data.game));
          if (Array.isArray(data.games)) {
            localStorage.setItem('tt_admin_games', JSON.stringify(data.games));
          }
          return data;
        }
      }
    } catch {
      // try next
    }
  }

  // Fallback to local storage
  try {
    const cached = localStorage.getItem('tt_current_active_game');
    if (cached) {
      const game = JSON.parse(cached);
      const allGames = JSON.parse(localStorage.getItem('tt_admin_games') || '[]');
      return { game, games: allGames.length > 0 ? allGames : [game] };
    }
  } catch {
    // ignore
  }

  return { game: DEFAULT_SEED_GAME, games: [DEFAULT_SEED_GAME] };
}

export async function postActiveGame(game: Partial<SyncGameRecord> & { code: string }): Promise<SyncGameRecord> {
  const cleanCode = String(game.code).trim().toUpperCase();
  const payload: SyncGameRecord = {
    id: game.id || crypto.randomUUID(),
    name: game.name || `Tech Tombola - Game #${cleanCode}`,
    code: cleanCode,
    status: game.status || 'ACTIVE',
    qrUrl: game.qrUrl,
    createdAt: game.createdAt || new Date().toISOString(),
    roundSequence: game.roundSequence || 1,
  };

  // 1. Broadcast locally & localStorage
  try {
    localStorage.setItem('tt_current_active_game', JSON.stringify(payload));
    const all = JSON.parse(localStorage.getItem('tt_admin_games') || '[]');
    const existingIdx = all.findIndex((g: SyncGameRecord) => g.id === payload.id || g.code === cleanCode);
    if (existingIdx >= 0) all[existingIdx] = payload;
    else all.unshift(payload);
    localStorage.setItem('tt_admin_games', JSON.stringify(all));

    broadcastChannel?.postMessage({ type: 'GAME_UPDATED', game: payload });
  } catch {
    // ignore
  }

  // 2. Post to backend server for Incognito & cross-browser synchronization
  const endpoints = [`${API_BASE}/api/v1/active-game`, `${API_BASE}/api/active-game`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.game) return data.game;
      }
    } catch {
      // try next
    }
  }

  return payload;
}

export async function postGameStatus(id: string, status: SyncGameRecord['status']): Promise<void> {
  // 1. Update local storage & broadcast
  try {
    const cached = localStorage.getItem('tt_current_active_game');
    if (cached) {
      const g = JSON.parse(cached);
      g.status = status;
      localStorage.setItem('tt_current_active_game', JSON.stringify(g));
      broadcastChannel?.postMessage({ type: 'STATUS_UPDATED', status, gameId: id });
    }
  } catch {
    // ignore
  }

  // 2. Update server
  const endpoints = [`${API_BASE}/api/v1/active-game`, `${API_BASE}/api/active-game`];
  for (const url of endpoints) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  }
}

export async function validateGameCode(
  enteredCode: string,
  assignedTicketCode?: string
): Promise<{ valid: boolean; activeGame: SyncGameRecord; matchedCode: string; message?: string }> {
  const clean = enteredCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 6) {
    return {
      valid: false,
      activeGame: DEFAULT_SEED_GAME,
      matchedCode: clean,
      message: 'Please enter all 6 characters of the game code.',
    };
  }

  // Always fetch latest state from server to guarantee sync across Incognito / separate windows
  const { game, games } = await fetchActiveGame();

  const validCodes = new Set<string>();
  if (game?.code) validCodes.add(game.code.toUpperCase());
  if (Array.isArray(games)) {
    games.forEach((g) => {
      if (g.code) validCodes.add(g.code.toUpperCase());
    });
  }
  if (assignedTicketCode) {
    validCodes.add(assignedTicketCode.trim().toUpperCase());
  }
  validCodes.add('8679DE');

  // Also check localStorage from admin
  try {
    const stored = localStorage.getItem('tt_admin_games');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        parsed.forEach((g) => {
          if (g.code) validCodes.add(g.code.toUpperCase());
        });
      }
    }
  } catch {
    // ignore
  }

  const matches = validCodes.has(clean);
  if (!matches) {
    return {
      valid: false,
      activeGame: game,
      matchedCode: clean,
      message: `Invalid ticket code "${clean}". This code does not match your assigned ticket for this round. Please check your code and try again.`,
    };
  }

  return {
    valid: true,
    activeGame: game,
    matchedCode: clean,
  };
}

export function subscribeToGameSync(callback: (game: SyncGameRecord) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.game) {
      callback(event.data.game);
    }
  };

  broadcastChannel?.addEventListener('message', handler);

  // Poll every 1500ms to guarantee cross-window / Incognito sync
  const interval = setInterval(async () => {
    const { game } = await fetchActiveGame();
    if (game) callback(game);
  }, 1500);

  return () => {
    broadcastChannel?.removeEventListener('message', handler);
    clearInterval(interval);
  };
}

export async function postQuestionDraw(drawInput: {
  questionId: number;
  prompt: string;
  answer: string;
  key: string;
  domain: string;
}): Promise<ActiveDrawRecord> {
  const newDraw: ActiveDrawRecord = {
    id: crypto.randomUUID(),
    sequenceNumber: Date.now(),
    questionId: drawInput.questionId,
    prompt: drawInput.prompt,
    answer: drawInput.answer,
    key: drawInput.key.toUpperCase(),
    domain: drawInput.domain,
    drawnAt: new Date().toISOString(),
  };

  // Broadcast locally
  try {
    broadcastChannel?.postMessage({ type: 'DRAW_CALLED', draw: newDraw });
  } catch {
    // ignore
  }

  // Post to backend
  const endpoints = [`${API_BASE}/api/v1/active-game/draw`, `${API_BASE}/api/active-game/draw`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(drawInput),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.draw) return data.draw;
      }
    } catch {
      // try next
    }
  }
  return newDraw;
}

export async function postActiveClaim(claimInput: {
  patternType: ActiveClaimRecord['patternType'];
  userId: string;
  userName?: string;
  ticketId?: string;
}): Promise<ActiveClaimRecord> {
  const newClaim: ActiveClaimRecord = {
    id: crypto.randomUUID(),
    patternType: claimInput.patternType,
    status: 'VERIFIED',
    userId: claimInput.userId,
    userName: claimInput.userName || 'Participant',
    ticketId: claimInput.ticketId,
    claimedAt: new Date().toISOString(),
  };

  try {
    broadcastChannel?.postMessage({ type: 'CLAIM_SUBMITTED', claim: newClaim });
  } catch {
    // ignore
  }

  const endpoints = [`${API_BASE}/api/v1/active-game/claim`, `${API_BASE}/api/active-game/claim`];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claimInput),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.claim) return data.claim;
      }
    } catch {
      // try next
    }
  }
  return newClaim;
}

export async function postResetActiveGame(): Promise<void> {
  try {
    broadcastChannel?.postMessage({ type: 'GAME_RESET' });
  } catch {
    // ignore
  }

  const endpoints = [`${API_BASE}/api/v1/active-game/reset`, `${API_BASE}/api/active-game/reset`];
  for (const url of endpoints) {
    try {
      await fetch(url, { method: 'POST', credentials: 'include' });
    } catch {
      // try next
    }
  }
}
