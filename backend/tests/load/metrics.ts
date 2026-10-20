export interface LatencySummary {
  requests: number;
  errors: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export function percentile(values: number[], quantile: number): number {
  if (values.length === 0 || quantile < 0 || quantile > 1) throw new Error('Percentile requires values and a quantile from 0 to 1');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

export function summarizeLatencies(values: number[], errors: number): LatencySummary {
  const count = values.length;
  if (!count) return { requests: 0, errors, errorRate: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  return {
    requests: count,
    errors,
    errorRate: errors / count,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: Math.max(...values),
  };
}

export function thresholdFailures(name: string, result: LatencySummary): string[] {
  const failures: string[] = [];
  if (result.errorRate > 0) failures.push(`${name} error rate ${(result.errorRate * 100).toFixed(1)}% exceeds 0.0%`);
  if (result.p50Ms >= 200) failures.push(`${name} p50 ${result.p50Ms}ms must be < 200ms`);
  if (result.p95Ms >= 500) failures.push(`${name} p95 ${result.p95Ms}ms must be < 500ms`);
  if (result.p99Ms >= 1000) failures.push(`${name} p99 ${result.p99Ms}ms must be < 1000ms`);
  return failures;
}
