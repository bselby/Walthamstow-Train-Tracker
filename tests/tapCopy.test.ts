import { describe, expect, it } from 'vitest';
import {
  NO_SIGNAL_LINE,
  placeholderLine,
  progressLine,
  rankUpLines,
  ticketBadgeLabel,
} from '../src/tapCopy';

describe('ticketBadgeLabel', () => {
  it('reads "Your ticket" before any train is timed', () => {
    expect(ticketBadgeLabel(0)).toBe('Your ticket');
  });

  it('names the grade and the count, singular for one', () => {
    expect(ticketBadgeLabel(1)).toBe('Spotter · 1 train');
  });

  it('uses digits and plural for counts above one', () => {
    expect(ticketBadgeLabel(4)).toBe('Spotter · 4 trains');
    expect(ticketBadgeLabel(15)).toBe('Signaller · 15 trains');
    expect(ticketBadgeLabel(61)).toBe('Station Master · 61 trains');
  });
});

describe('progressLine', () => {
  it('counts to the next grade, with the to-go count as a word', () => {
    expect(progressLine(4)).toBe("That's 4 trains timed. One more and you're a Guard.");
  });

  it('uses singular "train" for one timed', () => {
    expect(progressLine(1)).toBe("That's 1 train timed. Four more and you're a Guard.");
  });

  it('spells a to-go count of ten as a word', () => {
    expect(progressLine(5)).toBe("That's 5 trains timed. Ten more and you're a Signaller.");
  });

  it('gives no next grade once the Station Master is reached', () => {
    expect(progressLine(60)).toBe("That's 60 trains timed. You're the Station Master.");
  });

  it('uses digits for a to-go count above ten', () => {
    expect(progressLine(15)).toBe("That's 15 trains timed. 15 more and you're a Driver.");
  });
});

describe('rankUpLines', () => {
  it('gives the promotion, the count in words and the kit line for Guard', () => {
    expect(rankUpLines(5)).toEqual({
      title: 'Promoted to Guard.',
      body: 'Five trains timed. Whistle and flag at the ready.',
      next: "Ten more and you're a Signaller.",
    });
  });

  it('names Spotter on the first train and uses singular "train"', () => {
    const lines = rankUpLines(1);
    expect(lines.title).toBe('Promoted to Spotter.');
    expect(lines.body).toBe('One train timed. Notebook at the ready.');
    expect(lines.next).toBe("Four more and you're a Guard.");
  });

  it('uses digits above ten and gives no next grade at the top', () => {
    expect(rankUpLines(60)).toEqual({
      title: 'Promoted to Station Master.',
      body: '60 trains timed. Top hat optional.',
      next: null,
    });
  });
});

describe('placeholderLine', () => {
  it('rounds up to whole minutes at two minutes or more', () => {
    expect(placeholderLine(120000)).toBe('Yellow button pops up here in 2 min');
  });

  it('says "a minute" just under two minutes', () => {
    expect(placeholderLine(119999)).toBe('Yellow button pops up here in a minute');
  });
});

describe('NO_SIGNAL_LINE', () => {
  it('is the exact no-signal wording', () => {
    expect(NO_SIGNAL_LINE).toBe("No signal, so that one didn't send. It still counts on your ticket.");
  });
});
