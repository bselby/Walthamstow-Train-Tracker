import { LEVELS, levelFor } from './tap';

/** Counts of 1-10 are words, above ten digits. Only used at the start of a sentence. */
const WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
] as const;

function countWord(n: number): string {
  return n >= 1 && n <= 10 ? WORDS[n - 1] : String(n);
}

function trains(n: number): string {
  return n === 1 ? '1 train' : `${n} trains`;
}

export const NO_SIGNAL_LINE = "No signal, so that one didn't send. It still counts on your ticket.";

export function ticketBadgeLabel(taps: number): string {
  const { name } = levelFor(taps);
  if (!name) return 'Your ticket';
  return `${name} · ${trains(taps)}`;
}

export function progressLine(taps: number): string {
  const { name, next } = levelFor(taps);
  const timed = `That's ${taps} ${taps === 1 ? 'train' : 'trains'} timed.`;
  if (!next) return `${timed} You're the ${name}.`;
  const toGo = next.taps - taps;
  return `${timed} ${countWord(toGo)} more and you're a ${next.name}.`;
}

export function rankUpLines(taps: number): { title: string; body: string; next: string | null } {
  const { name, next } = levelFor(taps);
  const level = LEVELS.find((l) => l.name === name);
  const timed = `${countWord(taps)} ${taps === 1 ? 'train' : 'trains'} timed.`;
  return {
    title: `Promoted to ${name}.`,
    body: `${timed} ${level ? level.kit : ''}`.trimEnd(),
    next: next ? `${countWord(next.taps - taps)} more and you're a ${next.name}.` : null,
  };
}

/** The waiting box in a direction card before the yellow button is due.
 *  It explains the button every time: most visitors have not read the
 *  explainer. Tapping it opens How it works. */
export const PLACEHOLDER = {
  title: 'Help make this time spot-on',
  body: 'Just before the train comes, a yellow button appears here. Tap it as the train passes you.',
  cue: "What's this?",
} as const;

/** The ticket page's progress line before the first train is timed. */
export const NO_TRAINS_LINE = 'No trains timed yet. Time one to become a Spotter.';
