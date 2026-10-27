import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listParticipantBatches, removeParticipantBatch } from '../../lib/api/adminParticipants';
import { AdminParticipantBatches } from './AdminParticipantBatches';

vi.mock('../../lib/api/adminParticipants', () => ({ listParticipantBatches: vi.fn(), removeParticipantBatch: vi.fn() }));
const eventId = 'event-1';
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminParticipantBatches eventId={eventId} userId="admin" /></QueryClientProvider>);
  return client;
}

// Scenarios: distinct counts, deliberate removal/cancel, server deletion mode,
// pending requests, empty state and safe retryable errors.
describe('Participant batches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listParticipantBatches).mockResolvedValue([
      { batchName: 'testing1', total: 5, active: 5 },
      { batchName: 'testing2', total: 100, active: 100 },
      { batchName: 'prod', total: 500, active: 500 },
    ]);
    vi.mocked(removeParticipantBatch).mockResolvedValue({ mode: 'deleted', count: 5 });
  });
  afterEach(cleanup);

  it('shows each group and cancels removal without a request', async () => {
    mount();
    expect(await screen.findByRole('rowheader', { name: 'testing1' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'prod' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove batch testing1' }));
    expect(removeParticipantBatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it.each(['deleted', 'deactivated'] as const)('reports the server removal mode %s and refreshes both lists', async (mode) => {
    vi.mocked(removeParticipantBatch).mockResolvedValue({ mode, count: 5 });
    const client = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove batch testing1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal of testing1' }));
    expect(await screen.findByText(`5 participants ${mode}.`)).toBeInTheDocument();
    expect(removeParticipantBatch).toHaveBeenCalledWith(eventId, 'testing1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin-participants', 'admin', eventId] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['participant-batches', 'admin', eventId] });
  });

  it('blocks another removal while the server is processing', async () => {
    vi.mocked(removeParticipantBatch).mockImplementation(() => new Promise(() => {}));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove batch testing1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal of testing1' }));
    expect(await screen.findByRole('button', { name: 'Removing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove batch prod' })).toBeDisabled();
  });

  it('shows empty batches and safe load errors', async () => {
    vi.mocked(listParticipantBatches).mockRejectedValueOnce(new Error('internal connection details'));
    mount();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('internal connection details');
    vi.mocked(listParticipantBatches).mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry batches' }));
    expect(await screen.findByText('No named batches in this Event.')).toBeInTheDocument();
  });

  it('shows a safe error if removal outcome is unknown', async () => {
    vi.mocked(removeParticipantBatch).mockRejectedValue(new Error('internal SQL'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove batch testing1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal of testing1' }));
    expect(await screen.findByText(/Could not confirm removal/)).not.toHaveTextContent('internal SQL');
  });
});
