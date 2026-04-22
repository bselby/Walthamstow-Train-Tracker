import { describe, it, expect } from 'vitest';
import { FACTS, factAt } from '../src/facts';

const VALID_CATEGORIES = new Set(['line', 'station', 'train', 'local', 'default']);

describe('FACTS', () => {
  it('contains 23 curated facts', () => {
    expect(FACTS).toHaveLength(23);
  });

  it('every fact is 45 characters or fewer (fits on a narrow phone without wrapping)', () => {
    FACTS.forEach((fact, i) => {
      expect(fact.text.length, `fact #${i}: ${fact.text}`).toBeLessThanOrEqual(45);
    });
  });

  it('fact texts are all unique', () => {
    const texts = FACTS.map((f) => f.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('no fact starts with a lowercase letter (consistent capitalisation)', () => {
    FACTS.forEach((fact) => {
      const first = fact.text[0];
      expect(first).toBe(first.toUpperCase());
    });
  });

  it('every fact has a valid category', () => {
    FACTS.forEach((fact) => {
      expect(VALID_CATEGORIES.has(fact.category), `bad category on: ${fact.text}`).toBe(true);
    });
  });
});

describe('factAt', () => {
  it('returns the fact record at the given index', () => {
    expect(factAt(0)).toBe(FACTS[0]);
    expect(factAt(1)).toBe(FACTS[1]);
    expect(factAt(22)).toBe(FACTS[22]);
  });

  it('wraps past the end', () => {
    expect(factAt(FACTS.length)).toBe(FACTS[0]);
    expect(factAt(FACTS.length + 5)).toBe(FACTS[5]);
  });

  it('handles negative indices (legacy / corrupt stored values)', () => {
    expect(factAt(-1)).toBe(FACTS[FACTS.length - 1]);
    expect(factAt(-FACTS.length)).toBe(FACTS[0]);
  });
});
