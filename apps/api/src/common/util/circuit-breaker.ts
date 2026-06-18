/**
 * A minimal circuit breaker for vendor adapters. Each external dependency
 * (pharmacy, PSP, identity) gets its own breaker so one flaky vendor can't
 * exhaust workers or cascade into the rest of the platform.
 *
 *   CLOSED     -> normal; failures counted. At threshold -> OPEN.
 *   OPEN       -> fail fast for `resetTimeoutMs`, then -> HALF_OPEN.
 *   HALF_OPEN  -> allow one trial. Success -> CLOSED, failure -> OPEN.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit '${name}' is open`);
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  now?: () => number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private openedAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.options.resetTimeoutMs) {
        this.state = 'half_open';
      } else {
        throw new CircuitOpenError(this.options.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount += 1;
    if (this.state === 'half_open' || this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}
