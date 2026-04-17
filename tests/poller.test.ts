import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPoller } from '../src/poller';

describe('startPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires tick immediately on start', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('fires tick again after the interval', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('pauses when document becomes hidden and resumes on visible', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    expect(tick).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1); // no further calls while hidden

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(tick).toHaveBeenCalledTimes(2); // immediate tick on resume
  });

  it('stop() cancels further ticks', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    const stop = startPoller(tick, 20_000);
    expect(tick).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
