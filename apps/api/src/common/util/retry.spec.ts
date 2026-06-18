import { retry, computeBackoffDelay } from './retry';

describe('computeBackoffDelay', () => {
  it('grows exponentially and is capped at maxDelay', () => {
    const max = (attempt: number) => computeBackoffDelay(attempt, 100, 1000, () => 1);
    expect(max(1)).toBe(100);
    expect(max(2)).toBe(200);
    expect(max(3)).toBe(400);
    expect(max(10)).toBe(1000); // capped
  });

  it('applies full jitter in [0, exponential]', () => {
    expect(computeBackoffDelay(3, 100, 1000, () => 0)).toBe(0);
    expect(computeBackoffDelay(3, 100, 1000, () => 0.5)).toBe(200);
  });
});

describe('retry', () => {
  const noSleep = () => Promise.resolve();

  it('returns on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxAttempts then throws the last error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(
      retry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep, random: () => 0 }),
    ).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('eventually succeeds within the attempt budget', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockResolvedValue('done');
    await expect(retry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep, random: () => 0 })).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('contract'));
    await expect(
      retry(fn, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep, shouldRetry: () => false }),
    ).rejects.toThrow('contract');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid attempt budget', async () => {
    await expect(retry(async () => 1, { maxAttempts: 0, baseDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow();
  });
});
