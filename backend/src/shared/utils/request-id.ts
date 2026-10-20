import { randomUUID } from 'node:crypto';

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export function normalizeRequestId(incomingId?: string | string[]): string {
  if (Array.isArray(incomingId)) {
    incomingId = incomingId[0];
  }

  if (typeof incomingId === 'string' && VALID_REQUEST_ID_REGEX.test(incomingId)) {
    return incomingId;
  }

  return `req_${randomUUID()}`;
}
