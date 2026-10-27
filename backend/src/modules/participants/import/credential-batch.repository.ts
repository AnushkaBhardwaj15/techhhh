import { and, eq, inArray } from 'drizzle-orm';
import { users, participantProfiles } from '../../../db/schema/users.ts';
import { auditLogs } from '../../../db/schema/audit.ts';
import { buildAuditPayload } from '../../audit/audit.domain.ts';
import type { BatchTransaction } from '../participant-batch.repository.ts';

export interface CredentialRow { rowIndex: number; email: string; name: string; externalId: string | null; passwordHash: string; }

export class CredentialBatchRepository {
  async existing(emails: string[], externalIds: string[], eventId: string, tx: BatchTransaction) {
    const accounts = await tx.select({ email: users.email }).from(users).where(inArray(users.email, emails));
    const identifiers = externalIds.length ? await tx.select({ externalId: participantProfiles.externalId }).from(participantProfiles)
      .where(and(eq(participantProfiles.eventId, eventId), inArray(participantProfiles.externalId, externalIds))) : [];
    return { emails: new Set(accounts.map((row) => row.email)), externalIds: new Set(identifiers.map((row) => row.externalId)) };
  }

  async create(actorId: string, eventId: string, batchName: string | undefined, rows: CredentialRow[], tx: BatchTransaction) {
    if (!rows.length) return new Set<string>();
    const inserted = await tx.insert(users).values(rows.map((row) => ({ email: row.email, name: row.name, passwordHash: row.passwordHash })))
      .onConflictDoNothing().returning({ id: users.id, email: users.email });
    if (!inserted.length) return new Set<string>();
    const byEmail = new Map(rows.map((row) => [row.email, row]));
    const profiles = await tx.insert(participantProfiles).values(inserted.map((user) => ({
      userId: user.id, eventId, externalId: byEmail.get(user.email)!.externalId, batchName, emailDeliveryStatus: 'NOT_REQUIRED',
    }))).returning({ id: participantProfiles.id, userId: participantProfiles.userId });
    await tx.insert(auditLogs).values(profiles.map((profile) => buildAuditPayload({
      actorId, actorType: 'ADMIN', action: 'PARTICIPANT_CREATED', resourceType: 'participant', resourceId: profile.id,
      metadata: { batchName },
    })));
    return new Set(inserted.map((user) => user.email));
  }
}
