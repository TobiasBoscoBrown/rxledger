/**
 * Exponential backoff with full jitter, used for outbound vendor calls
 * (pharmacy fulfillment, payments, identity). Retries are bounded and only
 * fire for errors the caller deems retryable — a 4xx contract violation should
 * never be retried, a 503 or socket reset should.
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Decide whether a given error is worth retrying. Default: always. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Injectable sleep + RNG for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  // Full jitter: random in [0, exponential]. Spreads retries, avoids thundering herd.
  return Math.floor(random() * exponential);
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    shouldRetry = () => true,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  if (maxAttempts < 1) throw new Error('maxAttempts must be >= 1');

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) break;
      await sleep(computeBackoffDelay(attempt, baseDelayMs, maxDelayMs, random));
    }
  }
  throw lastError;
}
