import { z } from 'zod';

const ticketCellSchema = z.object({
  id: z.string(), rowIndex: z.number().int().min(0).max(2), colIndex: z.number().int().min(0).max(8),
  row: z.number().int().min(0).max(2), column: z.number().int().min(0).max(8),
  keyId: z.string(), keyValue: z.string().min(1), marked: z.boolean(),
}).refine((cell) => cell.row === cell.rowIndex && cell.column === cell.colIndex, 'Ticket coordinate aliases must agree');

export const participantTicketSchema = z.object({
  id: z.string(), roundId: z.string(), participantId: z.string(), eventId: z.string(),
  createdAt: z.string().datetime({ offset: true }), cells: z.array(ticketCellSchema).length(15),
}).superRefine((ticket, context) => {
  const ids = new Set<string>();
  const positions = new Set<string>();
  const rowCounts = [0, 0, 0];
  ticket.cells.forEach((cell, index) => {
    const position = `${cell.rowIndex}:${cell.colIndex}`;
    if (ids.has(cell.id)) context.addIssue({ code: 'custom', path: ['cells', index, 'id'], message: 'Ticket cell ids must be unique' });
    if (positions.has(position)) context.addIssue({ code: 'custom', path: ['cells', index], message: 'Ticket cell positions must be unique' });
    ids.add(cell.id);
    positions.add(position);
    rowCounts[cell.rowIndex] += 1;
  });
  rowCounts.forEach((count, row) => {
    if (count !== 5) context.addIssue({ code: 'custom', path: ['cells'], message: `Ticket row ${row} must contain five cells` });
  });
});

export type ParticipantTicket = z.infer<typeof participantTicketSchema>;
