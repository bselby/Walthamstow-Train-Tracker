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
  const rule = (sel: string) => {
    const m = css.match(new RegExp(`(^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
    expect(m, sel).not.toBeNull();
    return m![2];
  };

  it('has one fixed height that its content cannot grow', () => {
    const slot = rule('.tap-slot');
    expect(slot).toMatch(/(^|[;\s])height:\s*7\.5rem/);
    expect(slot).not.toMatch(/min-height/);
    expect(slot).toMatch(/overflow:\s*hidden/);
    // No other rule sizes the slot by state.
    expect(css).not.toMatch(/\.tap-slot[.\[][^{]*\{[^}]*height/);
  });

  it('has no rules for the old ticket strip, register or holes', () => {
    expect(css).not.toMatch(/\.ask-strip|\.tap-register|\.ticket-hole|\.tap-notice|\.tap-hole/);
  });
});

describe('ticket badge', () => {
  it('is itself at least 44px tall and does not clip its own target', () => {
    const badge = css.match(/\n\.ticket-badge\s*\{([^}]*)\}/)![1];
    expect(badge).toMatch(/min-height:\s*(2\.75rem|44px)/);
    expect(badge).not.toMatch(/overflow:\s*hidden/);
  });
});

describe('compact layout', () => {
  const compact = css.match(/@media \(max-height: 600px\)\s*\{([\s\S]*?)\n\}/);
  it('has a short-screen block that shrinks the countdown, button and slot', () => {
    expect(compact).not.toBeNull();
    const block = compact![1];
    expect(block).toMatch(/\.value-num\s*\{[^}]*font-size/);
    expect(block).toMatch(/\.tap-button-main\s*\{[^}]*font-size/);
    // One fixed height in every state there too.
    expect(block).toMatch(/\.tap-slot\s*\{[^}]*(^|[;\s])height:\s*[\d.]+rem/);
    expect(block).not.toMatch(/\.tap-slot[.\[][^{]*\{[^}]*height/);
  });
});
