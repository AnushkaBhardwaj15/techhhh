import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { rounds } from './rounds.ts';
import { participantProfiles } from './users.ts';

export const roundParticipantJoins = pgTable('round_participant_joins', {
  roundId: uuid('round_id').notNull().references(() => rounds.id, { onDelete: 'restrict' }),
  participantId: uuid('participant_id').notNull().references(() => participantProfiles.id, { onDelete: 'restrict' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.roundId, table.participantId] }),
  index('round_participant_joins_participant_idx').on(table.participantId),
]);
