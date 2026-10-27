import { listAccountBatches, removeAccounts } from './account-batch.repository.ts';
import { NotFoundError } from '../../shared/errors/app-error.ts';
export const participantAccountService = {
  listBatches: listAccountBatches,
  async remove(actorId: string, scope: { userId: string } | { batchName: string }) {
    const result = await removeAccounts(actorId, scope);
    if (!result.removed && 'userId' in scope) throw new NotFoundError('Participant account not found or already removed');
    return result;
  },
};
