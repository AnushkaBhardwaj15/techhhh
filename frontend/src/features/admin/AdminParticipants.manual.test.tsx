import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { AdminParticipants } from './AdminParticipants';
import { createAdminParticipant, listAdminParticipants, updateAdminParticipant } from '../../lib/api/adminParticipants';

vi.mock('./AdminParticipantImport', () => ({ AdminParticipantImport: () => <section><h2>Import Participants from CSV</h2></section> }));
vi.mock('../../lib/api/adminParticipants', () => ({
  createAdminParticipant: vi.fn(),
  updateAdminParticipant: vi.fn(),
  listParticipantBatches: vi.fn(async () => ({ batches: [] })),
  listAdminParticipants: vi.fn(async () => ({ data: [], pagination: { totalPages: 1 } })),
  removeParticipantAccount: vi.fn(), removeParticipantBatch: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function setup() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Routes>
    <Route element={<Outlet context={{ id: 'admin-1' }} />}><Route path="/" element={<AdminParticipants />} /></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  const form = screen.getByRole('heading', { name: 'Add participant' }).parentElement!;
  fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Test Player' } });
  fireEvent.change(within(form).getByLabelText('Email'), { target: { value: 'player@example.test' } });
  fireEvent.change(within(form).getByLabelText('Password'), { target: { value: 'test-password-123' } });
  return form;
}

it('sends all CSV identity fields and batch when adding manually', async () => {
  vi.mocked(createAdminParticipant).mockResolvedValueOnce({} as never);
  const form = setup();
  fireEvent.change(within(form).getByLabelText('External ID (optional)'), { target: { value: ' ID-10 ' } });
  fireEvent.change(screen.getByLabelText('Batch name (optional)'), { target: { value: 'Batch 1' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Add participant' }));
  expect(await screen.findByText('Participant added. They can join any game.')).toBeInTheDocument();
  expect(createAdminParticipant).toHaveBeenCalledWith({ name: 'Test Player', email: 'player@example.test', password: 'test-password-123', externalId: 'ID-10', batchName: 'Batch 1' });
});

it('allows an omitted external ID and preserves input after a server error', async () => {
  vi.mocked(createAdminParticipant).mockRejectedValueOnce(new Error('Duplicate account'));
  const form = setup();
  fireEvent.click(within(form).getByRole('button', { name: 'Add participant' }));
  expect(await screen.findByText('Duplicate account')).toBeInTheDocument();
  expect(createAdminParticipant).toHaveBeenCalledWith(expect.objectContaining({ externalId: null }));
  expect(within(form).getByLabelText('Name')).toHaveValue('Test Player');
});

it('shows each player’s name, email, external ID and status with a labelled remove action', async () => {
  vi.mocked(listAdminParticipants).mockResolvedValueOnce({
    data: [{ id: 'profile-1', userId: 'user-1', eventId: 'event-1', name: 'Sam Rivera', email: 'sam@example.test', externalId: 'ID-10', status: 'ACTIVE', emailDeliveryStatus: 'PENDING', createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z' }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });
  setup();
  const list = await screen.findByRole('list', { name: 'Registered players' });
  expect(await within(list).findByText('Sam Rivera')).toBeInTheDocument();
  expect(within(list).getByText('sam@example.test')).toBeInTheDocument();
  expect(within(list).getByText('ID-10')).toBeInTheDocument();
  expect(within(list).getByText('Active')).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: 'Remove Sam Rivera' })).toBeInTheDocument();
});


it('keeps sections in batch, manual, CSV, registered players order', () => {
  setup();
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
    'Participant batches', 'Add participant', 'Import Participants from CSV', 'Registered players',
  ]);
});


it('deactivates and reactivates the selected participant using the profile ID', async () => {
  const person = { id: 'profile-1', userId: 'user-1', eventId: 'event-1', name: 'Sam Rivera', email: 'sam@example.test', externalId: null, status: 'ACTIVE' as const, emailDeliveryStatus: 'PENDING' as const, createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z' };
  const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
  vi.mocked(listAdminParticipants).mockResolvedValueOnce({ data: [person], pagination })
    .mockResolvedValueOnce({ data: [{ ...person, status: 'INACTIVE' }], pagination })
    .mockResolvedValueOnce({ data: [person], pagination });
  vi.mocked(updateAdminParticipant).mockResolvedValue(person);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Sam Rivera' }));
  expect(await screen.findByText(/Sam Rivera is inactive/)).toBeInTheDocument();
  expect(updateAdminParticipant).toHaveBeenLastCalledWith('profile-1', { status: 'INACTIVE' });
  fireEvent.click(await screen.findByRole('button', { name: 'Activate Sam Rivera' }));
  expect(await screen.findByText('Sam Rivera is active and can sign in again.')).toBeInTheDocument();
  expect(updateAdminParticipant).toHaveBeenLastCalledWith('profile-1', { status: 'ACTIVE' });
});
