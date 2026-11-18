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
  it('keeps Baloo 2 weights within the loaded 600-800', () => {
    expect(css).not.toMatch(/font-weight:\s*900/);
  });
  it('uses a darker light-mode Suffragette text green', () => {
    expect(css).toMatch(/--suffragette-text:\s*#(?!1E7B4B)[0-9a-f]{6}/i);
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
  it('has no dead freight or bridge marker rules', () => {
    expect(css).not.toMatch(/\.strip-freight-svg|\.freight-(body|roof|window|bogie|container)|\.strip-bridge/);
  });
  it('outlines the freight drawing on the dark card', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)[^}]*\{[^}]*\.train-freight[^{]*\{[^}]*(drop-shadow|stroke)/);
  });
});

describe('timing slot', () => {
  it('keeps the button height in every state, so nothing below jumps', () => {
    const slot = css.match(/\.tap-slot\s*\{([^}]*)\}/);
    expect(slot).not.toBeNull();
    const button = css.match(/\.tap-button\s*\{([^}]*)\}/)!;
    const slotMin = slot![1].match(/min-height:\s*([^;]+);/)![1].trim();
    const buttonMin = button[1].match(/min-height:\s*([^;]+);/)![1].trim();
    expect(slotMin).toBe(buttonMin);
  });

  it('has no rules for the old ticket strip or register', () => {
    expect(css).not.toMatch(/\.ask-strip|\.tap-register|\.ticket-hole|\.tap-notice/);
  });
});
