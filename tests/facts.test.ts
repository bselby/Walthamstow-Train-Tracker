import { describe, it, expect } from 'vitest';
import { FACTS, factAt } from '../src/facts';

describe('FACTS', () => {
  it('contains 23 curated facts', () => {
    expect(FACTS).toHaveLength(23);
  });

  it('every fact is 45 characters or fewer (fits on a narrow phone without wrapping)', () => {
    FACTS.forEach((fact, i) => {
      expect(fact.length, `fact #${i}: ${fact}`).toBeLessThanOrEqual(45);
    });
  });

  it('facts are all unique', () => {
    expect(new Set(FACTS).size).toBe(FACTS.length);
  });

  it('no fact starts with a lowercase letter (consistent capitalisation)', () => {
    FACTS.forEach((fact) => {
      const first = fact[0];
      expect(first).toBe(first.toUpperCase());
    });
  });
});

describe('factAt', () => {
  it('returns the fact at the given index', () => {
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
