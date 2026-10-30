import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/client';
import { queryClient } from './queryClient';

afterEach(() => queryClient.clear());

describe('server read recovery', () => {
  for (const status of [0, 500, 502, 503, 504]) {
    it(`recovers automatically after a temporary ${status} read failure`, async () => {
      const read = vi.fn().mockRejectedValueOnce(new ApiError(status, 'Temporary failure')).mockResolvedValue({ id: 'round-1' });
      await expect(queryClient.fetchQuery({ queryKey: ['recovery', status], queryFn: read, retryDelay: 0 })).resolves.toEqual({ id: 'round-1' });
      expect(read).toHaveBeenCalledTimes(2);
    });
  }

  it('stops after two retries during an ongoing outage', async () => {
    const read = vi.fn().mockRejectedValue(new ApiError(503, 'Unavailable'));
    await expect(queryClient.fetchQuery({ queryKey: ['outage'], queryFn: read, retryDelay: 0 })).rejects.toMatchObject({ status: 503 });
    expect(read).toHaveBeenCalledTimes(3);
  });

  for (const error of [new ApiError(401, 'Sign in'), new ApiError(403, 'Forbidden'), new ApiError(404, 'Missing'), new ApiError(409, 'Conflict'), new ApiError(429, 'Rate limited'), new Error('Unexpected bug'), new DOMException('Cancelled', 'AbortError')]) {
    it(`does not retry ${error.message}`, async () => {
      const read = vi.fn().mockRejectedValue(error);
      await expect(queryClient.fetchQuery({ queryKey: ['permanent', error.message], queryFn: read, retryDelay: 0 })).rejects.toBe(error);
      expect(read).toHaveBeenCalledTimes(1);
    });
  }

  it('does not retry a failed mutation', async () => {
    const action = vi.fn().mockRejectedValue(new ApiError(503, 'Unavailable'));
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: action });
    await expect(mutation.execute(undefined)).rejects.toMatchObject({ status: 503 });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
