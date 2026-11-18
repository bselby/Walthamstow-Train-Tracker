import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

describe('picture book tokens', () => {
  it('drops Big Shoulders', () => {
    expect(css).not.toMatch(/Big Shoulders/);
    expect(html).not.toMatch(/Big\+Shoulders/);
  });
  it('has the light palette', () => {
    expect(css).toMatch(/--bg:\s*#DCEEF5/i);
    expect(css).toMatch(/--radius-card:\s*22px/);
    for (const t of ['card', 'ink', 'dim', 'weaver', 'suffragette', 'yellow', 'ticket', 'pin', 'freight', 'container', 'freight-tag-bg', 'freight-tag-ink', 'border']) {
      expect(css).toMatch(new RegExp(`--${t}:`));
    }
  });
  it('has a dark palette', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*--bg:\s*#121829/i);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*--card:\s*#1D2539/i);
  });
  it('loads Baloo 2 and Nunito', () => {
    expect(html).toMatch(/family=Baloo\+2/);
    expect(html).toMatch(/family=Nunito/);
    expect(css).toMatch(/--font-display:\s*'Baloo 2'/);
    expect(css).toMatch(/--font-body:\s*'Nunito'/);
  });
  it('declares both colour schemes', () => {
    expect(css).toMatch(/color-scheme:\s*light dark/);
  });
});
