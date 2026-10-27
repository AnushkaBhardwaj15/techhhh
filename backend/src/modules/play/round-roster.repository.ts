import type postgres from 'postgres';
import { getSqlClient } from '../../db/client.ts';

export type RosterTransaction = Pick<postgres.TransactionSql, 'unsafe'>;
export interface RosterRound { id: string; eventId: string; status: string; }
export interface JoinedParticipant { id: string; name: string; email: string; joinedAt: string; }

export class RoundRosterRepository {
  constructor(private readonly connection = getSqlClient) {}

  withLockedRound<T>(id: string, operation: (round: RosterRound | null, tx: RosterTransaction) => Promise<T>) {
    return this.connection().begin(async (tx) => {
      const [round] = await tx.unsafe<RosterRound[]>(
        'SELECT id,event_id AS "eventId",status FROM rounds WHERE id=$1 FOR SHARE', [id]);
      return operation(round ?? null, tx);
    }) as Promise<T>;
  }

  async findParticipant(eventId: string, userId: string, tx: RosterTransaction) {
    // Match account removal's lock order: participant profile, then user.
    const [profile] = await tx.unsafe<Array<{ id: string; status: string }>>(
      'SELECT id,status FROM participant_profiles WHERE event_id=$1 AND user_id=$2 FOR SHARE', [eventId, userId]);
    if (!profile) return null;
    const [user] = await tx.unsafe<Array<{ userStatus: string; adminRole: string | null }>>(
      `SELECT u.status AS "userStatus",a.role AS "adminRole" FROM users u
       LEFT JOIN admin_profiles a ON a.user_id=u.id WHERE u.id=$1 FOR SHARE OF u`, [userId]);
    return user ? { ...profile, ...user } : null;
  }

  async hasTicket(roundId: string, participantId: string, tx: RosterTransaction) {
    const rows = await tx.unsafe('SELECT id FROM tickets WHERE round_id=$1 AND participant_id=$2 LIMIT 1', [roundId, participantId]);
    return rows.length > 0;
  }

  async record(roundId: string, participantId: string, tx: RosterTransaction) {
    await tx.unsafe(`INSERT INTO round_participant_joins(round_id,participant_id) VALUES($1,$2)
      ON CONFLICT (round_id,participant_id) DO NOTHING`, [roundId, participantId]);
  }

  async list(roundId: string): Promise<JoinedParticipant[] | null> {
    const rows = await this.connection().unsafe<Array<{
      roundId: string; id: string | null; name: string | null; email: string | null; joinedAt: Date | string | null;
    }>>(`SELECT r.id AS "roundId",j.participant_id AS id,u.name,u.email,j.joined_at AS "joinedAt"
      FROM rounds r LEFT JOIN round_participant_joins j ON j.round_id=r.id
      LEFT JOIN participant_profiles p ON p.id=j.participant_id LEFT JOIN users u ON u.id=p.user_id
      WHERE r.id=$1 ORDER BY j.joined_at,j.participant_id`, [roundId]);
    if (!rows.length) return null;
    return rows.filter((row) => row.id !== null).map((row) => ({
      id: row.id!, name: row.name!, email: row.email!, joinedAt: new Date(row.joinedAt!).toISOString(),
    }));
  }
}
