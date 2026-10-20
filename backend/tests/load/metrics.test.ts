import { describe, expect, it } from 'bun:test';
import { percentile, summarizeLatencies, thresholdFailures } from './metrics.ts';

describe('load qualification metrics', () => {
  it('calculates nearest-rank percentiles and response error rates', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(summarizeLatencies([40, 10, 30, 20], 1)).toEqual({
      requests: 4,
      errors: 1,
      errorRate: 0.25,
      p50Ms: 20,
      p95Ms: 40,
      p99Ms: 40,
      maxMs: 40,
    });
  });

  it('reports every violated latency and error-rate threshold', () => {
    expect(thresholdFailures('ticket-read', { requests: 2, errors: 1, errorRate: 0.5, p50Ms: 250, p95Ms: 600, p99Ms: 1200, maxMs: 1200 }))
      .toEqual(['ticket-read error rate 50.0% exceeds 0.0%', 'ticket-read p50 250ms must be < 200ms', 'ticket-read p95 600ms must be < 500ms', 'ticket-read p99 1200ms must be < 1000ms']);
  });

  it('handles an empty phase and rejects invalid percentile inputs', () => {
    expect(summarizeLatencies([], 0)).toEqual({ requests: 0, errors: 0, errorRate: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 });
    expect(() => percentile([], 0.5)).toThrow();
    expect(() => percentile([1], 1.1)).toThrow();
  });
});
