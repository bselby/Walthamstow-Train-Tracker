import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPoller, createRetry } from '../src/poller';

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

  it('ticks at once when the phone comes back online', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    await vi.advanceTimersByTimeAsync(0); // the first tick finishes
    window.dispatchEvent(new Event('online'));
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('does not start a tick while the last one is still waiting', async () => {
    let finish: () => void = () => {};
    const tick = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    startPoller(tick, 20_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(2);
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

describe('createRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once after the delay', () => {
    const run = vi.fn();
    createRetry(run, 3000).schedule();
    vi.advanceTimersByTime(2999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps a single retry pending however often it is asked', () => {
    const run = vi.fn();
    const retry = createRetry(run, 3000);
    retry.schedule();
    vi.advanceTimersByTime(1000);
    retry.schedule();
    retry.schedule();
    vi.advanceTimersByTime(3000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('can be scheduled again once it has run', () => {
    const run = vi.fn();
    const retry = createRetry(run, 3000);
    retry.schedule();
    vi.advanceTimersByTime(3000);
    retry.schedule();
    vi.advanceTimersByTime(3000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('cancel stops a pending retry', () => {
    const run = vi.fn();
    const retry = createRetry(run, 3000);
    retry.schedule();
    retry.cancel();
    vi.advanceTimersByTime(10_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not run while the tab is hidden', () => {
    const run = vi.fn();
    const retry = createRetry(run, 3000);
    retry.schedule();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    vi.advanceTimersByTime(3000);
    expect(run).not.toHaveBeenCalled();
    retry.schedule();
    vi.advanceTimersByTime(3000);
    expect(run).not.toHaveBeenCalled();
  });
});
