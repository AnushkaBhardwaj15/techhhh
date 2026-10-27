import { getDb } from '../../db/client.ts';
import { events } from '../../db/schema/events.ts';

// Legacy storage grouping is internal; accounts are shared across all games.
const POOL_ID = '00000000-0000-4000-8000-000000000001';
let ready: Promise<string> | undefined;
export function getParticipantPoolId(): Promise<string> {
  ready ??= getDb().insert(events).values({ id: POOL_ID, title: 'Participant accounts', status: 'READY' }).onConflictDoNothing()
    .then(() => POOL_ID).catch((error) => { ready = undefined; throw error; });
  return ready;
}
