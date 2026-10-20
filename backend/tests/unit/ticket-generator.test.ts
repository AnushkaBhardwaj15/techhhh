import { describe, expect, it } from 'bun:test';
import {
  createSeededRng,
  generateTicketLayout,
  validateTicketLayout,
  type TicketKey,
} from '../../src/modules/tickets/ticket.domain.ts';
import { ValidationError } from '../../src/shared/errors/index.ts';

function createMockKeys(count: number, prefix: string = 'KEY'): TicketKey[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `key-uuid-${i + 1}`,
    value: `${prefix}_${i + 1}`,
  }));
}

describe('Ticket Generator Domain', () => {
  it('TestTicketGenerator_validTraditionalLayout: generates a valid 3x9 layout spanning 9 columns', () => {
    const keys = createMockKeys(20);
    const layout = generateTicketLayout({ keys, seed: 'tombola-seed-1' });

    expect(layout.populatedCount).toBe(15);
    expect(layout.emptyCount).toBe(12);
    expect(layout.cells).toHaveLength(15);

    // Verify coordinates
    for (const cell of layout.cells) {
      expect(cell.rowIndex).toBeGreaterThanOrEqual(0);
      expect(cell.rowIndex).toBeLessThanOrEqual(2);
      expect(cell.colIndex).toBeGreaterThanOrEqual(0);
      expect(cell.colIndex).toBeLessThanOrEqual(8);
      expect(cell.keyId).toBeDefined();
      expect(cell.keyValue).toBeDefined();
    }

    // Verify all 9 columns are represented
    const cols = new Set(layout.cells.map((c) => c.colIndex));
    expect(cols.size).toBe(9);
  });

  it('TestTicketGenerator_exactly15Cells: produces exactly 15 populated cells', () => {
    const keys = createMockKeys(15);
    const layout = generateTicketLayout({ keys });
    expect(layout.cells).toHaveLength(15);
    expect(layout.populatedCount).toBe(15);
    expect(layout.emptyCount).toBe(12);
  });

  it('TestTicketGenerator_fiveCellsPerRow: produces exactly 5 cells per row for row 0, 1, 2', () => {
    const keys = createMockKeys(30);
    const layout = generateTicketLayout({ keys, seed: 42 });

    const row0 = layout.cells.filter((c) => c.rowIndex === 0);
    const row1 = layout.cells.filter((c) => c.rowIndex === 1);
    const row2 = layout.cells.filter((c) => c.rowIndex === 2);

    expect(row0).toHaveLength(5);
    expect(row1).toHaveLength(5);
    expect(row2).toHaveLength(5);
  });

  it('TestTicketGenerator_noDuplicateKeys: ensures all 15 cells have distinct key IDs and values', () => {
    const keys = createMockKeys(25);
    const layout = generateTicketLayout({ keys, seed: 'unique-keys-test' });

    const keyIds = new Set(layout.cells.map((c) => c.keyId));
    const keyValues = new Set(layout.cells.map((c) => c.keyValue));

    expect(keyIds.size).toBe(15);
    expect(keyValues.size).toBe(15);
  });

  it('TestTicketGenerator_insufficientKeyPool: rejects key pool with fewer than 15 keys', () => {
    const keys = createMockKeys(14);
    expect(() => generateTicketLayout({ keys })).toThrow(ValidationError);
    expect(() => generateTicketLayout({ keys })).toThrow(/requires at least 15 eligible keys/);
  });

  it('rejects duplicate keys in pool when effective unique count is under 15', () => {
    const keys = [
      ...createMockKeys(10),
      ...createMockKeys(10), // duplicate IDs
    ];
    expect(() => generateTicketLayout({ keys })).toThrow(ValidationError);
    expect(() => generateTicketLayout({ keys })).toThrow(/at least 15 unique eligible keys/);
  });

  it('deterministic seeded generation produces identical layout for the same seed', () => {
    const keys = createMockKeys(30);
    const layout1 = generateTicketLayout({ keys, seed: 'test-seed-xyz' });
    const layout2 = generateTicketLayout({ keys, seed: 'test-seed-xyz' });

    expect(layout1.cells).toEqual(layout2.cells);
  });

  it('different seeds produce different layouts or key allocations', () => {
    const keys = createMockKeys(30);
    const layout1 = generateTicketLayout({ keys, seed: 'seed-alpha' });
    const layout2 = generateTicketLayout({ keys, seed: 'seed-beta' });

    expect(layout1.cells).not.toEqual(layout2.cells);
  });

  it('structural invariants hold across 50 randomly seeded ticket generations', () => {
    const keys = createMockKeys(50);

    for (let i = 0; i < 50; i++) {
      const layout = generateTicketLayout({ keys, seed: `fuzz-seed-${i}` });

      expect(layout.cells).toHaveLength(15);
      expect(layout.populatedCount).toBe(15);
      expect(layout.emptyCount).toBe(12);

      const rowCounts = [0, 0, 0];
      const colUsage = new Set<number>();
      const keyIds = new Set<string>();
      const positions = new Set<string>();

      for (const cell of layout.cells) {
        rowCounts[cell.rowIndex]++;
        colUsage.add(cell.colIndex);
        keyIds.add(cell.keyId);
        positions.add(`${cell.rowIndex}:${cell.colIndex}`);
      }

      expect(rowCounts[0]).toBe(5);
      expect(rowCounts[1]).toBe(5);
      expect(rowCounts[2]).toBe(5);
      expect(colUsage.size).toBe(9);
      expect(keyIds.size).toBe(15);
      expect(positions.size).toBe(15);
    }
  });

  it('validateTicketLayout rejects invalid layouts', () => {
    const keys = createMockKeys(15);
    const valid = generateTicketLayout({ keys, seed: 'valid' });

    // Too few cells
    expect(() => validateTicketLayout(valid.cells.slice(0, 14))).toThrow(ValidationError);

    // Duplicate position
    const duplicatePos = [...valid.cells];
    duplicatePos[1] = { ...duplicatePos[0]! };
    expect(() => validateTicketLayout(duplicatePos)).toThrow(ValidationError);

    // Duplicate key
    const duplicateKey = [...valid.cells];
    duplicateKey[1] = {
      ...duplicateKey[1]!,
      keyId: duplicateKey[0]!.keyId,
      keyValue: duplicateKey[0]!.keyValue,
    };
    expect(() => validateTicketLayout(duplicateKey)).toThrow(ValidationError);
  });
});
