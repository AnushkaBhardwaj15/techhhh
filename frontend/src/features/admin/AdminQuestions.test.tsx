import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getAdminEvent } from '../../lib/api/adminEvents';
import { getAdminRound, listAdminRounds } from '../../lib/api/adminRounds';
import { createAdminKey, createAdminQuestion, deleteAdminQuestion, listAdminKeys, listAdminQuestions, updateAdminKey, updateAdminQuestion } from '../../lib/api/adminQuestions';
import type { AdminKey, AdminQuestion } from '../../types/adminQuestion';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminQuestions } from './AdminQuestions';

vi.mock('../../lib/api/adminEvents', () => ({ getAdminEvent: vi.fn() }));
vi.mock('../../lib/api/adminRounds', () => ({ getAdminRound: vi.fn(), listAdminRounds: vi.fn() }));
vi.mock('../../lib/api/adminQuestions', () => ({ createAdminKey: vi.fn(), createAdminQuestion: vi.fn(), deleteAdminQuestion: vi.fn(), listAdminKeys: vi.fn(), listAdminQuestions: vi.fn(), updateAdminKey: vi.fn(), updateAdminQuestion: vi.fn() }));

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.test', name: 'Admin User', role: 'ADMIN', status: 'ACTIVE' };
const eventId = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const eventB = 'd68649b9-04ac-46fa-bae0-7694cdd042f4';
const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const roundBId = 'c96ddf95-790b-4f68-9e4c-93513a76f9f4';
const keyId = '7c5e95cf-9a31-4a3c-83cc-a353ccde9fd1';
const dates = { createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' };
const key: AdminKey = { id: keyId, eventId, value: 'DOCKER', normalizedValue: 'DOCKER', ...dates };
const question: AdminQuestion = { id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', roundId, keyId, keyValue: 'DOCKER', questionText: 'What runs containers?', ...dates };
const page = <T,>(data: T[], total = data.length) => ({ data, pagination: { page: 1, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) } });

function renderPage(path = `/admin/questions?eventId=${eventId}&roundId=${roundId}`, seedQuestionsForEvent?: string, addScopeSwitch = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  if (seedQuestionsForEvent) client.setQueryData(['admin-questions', admin.id, seedQuestionsForEvent, roundId, 1], page([question]));
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={admin} />}><Route path="/admin" element={<Outlet context={admin} />}><Route path="questions" element={<><AdminQuestions /><Link to={`/admin/questions?eventId=${eventId}&roundId=${roundId}`}>Reset scope</Link>{addScopeSwitch && <Link to={`/admin/questions?eventId=${eventB}&roundId=${roundBId}`}>Switch valid scope</Link>}</>} /></Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Admin Questions and Keys', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  beforeEach(() => {
    vi.mocked(getAdminEvent).mockResolvedValue({ id: eventId, title: 'Tech Tombola', status: 'READY', description: null, scheduledAt: null, startedAt: null, completedAt: null, ...dates });
    vi.mocked(listAdminRounds).mockResolvedValue(page([{ id: roundId, eventId, sequenceNumber: 1, name: 'Opening round', status: 'DRAFT', patterns: [], ...dates }]) as never);
    vi.mocked(getAdminRound).mockResolvedValue({ id: roundId, eventId, sequenceNumber: 1, name: 'Opening round', status: 'DRAFT', patterns: [], ...dates });
    vi.mocked(listAdminKeys).mockResolvedValue(page([key]));
    vi.mocked(listAdminQuestions).mockResolvedValue(page([question]));
    vi.mocked(createAdminKey).mockResolvedValue(key);
    vi.mocked(updateAdminKey).mockResolvedValue(key);
    vi.mocked(createAdminQuestion).mockResolvedValue(question);
    vi.mocked(updateAdminQuestion).mockResolvedValue(question);
    vi.mocked(deleteAdminQuestion).mockResolvedValue(undefined);
  });

  it('requires an Event and keeps the key pool scoped to the selected Event', async () => {
    renderPage('/admin/questions');
    expect(await screen.findByRole('link', { name: 'Select an Event' })).toBeInTheDocument();
    expect(listAdminKeys).not.toHaveBeenCalled();
  });
  it('loads Event Keys and selected Round Questions, and displays clues as text', async () => {
    renderPage();
    expect(await screen.findByText('Event: Tech Tombola')).toBeInTheDocument();
    expect(await screen.findByText('What runs containers?')).toBeInTheDocument();
    expect(listAdminKeys).toHaveBeenCalledWith(expect.objectContaining({ eventId, page: 1, limit: 20 }));
    expect(listAdminQuestions).toHaveBeenCalledWith(expect.objectContaining({ roundId, page: 1, limit: 20 }));
  });
  it('sends full-scope Key and Round Question search filters to the backend and resets pagination', async () => {
    renderPage(`/admin/questions?eventId=${eventId}&roundId=${roundId}&keyPage=2&questionPage=3`);
    await screen.findByText('What runs containers?');
    fireEvent.change(screen.getByLabelText('Search all Event Keys'), { target: { value: 'docker' } });
    fireEvent.change(within(screen.getByRole('search', { name: 'Search Event Keys' })).getByLabelText('Usage'), { target: { value: 'false' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Keys' }));
    await screen.findByText(/The server did not confirm these filters/);
    expect(listAdminKeys).toHaveBeenLastCalledWith(expect.objectContaining({ eventId, page: 1, search: 'docker', used: false }));
    fireEvent.change(screen.getByLabelText('Search all Questions in this Round'), { target: { value: 'container clue' } });
    fireEvent.change(within(screen.getByRole('search', { name: 'Search Round Questions' })).getByLabelText('Usage'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Questions' }));
    expect(listAdminQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ roundId, page: 1, search: 'container clue', used: true }));
  });
  it('does not claim filtered empty results when the server omits filter confirmation', async () => {
    vi.mocked(listAdminKeys).mockResolvedValue(page([]));
    vi.mocked(listAdminQuestions).mockResolvedValue(page([]));
    renderPage(`/admin/questions?eventId=${eventId}&roundId=${roundId}&keySearch=DOCKER&questionSearch=container`);
    expect(await screen.findByText('No Keys returned on this page; filter application is unconfirmed.')).toBeInTheDocument();
    expect(await screen.findByText('No Questions returned on this page; filter application is unconfirmed.')).toBeInTheDocument();
    expect(screen.queryByText('No Keys match these filters.')).not.toBeInTheDocument();
    expect(screen.queryByText('No Questions match these filters.')).not.toBeInTheDocument();
  });
  it('shows server-confirmed usage and disables edits the backend says are locked', async () => {
    vi.mocked(listAdminKeys).mockResolvedValue({ data: [{ ...key, used: true, canEdit: false }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, filters: { search: 'DOC', used: true } });
    renderPage(`/admin/questions?eventId=${eventId}&roundId=${roundId}&keySearch=DOC&keyUsed=true`);
    await screen.findByText('Used · Locked');
    expect(screen.getByRole('button', { name: 'Edit Key' })).toBeDisabled();
    expect(screen.queryByText(/The server did not confirm these filters/)).not.toBeInTheDocument();
  });
  it('creates and edits a Key through its Event-scoped form', async () => {
    renderPage();
    await screen.findByText('DOCKER');
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'KUBERNETES' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await screen.findByText('Key DOCKER saved.');
    expect(createAdminKey).toHaveBeenCalledWith({ eventId, value: 'KUBERNETES' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Key' }));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'DOCKER ENGINE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await screen.findByText('Key changes saved.');
    expect(updateAdminKey).toHaveBeenCalledWith(keyId, { value: 'DOCKER ENGINE' });
  });
  it('keeps the selected Key edit target when the administrator changes Key pages', async () => {
    const otherKey: AdminKey = { ...key, id: 'f96c81a8-ab9c-46c7-8f93-9dd8ea54bb21', value: 'KUBERNETES' };
    vi.mocked(listAdminKeys).mockImplementation(async ({ page: pageNumber = 1 }) => page(pageNumber === 1 ? [key] : [otherKey], 21));
    renderPage();
    await screen.findByText('DOCKER');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Key' }));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'DOCKER ENGINE' } });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Key pages' })).getByRole('button', { name: 'Next' }));
    await screen.findByText('KUBERNETES');
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await screen.findByText('Key changes saved.');
    expect(updateAdminKey).toHaveBeenCalledWith(key.id, { value: 'DOCKER ENGINE' });
    expect(createAdminKey).not.toHaveBeenCalled();
  });
  it('hides a Key form when navigation changes Event scope', async () => {
    vi.mocked(getAdminEvent).mockImplementation(async (id) => ({ id, title: id === eventB ? 'Second Event' : 'Tech Tombola', status: 'READY', description: null, scheduledAt: null, startedAt: null, completedAt: null, ...dates }));
    vi.mocked(getAdminRound).mockImplementation(async (id) => ({ id, eventId: id === roundBId ? eventB : eventId, sequenceNumber: id === roundBId ? 2 : 1, name: id === roundBId ? 'Second Event round' : 'Opening round', status: 'DRAFT', patterns: [], ...dates }));
    vi.mocked(listAdminQuestions).mockResolvedValue(page([]));
    renderPage(undefined, undefined, true);
    await screen.findByText('DOCKER');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Key' }));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'WRONG EVENT' } });
    fireEvent.click(screen.getByRole('link', { name: 'Switch valid scope' }));
    expect(await screen.findByText('Event: Second Event')).toBeInTheDocument();
    expect(await screen.findByText('Round 2: Second Event round · DRAFT')).toBeInTheDocument();
    expect(screen.queryByLabelText('Key value')).not.toBeInTheDocument();
    expect(updateAdminKey).not.toHaveBeenCalled();
    expect(createAdminKey).not.toHaveBeenCalled();
  });
  it('keeps the Key form open and reports duplicate or immutable server conflicts', async () => {
    vi.mocked(createAdminKey).mockRejectedValueOnce(new ApiError(409, 'Key already exists in this Event'));
    renderPage();
    await screen.findByText('DOCKER');
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'DOCKER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(await screen.findByText('Key already exists in this Event')).toBeInTheDocument();
    expect(screen.getByLabelText('Key value')).toHaveValue('DOCKER');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Key' }));
    vi.mocked(updateAdminKey).mockRejectedValueOnce(new ApiError(409, 'Key is immutable after use'));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'DOCKER ENGINE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(await screen.findByText('Key is immutable after use')).toBeInTheDocument();
  });
  it('associates a Key with a Question and edits its clue', async () => {
    renderPage();
    await screen.findByText('What runs containers?');
    fireEvent.click(screen.getByRole('button', { name: 'Add Question' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: keyId } });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Which tool packages containers?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save association' }));
    await screen.findByText('Question association saved.');
    expect(createAdminQuestion).toHaveBeenCalledWith({ roundId, keyId, questionText: 'Which tool packages containers?' });
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Which platform orchestrates containers?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Question' }));
    await screen.findByText('Question changes saved.');
    expect(updateAdminQuestion).toHaveBeenCalledWith(question.id, { questionText: 'Which platform orchestrates containers?' });
  });
  it('retains an association form after duplicate and timeout responses', async () => {
    vi.mocked(createAdminQuestion).mockRejectedValueOnce(new ApiError(409, 'This Key already has a Question in the Round'));
    renderPage();
    await screen.findByText('What runs containers?');
    fireEvent.click(screen.getByRole('button', { name: 'Add Question' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: keyId } });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Which tool packages containers?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save association' }));
    expect(await screen.findByText('This Key already has a Question in the Round')).toBeInTheDocument();
    expect(screen.getByLabelText('Question text')).toHaveValue('Which tool packages containers?');
    vi.mocked(createAdminQuestion).mockRejectedValueOnce(new ApiError(504, 'Request timed out'));
    fireEvent.click(screen.getByRole('button', { name: 'Save association' }));
    expect(await screen.findByText('Request timed out')).toBeInTheDocument();
  });
  it('preserves the Question edit when the server rejects a used Question update', async () => {
    vi.mocked(updateAdminQuestion).mockRejectedValue(new ApiError(409, 'Question is immutable after use'));
    renderPage();
    await screen.findByText('What runs containers?');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'A changed clue after use' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Question' }));
    expect(await screen.findByText('Question is immutable after use')).toBeInTheDocument();
    expect(screen.getByLabelText('Question text')).toHaveValue('A changed clue after use');
  });
  it('shows refreshed server data after a stale Question update response', async () => {
    vi.mocked(listAdminQuestions).mockResolvedValueOnce(page([question])).mockResolvedValueOnce(page([{ ...question, questionText: 'Latest clue saved by another admin' }]));
    vi.mocked(updateAdminQuestion).mockRejectedValue(new ApiError(409, 'Question was updated elsewhere'));
    renderPage();
    await screen.findByText('What runs containers?');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'My stale edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Question' }));
    expect(await screen.findByText('Question was updated elsewhere')).toBeInTheDocument();
    expect(await screen.findByText('Latest clue saved by another admin')).toBeInTheDocument();
    expect(screen.getByLabelText('Question text')).toHaveValue('My stale edit');
  });
  it('does not submit a duplicate Key while the first request is pending', async () => {
    let finish!: (value: AdminKey) => void;
    vi.mocked(createAdminKey).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    await screen.findByText('DOCKER');
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));
    fireEvent.change(screen.getByLabelText('Key value'), { target: { value: 'KUBERNETES' } });
    const save = screen.getByRole('button', { name: 'Save Key' });
    fireEvent.click(save);
    await screen.findByRole('button', { name: 'Saving…' });
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(createAdminKey).toHaveBeenCalledOnce();
    await act(async () => { finish(key); });
  });
  it('asks before removal and preserves a server conflict for an immutable Question', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('What runs containers?');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(deleteAdminQuestion).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(deleteAdminQuestion).mockRejectedValue(new ApiError(409, 'Question is immutable after round start'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Question is immutable after round start')).toBeInTheDocument();
  });
  it('lets the backend decide Question permissions after a Round leaves DRAFT', async () => {
    vi.mocked(getAdminRound).mockResolvedValue({ id: roundId, eventId, sequenceNumber: 1, name: 'Opening round', status: 'READY', patterns: [], ...dates });
    vi.mocked(createAdminQuestion).mockRejectedValue(new ApiError(409, 'Round is not configurable'));
    renderPage();
    await screen.findByText('Round 1: Opening round · READY');
    expect(screen.getByRole('button', { name: 'Add Question' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add Question' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: keyId } });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Which tool packages containers?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save association' }));
    expect(await screen.findByText('Round is not configurable')).toBeInTheDocument();
    expect(createAdminQuestion).toHaveBeenCalledWith({ roundId, keyId, questionText: 'Which tool packages containers?' });
  });
  it('does not show cached Questions when the selected Round belongs to another Event', async () => {
    renderPage(`/admin/questions?eventId=${eventB}&roundId=${roundId}`, eventId);
    expect(await screen.findByText('The selected Round belongs to another Event. Choose a Round from this Event.')).toBeInTheDocument();
    expect(screen.queryByText('What runs containers?')).not.toBeInTheDocument();
    expect(listAdminQuestions).not.toHaveBeenCalled();
  });
  it('clears an edit when navigation changes to another valid Event and Round', async () => {
    const roundB = { id: roundBId, eventId: eventB, sequenceNumber: 2, name: 'Second Event round', status: 'DRAFT' as const, patterns: [], ...dates };
    vi.mocked(getAdminRound).mockImplementation(async (id) => id === roundBId ? roundB : { id: roundId, eventId, sequenceNumber: 1, name: 'Opening round', status: 'DRAFT', patterns: [], ...dates });
    vi.mocked(listAdminQuestions).mockImplementation(async ({ roundId: id }) => page([id === roundBId ? { ...question, id: 'f96c81a8-ab9c-46c7-8f93-9dd8ea54bb21', roundId: roundBId, keyValue: 'LINUX', questionText: 'Second Event clue?' } : question]));
    renderPage(undefined, undefined, true);
    await screen.findByText('What runs containers?');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'An unsaved edit from the first Round' } });
    fireEvent.click(screen.getByRole('link', { name: 'Switch valid scope' }));
    expect(await screen.findByText('Round 2: Second Event round · DRAFT')).toBeInTheDocument();
    expect(await screen.findByText('Second Event clue?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Question text')).not.toBeInTheDocument();
    expect(screen.queryByText('An unsaved edit from the first Round')).not.toBeInTheDocument();
  });
  it('renders untrusted clue content as text instead of markup', async () => {
    vi.mocked(listAdminQuestions).mockResolvedValue(page([{ ...question, questionText: '<img src=x onerror=alert(1)>' }]));
    renderPage();
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
  it('surfaces permission failures with a retry control', async () => {
    vi.mocked(listAdminKeys).mockRejectedValueOnce(new ApiError(403, 'Forbidden')).mockResolvedValueOnce(page([key]));
    renderPage();
    expect(await screen.findByText('Your account cannot manage Keys.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Keys' }));
    expect(await screen.findAllByText('DOCKER')).toHaveLength(2);
  });
});
