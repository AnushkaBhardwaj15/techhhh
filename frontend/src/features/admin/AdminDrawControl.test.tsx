import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createManualAdminDraw, createRandomAdminDraw, getLatestAdminDrawPage, listAdminRoundDraws } from '../../lib/api/adminDraws';
import { listAdminQuestions } from '../../lib/api/adminQuestions';
import { getAdminRound } from '../../lib/api/adminRounds';
import type { AdminDraw } from '../../types/adminDraw';
import type { AdminRound } from '../../types/adminRound';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminDrawControl } from './AdminDrawControl';

vi.mock('../../lib/api/adminDraws', () => ({ createManualAdminDraw: vi.fn(), createRandomAdminDraw: vi.fn(), getLatestAdminDrawPage: vi.fn(), listAdminRoundDraws: vi.fn() }));
vi.mock('../../lib/api/adminQuestions', () => ({ listAdminQuestions: vi.fn() }));
vi.mock('../../lib/api/adminRounds', () => ({ getAdminRound: vi.fn() }));

const user: AuthenticatedUser = { id: 'admin-1', email: 'ops@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' };
const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const eventId = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const questionId = '229f4f40-cff3-48a5-b177-8fbd55c1ed3b';
const keyId = '302fe3d0-63bf-4cbb-9e8b-5e03b588f26e';
const makeRound = (status: AdminRound['status'] = 'ACTIVE'): AdminRound => ({
  id: roundId, eventId, sequenceNumber: 1, name: 'Opening round', status, patterns: [],
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
});
const draw: AdminDraw = {
  id: '6d6204a3-0a5b-4dc1-a217-84b0f8ac99c7', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionId, keyId,
  questionText: 'Which container tool is widely used?', keyValue: 'DOCKER', drawnAt: '2026-10-17T10:00:00.000Z',
};
const manualQuestion = { id: questionId, roundId, keyId, keyValue: 'DOCKER', questionText: 'Which container tool is widely used?', used: false, createdAt: '2026-10-17T09:00:00.000Z', updatedAt: '2026-10-17T09:00:00.000Z' };
const drawPage = (data: AdminDraw[] = [draw], total = data.length, page = 1) => ({ data, total, page, limit: 20 });
const questionsPage = { data: [manualQuestion], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };

class TestWebSocket {
  static instances: TestWebSocket[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly close = vi.fn(() => this.onclose?.({ code: 1000 } as CloseEvent));
  constructor(readonly url: string) { TestWebSocket.instances.push(this); }
  open() { this.onopen?.({} as Event); }
  sendMessage(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
}

function ContextLayout() { return <Outlet context={user} />; }

function renderControl(search = `?eventId=${eventId}&roundId=${roundId}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/admin/draw-control${search}`]}><Routes><Route element={<ContextLayout />}><Route path="/admin/draw-control" element={<AdminDrawControl />} /></Route></Routes></MemoryRouter></QueryClientProvider>),
  };
}

describe('Admin Draw control', () => {
  beforeEach(() => {
    TestWebSocket.instances = [];
    vi.stubGlobal('WebSocket', TestWebSocket);
    vi.mocked(getAdminRound).mockResolvedValue(makeRound());
    vi.mocked(getLatestAdminDrawPage).mockResolvedValue(drawPage());
    vi.mocked(listAdminRoundDraws).mockResolvedValue(drawPage());
    vi.mocked(listAdminQuestions).mockResolvedValue(questionsPage);
  });

  afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('loads the selected Round, latest server Draw, paged history, and manual Question options', async () => {
    renderControl();
    expect(await screen.findByRole('heading', { name: 'Draw control' })).toBeInTheDocument();
    expect((await screen.findAllByText('DOCKER')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('RANDOM')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Draw random Question' })).toBeEnabled();
    expect(screen.getByLabelText('Manual Question')).toHaveTextContent('Which container tool is widely used?');
    expect(getAdminRound).toHaveBeenCalledWith(roundId, expect.any(AbortSignal));
    expect(listAdminQuestions).toHaveBeenCalledWith({ roundId, page: 1, limit: 20, signal: expect.any(AbortSignal) });
    expect(TestWebSocket.instances[0]?.url).toContain(`/api/v1/ws?eventId=${eventId}&roundId=${roundId}`);
  });

  it('does not guess selection or fetch Draw data without an Event and Round in the URL', async () => {
    renderControl('');
    expect(await screen.findByRole('status')).toHaveTextContent('Select an Event and Round');
    expect(screen.getByRole('link', { name: 'Select a Round' })).toHaveAttribute('href', '/admin/rounds');
    expect(getAdminRound).not.toHaveBeenCalled();
    expect(getLatestAdminDrawPage).not.toHaveBeenCalled();
  });

  it('creates exactly one deliberate random Draw and refreshes authoritative history', async () => {
    const saved = { ...draw, id: '9ed17b7f-089e-4a9f-a662-58f105aa9327', sequenceNumber: 2 };
    vi.mocked(getLatestAdminDrawPage).mockResolvedValueOnce(drawPage([draw])).mockResolvedValue(drawPage([saved]));
    vi.mocked(listAdminRoundDraws).mockResolvedValueOnce(drawPage([draw])).mockResolvedValue(drawPage([draw, saved], 2));
    vi.mocked(createRandomAdminDraw).mockResolvedValue(saved);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    const { client } = renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Draw random Question' }));
    await screen.findByText('RANDOM Draw 2 confirmed by the server.');
    expect(createRandomAdminDraw).toHaveBeenCalledWith(roundId, 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    expect(await screen.findAllByText('DRAW 2')).toHaveLength(2);
    expect(client.getQueryCache().findAll({ queryKey: ['admin-draws', user.id, eventId, roundId] }).length).toBeGreaterThanOrEqual(2);
  });

  it('retains the random Draw key after an ambiguous result and retries it after remount', async () => {
    const { ApiError } = await import('../../lib/api/client');
    vi.mocked(createRandomAdminDraw).mockRejectedValueOnce(new ApiError(503, 'Unavailable')).mockResolvedValueOnce(draw);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    const first = renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Draw random Question' }));
    expect(await screen.findByText(/draw result is uncertain/i)).toHaveTextContent(/history refresh was requested/i);
    first.unmount();
    vi.mocked(getAdminRound).mockResolvedValue(makeRound());
    const second = renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same random Draw' }));
    await screen.findByText('RANDOM Draw 1 confirmed by the server.');
    expect(vi.mocked(createRandomAdminDraw).mock.calls.map((call) => call[1])).toEqual([
      'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a', 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a',
    ]);
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
    second.unmount();
  });

  it('submits a confirmed manual Draw with the selected Question and server result', async () => {
    const saved = { ...draw, id: '9ed17b7f-089e-4a9f-a662-58f105aa9327', sequenceNumber: 2, drawMode: 'MANUAL' as const };
    vi.mocked(createManualAdminDraw).mockResolvedValue(saved);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('c506e506-6365-4899-b5b3-a7678867964c');
    renderControl();
    fireEvent.change(await screen.findByLabelText('Manual Question'), { target: { value: questionId } });
    fireEvent.click(screen.getByRole('button', { name: 'Create manual Draw' }));
    expect(await screen.findByText('MANUAL Draw 2 confirmed by the server.')).toBeInTheDocument();
    expect(createManualAdminDraw).toHaveBeenCalledWith(roundId, { questionId }, 'c506e506-6365-4899-b5b3-a7678867964c');
    expect(screen.getByLabelText('Manual Question')).toHaveValue('');
  });

  it('confirms a selected manual Question and displays the server conflict without claiming a Draw', async () => {
    const { ApiError } = await import('../../lib/api/client');
    vi.mocked(createManualAdminDraw).mockRejectedValue(new ApiError(409, 'Key has already been drawn'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('c506e506-6365-4899-b5b3-a7678867964c');
    renderControl();
    fireEvent.change(await screen.findByLabelText('Manual Question'), { target: { value: questionId } });
    fireEvent.click(screen.getByRole('button', { name: 'Create manual Draw' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Create a MANUAL Draw'));
    expect(await screen.findByText('Key has already been drawn')).toBeInTheDocument();
    expect(createManualAdminDraw).toHaveBeenCalledWith(roundId, { questionId }, 'c506e506-6365-4899-b5b3-a7678867964c');
    expect(screen.queryByText('MANUAL Draw 2 confirmed by the server.')).not.toBeInTheDocument();
  });

  it('does not create a Draw when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Draw random Question' }));
    expect(createRandomAdminDraw).not.toHaveBeenCalled();
  });

  it('submits at most one random command while the first request is pending', async () => {
    let finish!: (result: AdminDraw) => void;
    vi.mocked(createRandomAdminDraw).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderControl();
    const button = await screen.findByRole('button', { name: 'Draw random Question' });
    fireEvent.click(button);
    await waitFor(() => expect(createRandomAdminDraw).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Saving random Draw…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Saving random Draw…' }));
    expect(createRandomAdminDraw).toHaveBeenCalledOnce();
    finish({ ...draw, sequenceNumber: 2 });
    await screen.findByText('RANDOM Draw 2 confirmed by the server.');
  });

  it('keeps Draw commands unavailable outside ACTIVE and does not subscribe outside ACTIVE or PAUSED', async () => {
    vi.mocked(getAdminRound).mockResolvedValue(makeRound('RECOVERY_REQUIRED'));
    renderControl();
    expect(await screen.findByText(/Draw commands are available only when the server reports ACTIVE/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Draw random Question' })).not.toBeInTheDocument();
    expect(TestWebSocket.instances).toHaveLength(0);
    expect(createRandomAdminDraw).not.toHaveBeenCalled();
  });

  it('uses history REST after a scoped DRAW_CREATED event and ignores another Round event', async () => {
    const { client } = renderControl();
    await screen.findByText('Draw history');
    const socket = TestWebSocket.instances[0]!;
    socket.open();
    await waitFor(() => expect(getLatestAdminDrawPage).toHaveBeenCalledTimes(2));
    socket.sendMessage({ type: 'DRAW_CREATED', eventId, roundId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', occurredAt: '2026-10-17T10:01:00.000Z', payload: { sequence: 2, key: 'LINUX', question: 'Which OS?', drawnAt: '2026-10-17T10:01:00.000Z' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getLatestAdminDrawPage).toHaveBeenCalledTimes(2);
    socket.sendMessage({ type: 'DRAW_CREATED', eventId, roundId, occurredAt: '2026-10-17T10:01:00.000Z', payload: { sequence: 2, key: 'LINUX', question: 'Which OS?', drawnAt: '2026-10-17T10:01:00.000Z' } });
    await waitFor(() => expect(getLatestAdminDrawPage).toHaveBeenCalledTimes(3));
    expect(client.getQueryData(['admin-draws', user.id, eventId, roundId, 'latest'])).toBeDefined();
  });

  it('reconciles a scoped Draw event that arrives before the mutation response', async () => {
    let finish!: (result: AdminDraw) => void;
    vi.mocked(createRandomAdminDraw).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { client } = renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Draw random Question' }));
    const socket = TestWebSocket.instances[0]!;
    socket.sendMessage({ type: 'DRAW_CREATED', eventId, roundId, occurredAt: '2026-10-17T10:01:00.000Z', payload: { sequence: 2, key: 'LINUX', question: 'Which OS?', drawnAt: '2026-10-17T10:01:00.000Z' } });
    await waitFor(() => expect(getLatestAdminDrawPage).toHaveBeenCalledTimes(2));
    expect(client.getQueryData(['admin-draws', user.id, eventId, roundId, 'latest'])).toBeDefined();
    finish({ ...draw, sequenceNumber: 2, id: '9ed17b7f-089e-4a9f-a662-58f105aa9327' });
    await screen.findByText('RANDOM Draw 2 confirmed by the server.');
  });

  it('closes the Round WebSocket when the page unmounts', async () => {
    const view = renderControl();
    await screen.findByText('Draw history');
    const socket = TestWebSocket.instances[0]!;
    view.unmount();
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
