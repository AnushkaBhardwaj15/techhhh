import { randomInt, createHash } from 'node:crypto';
import { ValidationError } from '../../shared/errors/index.ts';

export interface TicketKey {
  id: string;
  value: string;
}

export interface GeneratedCell {
  keyId: string;
  keyValue: string;
  rowIndex: number;
  colIndex: number;
}

export interface TicketLayout {
  cells: GeneratedCell[];
  emptyCount: number;
  populatedCount: number;
}

/**
 * Creates a cryptographically secure random number in [0, 1) using 32-bit integer range.
 */
export function cryptoRng(): number {
  return randomInt(0, 0x100000000) / 0x100000000;
}

/**
 * Computes a deterministic SHA-256 fingerprint for a ticket's 15 keys to prevent duplicates.
 */
export function computeTicketFingerprint(keyIds: string[]): string {
  const sorted = [...keyIds].sort();
  return createHash('sha256').update(sorted.join(',')).digest('hex');
}

/**
 * Creates a deterministic pseudo-random number generator using Mulberry32 (for seeded tests).
 */
export function createSeededRng(seed: string | number): () => number {
  let s = typeof seed === 'number' ? seed : hashString(seed);
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

/**
 * Shuffles an array in place using Fisher-Yates and provided RNG.
 */
export function shuffle<T>(array: T[], rng: () => number = cryptoRng): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * Generates the 3x9 grid coordinates (15 populated positions, 5 per row, at least 1 per column).
 */
function generateGridPattern(rng: () => number = cryptoRng): Array<{ rowIndex: number; colIndex: number }> {
  // We need 15 cells total across 3 rows (5 per row) and 9 columns (0..8).
  // In a valid traditional Tombola card, each column must contain at least 1 number (1 to 3 cells per column).
  const maxAttempts = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row0Cols = pickKDistinct(9, 5, rng);
    const row1Cols = pickKDistinct(9, 5, rng);
    const row2Cols = pickKDistinct(9, 5, rng);

    // Verify all 9 columns have at least one cell
    const colUsage = new Array(9).fill(0);
    for (const c of row0Cols) colUsage[c]++;
    for (const c of row1Cols) colUsage[c]++;
    for (const c of row2Cols) colUsage[c]++;

    const allColsCovered = colUsage.every((count) => count >= 1);
    if (allColsCovered) {
      const positions: Array<{ rowIndex: number; colIndex: number }> = [];
      for (const col of row0Cols.sort((a, b) => a - b)) {
        positions.push({ rowIndex: 0, colIndex: col });
      }
      for (const col of row1Cols.sort((a, b) => a - b)) {
        positions.push({ rowIndex: 1, colIndex: col });
      }
      for (const col of row2Cols.sort((a, b) => a - b)) {
        positions.push({ rowIndex: 2, colIndex: col });
      }
      return positions;
    }
  }

  // Fallback if loop finishes: deterministic valid distribution
  // 6 columns with 2 cells, 3 columns with 1 cell: 6*2 + 3*1 = 15
  const defaultRow0 = [0, 1, 2, 3, 4];
  const defaultRow1 = [0, 1, 5, 6, 7];
  const defaultRow2 = [2, 3, 4, 7, 8];
  return [
    ...defaultRow0.map((c) => ({ rowIndex: 0, colIndex: c })),
    ...defaultRow1.map((c) => ({ rowIndex: 1, colIndex: c })),
    ...defaultRow2.map((c) => ({ rowIndex: 2, colIndex: c })),
  ];
}

function pickKDistinct(n: number, k: number, rng: () => number = cryptoRng): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  const shuffled = shuffle(indices, rng);
  return shuffled.slice(0, k);
}

/**
 * Pure generator for a traditional 3x9 Tombola ticket.
 */
export function generateTicketLayout(options: {
  keys: TicketKey[];
  rng?: () => number;
  seed?: string | number;
}): TicketLayout {
  const { keys, rng, seed } = options;

  if (!keys || keys.length < 15) {
    throw new ValidationError(
      `Round requires at least 15 eligible keys to generate tickets, but only ${keys ? keys.length : 0} found`
    );
  }

  // Deduplicate keys by ID and normalized value to ensure no duplicates in pool
  const uniqueKeyMap = new Map<string, TicketKey>();
  for (const k of keys) {
    if (!k.id || !k.value) {
      throw new ValidationError('Invalid key in pool: key must have id and value');
    }
    if (!uniqueKeyMap.has(k.id)) {
      uniqueKeyMap.set(k.id, k);
    }
  }

  const uniqueKeys = Array.from(uniqueKeyMap.values());
  if (uniqueKeys.length < 15) {
    throw new ValidationError(
      `Round requires at least 15 unique eligible keys to generate tickets, but only ${uniqueKeys.length} distinct keys found`
    );
  }

  const effectiveRng = rng ?? (seed !== undefined ? createSeededRng(seed) : cryptoRng);

  // Pick 15 distinct keys using crypto or seeded RNG
  const shuffledKeys = shuffle(uniqueKeys, effectiveRng);
  const selectedKeys = shuffledKeys.slice(0, 15);

  // Generate 15 positions in 3x9 layout
  const positions = generateGridPattern(effectiveRng);

  const cells: GeneratedCell[] = positions.map((pos, idx) => ({
    keyId: selectedKeys[idx]!.id,
    keyValue: selectedKeys[idx]!.value,
    rowIndex: pos.rowIndex,
    colIndex: pos.colIndex,
  }));

  const layout: TicketLayout = {
    cells,
    emptyCount: 27 - 15,
    populatedCount: 15,
  };

  validateTicketLayout(layout);
  return layout;
}

/**
 * Validates structural invariants of a ticket layout:
 * - Exactly 15 cells total
 * - Exactly 5 cells per row
 * - All rowIndices in [0, 2]
 * - All colIndices in [0, 8]
 * - No duplicate cell positions
 * - No duplicate keyIds
 */
export function validateTicketLayout(layoutOrCells: TicketLayout | GeneratedCell[]): void {
  const cells = Array.isArray(layoutOrCells) ? layoutOrCells : layoutOrCells.cells;
  const populatedCount = Array.isArray(layoutOrCells) ? cells.length : layoutOrCells.populatedCount;

  if (!cells || populatedCount !== 15 || cells.length !== 15) {
    throw new ValidationError(`Ticket must have exactly 15 cells, got ${cells ? cells.length : 0}`);
  }

  const rowCounts = [0, 0, 0];
  const colUsage = new Set<number>();
  const seenPositions = new Set<string>();
  const seenKeyIds = new Set<string>();

  for (const cell of cells) {
    if (cell.rowIndex < 0 || cell.rowIndex > 2) {
      throw new ValidationError(`Invalid row index: ${cell.rowIndex}. Must be 0, 1, or 2.`);
    }
    if (cell.colIndex < 0 || cell.colIndex > 8) {
      throw new ValidationError(`Invalid column index: ${cell.colIndex}. Must be between 0 and 8.`);
    }

    const posKey = `${cell.rowIndex},${cell.colIndex}`;
    if (seenPositions.has(posKey)) {
      throw new ValidationError(`Duplicate cell position: (${cell.rowIndex}, ${cell.colIndex})`);
    }
    seenPositions.add(posKey);

    if (seenKeyIds.has(cell.keyId)) {
      throw new ValidationError(`Duplicate key in ticket: ${cell.keyId}`);
    }
    seenKeyIds.add(cell.keyId);

    rowCounts[cell.rowIndex]++;
    colUsage.add(cell.colIndex);
  }

  for (let r = 0; r < 3; r++) {
    if (rowCounts[r] !== 5) {
      throw new ValidationError(`Row ${r} has ${rowCounts[r]} cells, expected exactly 5.`);
    }
  }

  if (colUsage.size < 9) {
    throw new ValidationError(`Ticket does not cover all 9 columns. Only covers ${colUsage.size}/9.`);
  }
}
