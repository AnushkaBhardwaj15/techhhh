import { describe, expect, it } from 'bun:test';
import { normalizeRequestId } from '../../src/shared/utils/request-id.ts';

describe('Request ID normalization', () => {
  it('accepts valid incoming request IDs', () => {
    const validIds = [
      'req_12345678',
      'abc-def-123-456',
      'TRACE_ID_1234567890',
      'abcdef1234567890',
    ];

    for (const id of validIds) {
      expect(normalizeRequestId(id)).toBe(id);
    }
  });

  it('generates a new request ID when none is provided', () => {
    const generated = normalizeRequestId(undefined);
    expect(generated.startsWith('req_')).toBe(true);
    expect(generated.length).toBeGreaterThan(10);
  });

  it('replaces malformed request IDs', () => {
    const malformedIds = [
      'short', // too short (< 8 chars)
      'has spaces in it 123456',
      '<script>alert(1)</script>',
      'req;drop table users;',
      'a'.repeat(65), // too long (> 64 chars)
    ];

    for (const badId of malformedIds) {
      const result = normalizeRequestId(badId);
      expect(result).not.toBe(badId);
      expect(result.startsWith('req_')).toBe(true);
    }
  });

  it('handles array headers cleanly', () => {
    const validArray = ['req_trace_987654321', 'second_ignored'];
    expect(normalizeRequestId(validArray)).toBe('req_trace_987654321');
  });
});
