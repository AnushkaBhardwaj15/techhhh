import { describe, expect, it } from 'vitest';
import { participantTicketSchema } from './ticket';

const ticket = {
  id: 't1', roundId: 'r1', participantId: 'p1', eventId: 'e1', createdAt: '2026-10-17T14:00:00.000Z',
  cells: Array.from({ length: 15 }, (_, index) => {
    const rowIndex = Math.floor(index / 5);
    const colIndex = index % 5;
    return { id: `c${index}`, rowIndex, colIndex, row: rowIndex, column: colIndex, keyId: `k${index}`, keyValue: `KEY ${index}`, marked: index === 0 };
  }),
};

describe('participant ticket contract', () => {
  it('accepts a complete server ticket and preserves cell identity and marks', () => {
    const parsed = participantTicketSchema.parse(ticket);
    expect(parsed).toMatchObject({ id: 't1' });
    expect(parsed.cells[0]).toMatchObject({ id: 'c0', marked: true });
  });

  it.each([
    ['missing a cell', { ...ticket, cells: ticket.cells.slice(1) }],
    ['duplicate positions', { ...ticket, cells: ticket.cells.map((cell, index) => index === 1 ? { ...cell, rowIndex: 0, colIndex: 0, row: 0, column: 0 } : cell) }],
    ['inconsistent coordinate aliases', { ...ticket, cells: ticket.cells.map((cell, index) => index === 0 ? { ...cell, column: 8 } : cell) }],
    ['out-of-range coordinates', { ...ticket, cells: ticket.cells.map((cell, index) => index === 0 ? { ...cell, colIndex: 9, column: 9 } : cell) }],
  ])('rejects a ticket %s', (_label, value) => {
    expect(participantTicketSchema.safeParse(value).success).toBe(false);
  });
});
