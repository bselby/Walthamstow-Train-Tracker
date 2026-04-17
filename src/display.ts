export type CountdownLabel =
  | { kind: 'now'; text: string }
  | { kind: 'just-crossed'; text: string }
  | { kind: 'seconds'; text: string }
  | { kind: 'minutes'; text: string };

export function formatCountdown(bridgeTimeSeconds: number): CountdownLabel {
  if (bridgeTimeSeconds < 0) {
    return { kind: 'just-crossed', text: 'just crossed' };
  }
  if (bridgeTimeSeconds <= 10) {
    return { kind: 'now', text: 'NOW' };
  }
  if (bridgeTimeSeconds < 60) {
    return { kind: 'seconds', text: `${Math.floor(bridgeTimeSeconds)} sec` };
  }
  return { kind: 'minutes', text: `${Math.floor(bridgeTimeSeconds / 60)} min` };
}

export function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `updated ${seconds}s ago`;
  return `updated ${Math.floor(seconds / 60)}m ago`;
}
