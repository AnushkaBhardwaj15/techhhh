import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportDiagnostic } from './diagnostics';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('reportDiagnostic', () => {
  it('uses a local correlation ID and never throws when crypto UUID support is unavailable', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('crypto', {});

    expect(() => reportDiagnostic('render')).not.toThrow();
    expect(errorLog).toHaveBeenCalledWith('Tech Tambola diagnostic', { correlationId: expect.stringMatching(/^local-\d+$/), type: 'render' });
  });
});
