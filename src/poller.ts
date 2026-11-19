export type TickFn = () => Promise<void>;

export function startPoller(tick: TickFn, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  // One tick at a time: a slow answer is not piled on by the next interval.
  let inFlight = false;
  const runTick = () => {
    if (inFlight) return;
    inFlight = true;
    tick()
      .catch(() => {
        // swallow — the tick function is responsible for surfacing errors via state
      })
      .finally(() => {
        inFlight = false;
      });
  };

  const start = () => {
    if (timer !== null || stopped) return;
    runTick();
    timer = setInterval(runTick, intervalMs);
  };

  const pause = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const onVisibilityChange = () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') {
      start();
    } else {
      pause();
    }
  };

  // Back online: fetch now rather than at the next interval.
  const onOnline = () => {
    if (!stopped && timer !== null) runTick();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);

  if (document.visibilityState === 'visible') {
    start();
  }

  return () => {
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
  };
}

/**
 * One delayed retry, never more than one pending. `schedule()` while a retry
 * is already waiting does nothing, `cancel()` drops it, and nothing runs
 * while the tab is hidden (the poller picks up again when it is shown).
 */
export function createRetry(run: () => void, delayMs: number): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) return;
      if (document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        timer = null;
        if (document.visibilityState === 'visible') run();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
