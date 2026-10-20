import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { importAdminParticipants } from '../../lib/api/adminParticipants';
import { AdminParticipantImport } from './AdminParticipantImport';

vi.mock('../../lib/api/adminParticipants', () => ({ importAdminParticipants: vi.fn() }));

const eventId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const report = { totalReceived: 1, createdCount: 1, skippedCount: 0, failedCount: 0, errors: [] };

function renderImport() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onPendingChange = vi.fn();
  render(<QueryClientProvider client={client}><AdminParticipantImport eventId={eventId} userId="admin-1" onPendingChange={onPendingChange} /></QueryClientProvider>);
  return { client, onPendingChange };
}

async function chooseCsv(text = 'name,email\nSam,sam@example.test') {
  fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [new File([text], 'players.csv', { type: 'text/csv' })] } });
  await screen.findByRole('table', { name: 'CSV preview' });
}

describe('Admin Participant CSV import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importAdminParticipants).mockResolvedValue(report);
  });
  afterEach(() => cleanup());

  it('previews safely and sends only after explicit confirmation', async () => {
    const log = vi.spyOn(console, 'log');
    renderImport();
    await chooseCsv('name,email\n<img src=x onerror=alert(1)>,safe@example.test');
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(importAdminParticipants).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import of 1 rows' }));
    expect(await screen.findByRole('heading', { name: 'Import results' })).toBeInTheDocument();
    expect(importAdminParticipants).toHaveBeenCalledWith(expect.objectContaining({ eventId, file: expect.any(File), idempotencyKey: expect.any(String) }));
    expect(screen.getByText(/does not include per-Participant credential-delivery status/)).toBeInTheDocument();
    expect(log).not.toHaveBeenCalled();
  });

  it('blocks malformed rows and lets the operator clear a file without importing', async () => {
    renderImport();
    await chooseCsv('name,email\nSam,sam@example.test,extra');
    expect(screen.getByRole('list', { name: 'CSV structure issues' })).toHaveTextContent('Record 2 has 3 columns');
    expect(screen.getByRole('button', { name: 'Confirm import of 1 rows' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear file' }));
    expect(screen.queryByRole('table', { name: 'CSV preview' })).not.toBeInTheDocument();
    expect(importAdminParticipants).not.toHaveBeenCalled();
  });

  it('requires review after a timeout with a possibly committed import and reuses the idempotency key', async () => {
    vi.mocked(importAdminParticipants).mockRejectedValueOnce(new ApiError(0, 'Request timed out after the server may have committed')).mockResolvedValueOnce(report);
    const { client } = renderImport();
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    await chooseCsv();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import of 1 rows' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outcome is unknown');
    expect(importAdminParticipants).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Confirm import of 1 rows' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('CSV file')).toBeDisabled();
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['admin-participants', 'admin-1', eventId] });
    const firstKey = vi.mocked(importAdminParticipants).mock.calls[0][0].idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'I reviewed the current results; enable a deliberate retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry import deliberately' }));
    await screen.findByRole('heading', { name: 'Import results' });
    await waitFor(() => expect(importAdminParticipants).toHaveBeenCalledTimes(2));
    expect(vi.mocked(importAdminParticipants).mock.calls[1][0].idempotencyKey).toBe(firstKey);
  });

  it('sends only one request when confirmation is clicked repeatedly while pending', async () => {
    let resolveImport!: (value: typeof report) => void;
    vi.mocked(importAdminParticipants).mockImplementation(() => new Promise((resolve) => { resolveImport = resolve; }));
    renderImport();
    await chooseCsv();
    const confirm = screen.getByRole('button', { name: 'Confirm import of 1 rows' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(importAdminParticipants).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
    resolveImport(report);
    expect(await screen.findByRole('heading', { name: 'Import results' })).toBeInTheDocument();
  });

  it('leaves duplicate email decisions to the server and shows its duplicate result', async () => {
    vi.mocked(importAdminParticipants).mockResolvedValue({
      totalReceived: 2, createdCount: 1, skippedCount: 1, failedCount: 0,
      errors: [{ rowIndex: 3, email: 'sam@example.test', reason: 'Email already exists in this Event' }],
    });
    renderImport();
    await chooseCsv('name,email\nSam,sam@example.test\nSam Again,sam@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import of 2 rows' }));
    expect(await screen.findByText('Row 3 · sam@example.test: Email already exists in this Event')).toBeInTheDocument();
    expect(importAdminParticipants).toHaveBeenCalledTimes(1);
  });

  it('treats an unparseable successful response as an uncertain outcome', async () => {
    vi.mocked(importAdminParticipants).mockRejectedValue(new Error('Import report did not match the expected schema'));
    renderImport();
    await chooseCsv();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import of 1 rows' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outcome is unknown');
    expect(screen.queryByRole('button', { name: 'Confirm import of 1 rows' })).not.toBeInTheDocument();
  });

  it('shows a known server rejection without treating it as an unknown outcome', async () => {
    vi.mocked(importAdminParticipants).mockRejectedValue(new ApiError(422, 'Invalid Participant email'));
    renderImport();
    await chooseCsv();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import of 1 rows' }));
    expect(await screen.findByText(/server did not accept the import/)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: /deliberate retry/ })).not.toBeInTheDocument();
  });
});
