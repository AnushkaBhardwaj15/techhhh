import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listParticipantBatches, removeParticipantBatch } from '../../lib/api/adminParticipants';
import styles from './AdminParticipants.module.css';

export function AdminParticipantBatches({ eventId, userId, disabled = false, onPendingChange }: { eventId: string; userId: string; disabled?: boolean; onPendingChange?: (pending: boolean) => void }) {
  const client = useQueryClient();
  const requestLock = useRef(false);
  const [selection, setSelection] = useState('');
  const [message, setMessage] = useState('');
  const batches = useQuery({ queryKey: ['participant-batches', userId, eventId],
    queryFn: ({ signal }) => listParticipantBatches(eventId, signal) });
  const remove = useMutation({
    onMutate: () => { onPendingChange?.(true); },
    onSettled: () => { requestLock.current = false; onPendingChange?.(false); },
    mutationFn: (batchName: string) => removeParticipantBatch(eventId, batchName),
    onSuccess: async (result) => {
      setSelection('');
      setMessage(`${result.count} participants ${result.mode}.`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['participant-batches', userId, eventId] }),
        client.invalidateQueries({ queryKey: ['admin-participants', userId, eventId] }),
      ]);
    },
    onError: () => setMessage('Could not confirm removal. Refresh the batch list before retrying.'),
  });
  return <section className={styles.panel} aria-labelledby="batches-title">
    <h2 id="batches-title">Participant batches</h2>
    <p>Remove a test group together. Batches with tickets are disabled to preserve game history.</p>
    {batches.isPending && <p role="status">Loading batches…</p>}
    {batches.error && <p role="alert">Could not load batches. <button type="button" onClick={() => void batches.refetch()}>Retry batches</button></p>}
    {message && <p role="status">{message}</p>}
    {batches.data?.length === 0 && <p>No named batches in this Event.</p>}
    {Boolean(batches.data?.length) && <div className={styles.tableWrap}><table><thead><tr><th scope="col">Batch</th><th scope="col">Participants</th><th scope="col">Active</th><th scope="col">Action</th></tr></thead>
      <tbody>{batches.data?.map((batch) => <tr key={batch.batchName}><th scope="row">{batch.batchName}</th><td>{batch.total}</td><td>{batch.active}</td><td>
        <button type="button" disabled={disabled || remove.isPending} onClick={() => { setSelection(batch.batchName); setMessage(''); }}>Remove batch {batch.batchName}</button>
      </td></tr>)}</tbody></table></div>}
    {selection && <div role="group" aria-label="Confirm batch removal"><p>Remove every participant in <strong>{selection}</strong>? Unused accounts will be permanently deleted. If any member has a ticket, the whole batch will be disabled and its sessions revoked.</p>
      <button type="button" disabled={disabled || remove.isPending} onClick={() => { if (!requestLock.current) { requestLock.current = true; remove.mutate(selection); } }}>{remove.isPending ? 'Removing…' : `Confirm removal of ${selection}`}</button>
      <button type="button" disabled={remove.isPending} onClick={() => setSelection('')}>Cancel</button></div>}
  </section>;
}
