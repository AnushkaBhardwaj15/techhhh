import { RateLimitError } from '../../shared/errors/app-error.ts';

export interface RateLimitOptions {
  maxFailures?: number;
  windowMs?: number;
}

export class LoginRateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;

  constructor(options: RateLimitOptions = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 60 * 1000;
  }

  private cleanOldAttempts(key: string, now: number): number[] {
    const timestamps = this.attempts.get(key) || [];
    const valid = timestamps.filter((t) => now - t < this.windowMs);
    if (valid.length === 0) {
      this.attempts.delete(key);
    } else {
      this.attempts.set(key, valid);
    }
    return valid;
  }

  checkLimit(identifier: string, ip: string): void {
    const key = `${identifier.trim().toLowerCase()}:${ip.trim()}`;
    const now = Date.now();
    const validAttempts = this.cleanOldAttempts(key, now);

    if (validAttempts.length >= this.maxFailures) {
      const oldest = validAttempts[0];
      const retryAfterSeconds = Math.ceil((this.windowMs - (now - oldest)) / 1000);
      throw new RateLimitError(
        `Too many failed login attempts. Please try again in ${retryAfterSeconds} seconds.`
      );
    }
  }

  recordFailure(identifier: string, ip: string): void {
    const key = `${identifier.trim().toLowerCase()}:${ip.trim()}`;
    const now = Date.now();
    const validAttempts = this.cleanOldAttempts(key, now);
    validAttempts.push(now);
    this.attempts.set(key, validAttempts);
  }

  reset(identifier: string, ip: string): void {
    const key = `${identifier.trim().toLowerCase()}:${ip.trim()}`;
    this.attempts.delete(key);
  }

  clearAll(): void {
    this.attempts.clear();
  }
}

export const loginRateLimiter = new LoginRateLimiter();
