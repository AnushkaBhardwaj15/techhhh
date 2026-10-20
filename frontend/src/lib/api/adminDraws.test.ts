import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { createManualAdminDraw, createRandomAdminDraw, getLatestAdminDrawPage, listAdminRoundDraws } from './adminDraws';

vi.mock('./client', () => ({ apiRequest: vi.fn() }));

const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const draw = {
  id: '6d6204a3-0a5b-4dc1-a217-84b0f8ac99c7', roundId, sequenceNumber: 3, drawMode: 'MANUAL',
  questionId: '229f4f40-cff3-48a5-b177-8fbd55c1ed3b', keyId: '302fe3d0-63bf-4cbb-9e8b-5e03b588f26e',
  questionText: 'Which container tool is widely used?', keyValue: 'DOCKER', drawnAt: '2026-10-17T10:00:00.000Z',
};

describe('admin draw API', () => {
  afterEach(() => vi.clearAllMocks());

  it('lists persisted draws with the supported page contract and abort signal', async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue({ data: [draw], total: 43, page: 2, limit: 20 });
    await expect(listAdminRoundDraws({ roundId, page: 2, limit: 20, signal })).resolves.toEqual({ data: [draw], total: 43, page: 2, limit: 20 });
    expect(apiRequest).toHaveBeenCalledWith(`/admin/rounds/${roundId}/draws?page=2&limit=20`, { signal });
  });

  it('uses REST metadata to request the latest history page', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ data: [], total: 43, page: 1, limit: 20 })
      .mockResolvedValueOnce({ data: [draw], total: 43, page: 3, limit: 20 });
    await expect(getLatestAdminDrawPage(roundId)).resolves.toMatchObject({ data: [draw], page: 3 });
    expect(apiRequest).toHaveBeenNthCalledWith(1, `/admin/rounds/${roundId}/draws?page=1&limit=20`, { signal: undefined });
    expect(apiRequest).toHaveBeenNthCalledWith(2, `/admin/rounds/${roundId}/draws?page=3&limit=20`, { signal: undefined });
  });

  it('submits one random Draw with the required idempotency key and parses the saved Draw', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ draw });
    await expect(createRandomAdminDraw(roundId, 'retry-key')).resolves.toEqual(draw);
    expect(apiRequest).toHaveBeenCalledWith(`/admin/rounds/${roundId}/draws`, { method: 'POST', headers: { 'Idempotency-Key': 'retry-key' } });
  });

  it('submits the selected Question ID and required key for a manual Draw', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ draw });
    await expect(createManualAdminDraw(roundId, { questionId: draw.questionId }, 'manual-key')).resolves.toEqual(draw);
    expect(apiRequest).toHaveBeenCalledWith(`/admin/rounds/${roundId}/draws/manual`, { method: 'POST', headers: { 'Idempotency-Key': 'manual-key' }, body: JSON.stringify({ questionId: draw.questionId }) });
  });

  it('rejects malformed Draw responses and invalid manual Question IDs at the API boundary', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ draw: { ...draw, sequenceNumber: 0 } });
    await expect(createRandomAdminDraw(roundId, 'retry-key')).rejects.toThrow();
    await expect(createManualAdminDraw(roundId, { questionId: 'not-a-uuid' }, 'manual-key')).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledOnce();
  });
});
