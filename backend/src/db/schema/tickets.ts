import { index, integer, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { events } from './events.ts';
import { rounds } from './rounds.ts';
import { participantProfiles } from './users.ts';
import { eventKeys } from './questions.ts';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'restrict' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participantProfiles.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_tickets_round_participant').on(table.roundId, table.participantId),
    index('tickets_round_id_idx').on(table.roundId),
    index('tickets_participant_id_idx').on(table.participantId),
    index('tickets_event_id_idx').on(table.eventId),
  ]
);

export const ticketCells = pgTable(
  'ticket_cells',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    keyId: uuid('key_id')
      .notNull()
      .references(() => eventKeys.id, { onDelete: 'restrict' }),
    rowIndex: integer('row_index').notNull(),
    colIndex: integer('col_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_ticket_cells_position').on(table.ticketId, table.rowIndex, table.colIndex),
    unique('uq_ticket_cells_ticket_key').on(table.ticketId, table.keyId),
    index('ticket_cells_ticket_id_idx').on(table.ticketId),
    index('ticket_cells_key_id_idx').on(table.keyId),
  ]
);

export type TicketRecord = typeof tickets.$inferSelect;
export type InsertTicket = typeof tickets.$inferInsert;
export type TicketCellRecord = typeof ticketCells.$inferSelect;
export type InsertTicketCell = typeof ticketCells.$inferInsert;
