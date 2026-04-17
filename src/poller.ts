export type TickFn = () => Promise<void>;

export function startPoller(tick: TickFn, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const runTick = () => {
    tick().catch(() => {
      // swallow — the tick function is responsible for surfacing errors via state
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

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (document.visibilityState === 'visible') {
    start();
  }

  return () => {
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
