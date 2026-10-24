import { getSqlClient } from '../../db/client.ts';

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

export interface ActiveGameData {
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

// In-memory shared state for multi-browser / Incognito sync
let activeGameDraws: ActiveDrawRecord[] = [];
let activeGameClaims: ActiveClaimRecord[] = [];

let currentActiveGame: ActiveGameData = {
  id: 'a1b2c3d4-e5f6-47a8-b9c0-112233445566',
  name: 'Tech Tombola - Tournament Round 1',
  code: '8679DE',
  status: 'READY',
  createdAt: '2026-10-23T10:00:00Z',
  roundSequence: 1,
  draws: [],
  claims: [],
};

const allGamesList: ActiveGameData[] = [currentActiveGame];

// Synchronize with PostgreSQL database to ensure participant sees the SAME game and no stale old rounds
export async function syncDatabaseRounds(activeGame: ActiveGameData): Promise<void> {
  try {
    const sql = getSqlClient();
    // 1. Mark stale old test rounds as COMPLETED so participant never sees previous test rounds
    await sql`
      UPDATE rounds 
      SET status = 'COMPLETED' 
      WHERE status IN ('ACTIVE', 'PAUSED', 'READY', 'RECOVERY_REQUIRED') 
        AND id != ${activeGame.id}
    `;

    // 2. Upsert the current active game into all active events in the database
    const activeEvents = await sql`SELECT id FROM events WHERE status = 'LIVE'`;
    for (const ev of activeEvents) {
      const [seqRow] = await sql`SELECT COALESCE(MAX(sequence_number), 0) as "maxSeq" FROM rounds WHERE event_id = ${ev.id}`;
      const nextSeq = Number(seqRow?.maxSeq || 0) + 1;
      await sql`
        INSERT INTO rounds (id, event_id, sequence_number, name, status, created_at, updated_at)
        VALUES (${activeGame.id}, ${ev.id}, ${nextSeq}, ${activeGame.name}, ${activeGame.status}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = ${activeGame.name},
          status = ${activeGame.status},
          updated_at = NOW()
      `;
    }
  } catch (err) {
    // If database is not reachable, continue in-memory
    console.warn('Database round sync skipped (using in-memory store):', (err as Error)?.message || err);
  }
}

export function getSharedActiveGame(): ActiveGameData {
  return {
    ...currentActiveGame,
    draws: [...activeGameDraws],
    claims: [...activeGameClaims],
  };
}

export function getAllSharedGames(): ActiveGameData[] {
  return allGamesList.map((g) =>
    g.id === currentActiveGame.id
      ? { ...g, draws: [...activeGameDraws], claims: [...activeGameClaims] }
      : g
  );
}

export function setSharedActiveGame(game: Partial<ActiveGameData> & { code: string }): ActiveGameData {
  const cleanCode = String(game.code).trim().toUpperCase();
  const existingIdx = allGamesList.findIndex((g) => g.id === game.id || g.code === cleanCode);

  const isNewGame = existingIdx < 0 || allGamesList[existingIdx].id !== currentActiveGame.id;

  // Requirement 2: Whenever a new round or game is created, refresh both claims and questions called
  if (isNewGame) {
    activeGameDraws = [];
    activeGameClaims = [];
  }

  const updated: ActiveGameData = {
    id: game.id || (existingIdx >= 0 ? allGamesList[existingIdx].id : crypto.randomUUID()),
    name: game.name || `Tech Tombola - Game #${cleanCode}`,
    code: cleanCode,
    status: game.status || 'ACTIVE',
    qrUrl: game.qrUrl,
    createdAt: game.createdAt || new Date().toISOString(),
    roundSequence: game.roundSequence || allGamesList.length + 1,
    draws: [...activeGameDraws],
    claims: [...activeGameClaims],
  };

  currentActiveGame = updated;
  if (existingIdx >= 0) {
    allGamesList[existingIdx] = updated;
  } else {
    allGamesList.unshift(updated);
  }

  // Sync to database
  syncDatabaseRounds(updated).catch(() => {});

  return updated;
}

export function updateSharedGameStatus(idOrCode: string, status: ActiveGameData['status']): ActiveGameData | null {
  const clean = idOrCode.trim().toUpperCase();
  const game = allGamesList.find((g) => g.id === idOrCode || g.code === clean);
  if (game) {
    game.status = status;
    if (currentActiveGame.id === game.id || currentActiveGame.code === game.code) {
      currentActiveGame.status = status;
    }
    syncDatabaseRounds(currentActiveGame).catch(() => {});
    return { ...game, draws: [...activeGameDraws], claims: [...activeGameClaims] };
  }
  currentActiveGame.status = status;
  syncDatabaseRounds(currentActiveGame).catch(() => {});
  return { ...currentActiveGame, draws: [...activeGameDraws], claims: [...activeGameClaims] };
}

// Add a drawn question when admin calls a question
export function recordQuestionDraw(drawInput: {
  questionId: number;
  prompt: string;
  answer: string;
  key: string;
  domain: string;
}): ActiveDrawRecord {
  // Check if already drawn
  const existing = activeGameDraws.find((d) => d.questionId === drawInput.questionId || d.key === drawInput.key);
  if (existing) return existing;

  const newDraw: ActiveDrawRecord = {
    id: crypto.randomUUID(),
    sequenceNumber: activeGameDraws.length + 1,
    questionId: drawInput.questionId,
    prompt: drawInput.prompt,
    answer: drawInput.answer,
    key: drawInput.key.toUpperCase(),
    domain: drawInput.domain,
    drawnAt: new Date().toISOString(),
  };

  activeGameDraws.push(newDraw);
  return newDraw;
}

// Record participant claim for active round
export function recordActiveClaim(claimInput: {
  patternType: ActiveClaimRecord['patternType'];
  userId: string;
  userName?: string;
  ticketId?: string;
}): ActiveClaimRecord {
  const existing = activeGameClaims.find(
    (c) => c.patternType === claimInput.patternType && c.userId === claimInput.userId
  );
  if (existing) return existing;

  const newClaim: ActiveClaimRecord = {
    id: crypto.randomUUID(),
    patternType: claimInput.patternType,
    status: 'VERIFIED',
    userId: claimInput.userId,
    userName: claimInput.userName || 'Participant',
    ticketId: claimInput.ticketId,
    claimedAt: new Date().toISOString(),
  };

  activeGameClaims.push(newClaim);
  return newClaim;
}

// Reset draws and claims for next round (Requirement 2)
export function resetActiveGameData(): void {
  activeGameDraws = [];
  activeGameClaims = [];
}
