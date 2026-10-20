import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tickets, ticketCells } from './tickets.ts';

export const ticketMarks = pgTable(
  'ticket_marks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    cellId: uuid('cell_id')
      .notNull()
      .references(() => ticketCells.id, { onDelete: 'cascade' }),
    markedAt: timestamp('marked_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_ticket_marks_ticket_cell').on(table.ticketId, table.cellId),
    index('ticket_marks_ticket_id_idx').on(table.ticketId),
    index('ticket_marks_cell_id_idx').on(table.cellId),
  ]
);

export type TicketMarkRecord = typeof ticketMarks.$inferSelect;
export type InsertTicketMark = typeof ticketMarks.$inferInsert;
