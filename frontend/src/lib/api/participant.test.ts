import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentRound, getParticipantEvent } from './participant';

afterEach(() => vi.unstubAllGlobals());

describe('participant API contracts', () => {
  it('parses the assigned event envelope and server timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ event: { id: 'e1', title: 'Autumn', description: null, status: 'READY', scheduledAt: '2026-10-17T14:00:00.000Z', startedAt: null, completedAt: null, createdAt: '2026-10-16T14:00:00.000Z', updatedAt: '2026-10-17T14:00:00.000Z' } }), { headers: { 'content-type': 'application/json' } })));
    await expect(getParticipantEvent()).resolves.toMatchObject({ id: 'e1', status: 'READY', scheduledAt: '2026-10-17T14:00:00.000Z', createdAt: '2026-10-16T14:00:00.000Z' });
  });

  it('parses only server-provided current round fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ round: { id: 'r1', eventId: 'e1', sequenceNumber: 1, name: 'Opening', status: 'RECOVERY_REQUIRED', patterns: [], createdAt: '2026-10-17T14:00:00.000Z', updatedAt: '2026-10-17T14:00:00.000Z' } }), { headers: { 'content-type': 'application/json' } })));
    await expect(getCurrentRound()).resolves.toMatchObject({ id: 'r1', eventId: 'e1', name: 'Opening', status: 'RECOVERY_REQUIRED', patterns: [] });
  });

  it('rejects unknown server lifecycle values instead of guessing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ event: { id: 'e1', title: 'Autumn', description: null, status: 'STARTING', scheduledAt: null, startedAt: null, completedAt: null } }), { headers: { 'content-type': 'application/json' } })));
    await expect(getParticipantEvent()).rejects.toMatchObject({ name: 'ZodError' });
  });
});
