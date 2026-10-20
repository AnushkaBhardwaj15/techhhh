import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { idempotencyKeys, type IdempotencyRecord } from '../../db/schema/idempotency.ts';

export interface IIdempotencyRepository {
  find(key: string, tx?: any): Promise<any | null>;
  save(key: string, resourceType: string, responsePayload: any, tx?: any): Promise<void>;
}

export class IdempotencyRepository implements IIdempotencyRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  async find(key: string, tx?: any): Promise<any | null> {
    const client = this.getClient(tx);
    const [record] = await client
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);

    return record ? record.responsePayload : null;
  }

  async save(
    key: string,
    resourceType: string,
    responsePayload: any,
    tx?: any
  ): Promise<void> {
    const client = this.getClient(tx);
    await client
      .insert(idempotencyKeys)
      .values({
        key,
        resourceType,
        responsePayload,
      })
      .onConflictDoNothing();
  }
}

export const idempotencyRepository = new IdempotencyRepository();
