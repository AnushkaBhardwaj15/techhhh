import type postgres from 'postgres';
import { hashPassword } from '../../src/modules/auth/auth.domain.ts';

export async function seedRestoreFixture(sql: postgres.Sql, password: string) {
  const [event] = await sql`INSERT INTO events (title, status) VALUES ('Restore rehearsal', 'LIVE') RETURNING id`;
  const [admin] = await sql`INSERT INTO users (email, password_hash, name) VALUES ('admin@restore.test', ${await hashPassword(password)}, 'Restore Admin') RETURNING id`;
  await sql`INSERT INTO admin_profiles (user_id, role) VALUES (${admin!.id}, 'ADMIN')`;
  const [user] = await sql`INSERT INTO users (email, password_hash, name) VALUES ('participant@restore.test', ${await hashPassword(password)}, 'Restore Participant') RETURNING id`;
  const [participant] = await sql`INSERT INTO participant_profiles (user_id, event_id) VALUES (${user!.id}, ${event!.id}) RETURNING id`;
  const roundIds: Record<string, string> = {};
  for (const [index, status] of ['ACTIVE', 'DRAFT', 'COMPLETED'].entries()) {
    const [round] = await sql`INSERT INTO rounds (event_id, sequence_number, name, status) VALUES (${event!.id}, ${index + 1}, ${`Restore ${status}`}, ${status}) RETURNING id`;
    roundIds[status] = round!.id;
  }
  const active = roundIds.ACTIVE!;
  const [ticket] = await sql`INSERT INTO tickets (round_id, participant_id, event_id) VALUES (${active}, ${participant!.id}, ${event!.id}) RETURNING id`;
  for (const pattern of ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE']) {
    await sql`INSERT INTO round_patterns (round_id, pattern_type, status) VALUES (${active}, ${pattern}, ${pattern === 'TOP_LINE' ? 'CLOSED' : 'OPEN'})`;
  }
  for (let index = 0; index < 15; index++) {
    const value = `RESTORE_${index}`;
    const [key] = await sql`INSERT INTO event_keys (event_id, value, normalized_value) VALUES (${event!.id}, ${value}, ${value}) RETURNING id`;
    const [question] = await sql`INSERT INTO round_questions (round_id, key_id, question_text) VALUES (${active}, ${key!.id}, ${`Restore clue ${index}`}) RETURNING id`;
    const [cell] = await sql`INSERT INTO ticket_cells (ticket_id, key_id, row_index, col_index) VALUES (${ticket!.id}, ${key!.id}, ${Math.floor(index / 5)}, ${index % 5}) RETURNING id`;
    if (index < 5) {
      await sql`INSERT INTO draws (round_id, question_id, key_id, sequence_number, draw_mode, question_text, key_value, drawn_by) VALUES (${active}, ${question!.id}, ${key!.id}, ${index + 1}, 'MANUAL', ${`Restore clue ${index}`}, ${value}, ${admin!.id})`;
      await sql`INSERT INTO ticket_marks (ticket_id, cell_id) VALUES (${ticket!.id}, ${cell!.id})`;
    }
  }
  const [claim] = await sql`INSERT INTO claims (round_id, participant_id, ticket_id, pattern_type, status, verified_by, verified_at) VALUES (${active}, ${participant!.id}, ${ticket!.id}, 'TOP_LINE', 'VERIFIED', ${admin!.id}, now()) RETURNING id`;
  await sql`INSERT INTO winners (claim_id, participant_id, round_id, event_id, pattern_type, verified_by) VALUES (${claim!.id}, ${participant!.id}, ${active}, ${event!.id}, 'TOP_LINE', ${admin!.id})`;
  await sql`INSERT INTO audit_logs (actor_id, actor_type, action, resource_type, resource_id) VALUES (${admin!.id}, 'ADMIN', 'WIN_VERIFIED', 'claim', ${claim!.id})`;
  return { eventId: event!.id as string, roundIds, ticketId: ticket!.id as string, participantId: participant!.id as string };
}
