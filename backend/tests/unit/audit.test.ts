import { describe, expect, it } from 'bun:test';
import { buildAuditPayload, isValidAuditAction } from '../../src/modules/audit/audit.domain.ts';
import { AUDIT_ACTIONS, type AuditAction } from '../../src/modules/audit/audit.types.ts';
import { ValidationError } from '../../src/shared/errors/app-error.ts';

describe('Audit domain logic & payload builder', () => {
  it('validates all PRD audit action vocabulary', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(isValidAuditAction(action)).toBe(true);
    }
    expect(isValidAuditAction('INVALID_ACTION')).toBe(false);
  });

  it('builds valid payload for authenticated actor and request context', () => {
    const payload = buildAuditPayload({
      actorId: '11111111-1111-1111-1111-111111111111',
      actorType: 'ADMIN',
      action: 'DRAW_CREATED',
      resourceType: 'draw',
      resourceId: 'draw-123',
      metadata: { sequence: 1, key: 'DOCKER' },
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0 Test Agent',
      requestId: 'req_test_123',
    });

    expect(payload.actorId).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload.actorType).toBe('ADMIN');
    expect(payload.action).toBe('DRAW_CREATED');
    expect(payload.resourceType).toBe('draw');
    expect(payload.resourceId).toBe('draw-123');
    expect(payload.metadata).toEqual({ sequence: 1, key: 'DOCKER' });
    expect(payload.ip).toBe('192.168.1.1');
    expect(payload.userAgent).toBe('Mozilla/5.0 Test Agent');
    expect(payload.requestId).toBe('req_test_123');
    expect(payload.createdAt instanceof Date).toBe(true);
  });

  it('builds valid payload for anonymous security event with null fields', () => {
    const payload = buildAuditPayload({
      action: 'LOGIN_FAILED',
      resourceType: 'auth',
      ip: '10.0.0.1',
      requestId: 'req_anon_1',
    });

    expect(payload.actorId).toBeNull();
    expect(payload.actorType).toBeNull();
    expect(payload.resourceId).toBeNull();
    expect(payload.metadata).toBeNull();
    expect(payload.action).toBe('LOGIN_FAILED');
  });

  it('rejects invalid audit action string', () => {
    expect(() =>
      buildAuditPayload({
        action: 'UNOFFICIAL_HACK' as AuditAction,
        resourceType: 'system',
      })
    ).toThrow(ValidationError);
  });

  it('rejects empty or whitespace resourceType', () => {
    expect(() =>
      buildAuditPayload({
        action: 'ROUND_STARTED',
        resourceType: '   ',
      })
    ).toThrow(ValidationError);
  });

  it('recursively redacts passwords, tokens, secrets, cookies, credentials in metadata', () => {
    const payload = buildAuditPayload({
      action: 'PARTICIPANT_CREATED',
      resourceType: 'participant',
      metadata: {
        email: 'alice@example.com',
        password: 'PlaintextPassword123!',
        credentials: {
          tempSecret: 'secret_123',
          cookieToken: 'auth_jwt_cookie_val',
        },
        nonSensitiveField: 42,
      },
    });

    const meta = payload.metadata as Record<string, any>;
    expect(meta.email).toBe('alice@example.com');
    expect(meta.nonSensitiveField).toBe(42);
    expect(meta.password).toBe('***');
    expect(meta.credentials).toBe('***');
  });

  it('rejects oversized metadata exceeding size bounds', () => {
    const giantObject: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) {
      giantObject[`key_${i}`] = 'abcdefghijklmnopqrstuvwxyz0123456789';
    }

    expect(() =>
      buildAuditPayload({
        action: 'ROUND_COMPLETED',
        resourceType: 'round',
        metadata: giantObject,
      })
    ).toThrow(/Audit metadata exceeds maximum/);
  });
});
