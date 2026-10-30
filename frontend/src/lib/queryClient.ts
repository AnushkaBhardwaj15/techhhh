import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

export function retryTransientRead(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && [0, 500, 502, 503, 504].includes(error.status);
}

export const queryClient = new QueryClient({ defaultOptions: {
  queries: { retry: retryTransientRead, staleTime: 15_000 },
  mutations: { retry: false },
} });
