import { describe, expect, it } from 'vitest';
import {
  TAP_STORAGE_KEY,
  askKind,
  buttonsEnabled,
  chooseHelp,
  hasTapped,
  loadTapState,
  recordTap,
  resetChoice,
  saveTapState,
} from '../src/tapStore';

const DAY = 24 * 60 * 60 * 1000;
const fresh = () => loadTapState(() => null, () => 'dev-1');

describe('loadTapState', () => {
  it('returns a fresh state with the new id when nothing is stored', () => {
    const s = fresh();
    expect(s.choice).toBe('unset');
    expect(s.taps).toBe(0);
    expect(s.deviceId).toBe('dev-1');
    expect(s.lastTap).toBeNull();
  });

  it('returns stored state and keeps its device id', () => {
    const stored = { ...fresh(), choice: 'helping', taps: 3, deviceId: 'kept' };
    const s = loadTapState(() => JSON.stringify(stored), () => 'new');
    expect(s.taps).toBe(3);
    expect(s.deviceId).toBe('kept');
  });

  it('returns a fresh state for unparseable JSON', () => {
    const s = loadTapState(() => '{nope', () => 'dev-2');
    expect(s.choice).toBe('unset');
    expect(s.deviceId).toBe('dev-2');
  });

  it('defaults fields missing from an older stored shape', () => {
    const s = loadTapState(
      () => JSON.stringify({ choice: 'helping', taps: 2, deviceId: 'old' }),
      () => 'new',
    );
    expect(s.taps).toBe(2);
    expect(s.deviceId).toBe('old');
    expect(s.lastTap).toBeNull();
    expect(s.tappedPassKeys).toEqual([]);
    expect(s.asksShown).toBe(0);
    expect(s.declinedAtMs).toBeNull();
  });

  it('reads from the storage key', () => {
    let asked = '';
    loadTapState((k) => ((asked = k), null), () => 'x');
    expect(asked).toBe(TAP_STORAGE_KEY);
  });
});

describe('askKind', () => {
  it('is first for a fresh state', () => {
    expect(askKind(fresh(), 0)).toBe('first');
  });

  it('is null straight after a decline', () => {
    const s = chooseHelp(fresh(), 'declined', 1000);
    expect(askKind(s, 1000)).toBeNull();
  });

  it('is again seven days after the first decline', () => {
    const s = chooseHelp(fresh(), 'declined', 1000);
    expect(askKind(s, 1000 + 7 * DAY - 1)).toBeNull();
    expect(askKind(s, 1000 + 7 * DAY)).toBe('again');
  });

  it('is null after a second decline', () => {
    const s = chooseHelp(chooseHelp(fresh(), 'declined', 0), 'declined', 7 * DAY);
    expect(askKind(s, 30 * DAY)).toBeNull();
  });

  it('is invite once there are taps', () => {
    const s = recordTap(fresh(), 'a', 1, 2);
    expect(askKind(s, 0)).toBe('invite');
  });

  it('is null for helping with zero taps', () => {
    expect(askKind(chooseHelp(fresh(), 'helping', 0), 0)).toBeNull();
  });
});

describe('chooseHelp', () => {
  it('increments asksShown and sets declinedAtMs only for declined', () => {
    const d = chooseHelp(fresh(), 'declined', 500);
    expect(d.choice).toBe('declined');
    expect(d.asksShown).toBe(1);
    expect(d.declinedAtMs).toBe(500);
    const h = chooseHelp(fresh(), 'helping', 500);
    expect(h.choice).toBe('helping');
    expect(h.asksShown).toBe(1);
    expect(h.declinedAtMs).toBeNull();
  });
});

describe('buttonsEnabled and resetChoice', () => {
  it('is false only for declined', () => {
    expect(buttonsEnabled(fresh())).toBe(true);
    expect(buttonsEnabled(chooseHelp(fresh(), 'helping', 0))).toBe(true);
    expect(buttonsEnabled(chooseHelp(fresh(), 'declined', 0))).toBe(false);
  });

  it('resetChoice clears the choice and asks', () => {
    const s = resetChoice(chooseHelp(fresh(), 'declined', 0));
    expect(s.choice).toBe('unset');
    expect(s.asksShown).toBe(0);
    expect(s.declinedAtMs).toBeNull();
  });
});

describe('recordTap', () => {
  it('adds a tap, sets helping and stores lastTap with tapsBefore', () => {
    const s1 = recordTap(fresh(), 'a', 100, 90);
    expect(s1.taps).toBe(1);
    expect(s1.choice).toBe('helping');
    expect(s1.lastTap).toEqual({ passKey: 'a', tapMs: 100, predictedMs: 90, tapsBefore: 0 });
    const s2 = recordTap(s1, 'b', 200, 210);
    expect(s2.taps).toBe(2);
    expect(s2.lastTap?.tapsBefore).toBe(1);
  });

  it('is a no-op for a key already recorded', () => {
    const s1 = recordTap(fresh(), 'a', 100, 90);
    expect(recordTap(s1, 'a', 300, 290)).toEqual(s1);
  });

  it('keeps at most the latest 20 pass keys', () => {
    let s = fresh();
    for (let i = 0; i < 25; i++) s = recordTap(s, `k${i}`, i, i);
    expect(s.taps).toBe(25);
    expect(s.tappedPassKeys).toHaveLength(20);
    expect(hasTapped(s, 'k24')).toBe(true);
    expect(hasTapped(s, 'k5')).toBe(true);
    expect(hasTapped(s, 'k4')).toBe(false);
  });

  it('does not mutate its input', () => {
    const s = fresh();
    recordTap(s, 'a', 1, 1);
    expect(s.taps).toBe(0);
    expect(s.tappedPassKeys).toEqual([]);
  });
});

describe('saveTapState', () => {
  it('round-trips through load', () => {
    const store = new Map<string, string>();
    const s = recordTap(fresh(), 'a', 100, 90);
    saveTapState((k, v) => store.set(k, v), s);
    expect(store.has(TAP_STORAGE_KEY)).toBe(true);
    expect(loadTapState((k) => store.get(k) ?? null, () => 'other')).toEqual(s);
  });
});
