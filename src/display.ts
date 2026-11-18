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

/** "12 seconds", "1 minute", "3 minutes": an age in words. */
function ageInWords(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** The data age under fresh live times: "updated 12 seconds ago". */
export function formatAge(ageMs: number): string {
  if (ageMs < 1000) return 'updated just now';
  return `updated ${ageInWords(ageMs)} ago`;
}

/** The data age once the live times are lost (board 12). */
export function formatLastLive(ageMs: number): string {
  return `Last live times ${ageInWords(ageMs)} ago`;
}
