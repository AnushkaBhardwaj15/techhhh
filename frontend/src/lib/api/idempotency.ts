import { ApiError } from './client';

function storageKey(scope: string) {
  return `tech-tombola:idempotency:${scope}`;
}

export function hasIdempotencyKey(scope: string) {
  return sessionStorage.getItem(storageKey(scope)) !== null;
}

export function getOrCreateIdempotencyKey(scope: string) {
  const key = storageKey(scope);
  const current = sessionStorage.getItem(key) ?? crypto.randomUUID();
  sessionStorage.setItem(key, current);
  return current;
}

export function clearIdempotencyKey(scope: string) {
  sessionStorage.removeItem(storageKey(scope));
}

export function isDefinitiveClientRejection(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408;
}
