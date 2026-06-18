import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  const ok = () => Promise.resolve('ok');
  const fail = () => Promise.reject(new Error('down'));

  it('starts closed and passes through successes', async () => {
    const cb = new CircuitBreaker({ name: 't', failureThreshold: 3, resetTimeoutMs: 1000 });
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('opens after the failure threshold and then fails fast', async () => {
    const cb = new CircuitBreaker({ name: 't', failureThreshold: 2, resetTimeoutMs: 1000 });
    await expect(cb.execute(fail)).rejects.toThrow('down');
    await expect(cb.execute(fail)).rejects.toThrow('down');
    expect(cb.getState()).toBe('open');
    // Now fails fast without calling through.
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('half-opens after the reset timeout and closes on a successful trial', async () => {
    let now = 0;
    const cb = new CircuitBreaker({ name: 't', failureThreshold: 1, resetTimeoutMs: 500, now: () => now });
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe('open');
    now = 600; // past reset window
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('re-opens if the half-open trial fails', async () => {
    let now = 0;
    const cb = new CircuitBreaker({ name: 't', failureThreshold: 1, resetTimeoutMs: 500, now: () => now });
    await expect(cb.execute(fail)).rejects.toThrow();
    now = 600;
    await expect(cb.execute(fail)).rejects.toThrow('down');
    expect(cb.getState()).toBe('open');
  });
});
