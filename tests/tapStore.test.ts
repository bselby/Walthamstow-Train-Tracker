import { describe, expect, it } from 'vitest';
import {
  TAP_STORAGE_KEY,
  askKind,
  buttonsEnabled,
  chooseHelp,
  hasTapped,
  loadTapState,
  noteFullBoxShown,
  showsFullBox,
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

  it('is off straight after a decline, so the strip still offers a way in', () => {
    const s = chooseHelp(fresh(), 'declined', 1000);
    expect(askKind(s, 1000)).toBe('off');
  });

  it('is again seven days after the first decline', () => {
    const s = chooseHelp(fresh(), 'declined', 1000);
    expect(askKind(s, 1000 + 7 * DAY - 1)).toBe('off');
    expect(askKind(s, 1000 + 7 * DAY)).toBe('again');
  });

  it('is off after a second decline: no more asking', () => {
    const s = chooseHelp(chooseHelp(fresh(), 'declined', 0), 'declined', 7 * DAY);
    expect(askKind(s, 30 * DAY)).toBe('off');
  });

  it('is off, not a fresh ask, for a helper who switched the buttons off', () => {
    const s = chooseHelp(recordTap(fresh(), 'a', 1, 2), 'declined', 1000);
    expect(askKind(s, 1000)).toBe('off');
    expect(askKind(s, 1000 + 30 * DAY)).toBe('off');
    expect(s.taps).toBe(1);
  });

  it('is invite once there are taps', () => {
    const s = recordTap(fresh(), 'a', 1, 2);
    expect(askKind(s, 0)).toBe('invite');
  });

  it('confirms the choice for a helper who has not booked a train yet', () => {
    expect(askKind(chooseHelp(fresh(), 'helping', 0), 0)).toBe('ready');
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

describe('spotsTimed', () => {
  it('starts empty on a fresh state', () => {
    expect(fresh().spotsTimed).toEqual([]);
  });

  it('is filled from tappedPassKeys when old saved JSON lacks it', () => {
    const old = {
      ...fresh(),
      choice: 'helping',
      taps: 3,
      tappedPassKeys: ['east-ave|north|1', 'northcote-rd|south|2', 'east-ave|south|3'],
    } as Record<string, unknown>;
    delete old.spotsTimed;
    const s = loadTapState(() => JSON.stringify(old), () => 'new');
    expect(s.spotsTimed).toEqual(['east-ave', 'northcote-rd']);
  });

  it('keeps a stored list, dropping non-strings and duplicates', () => {
    const stored = { ...fresh(), spotsTimed: ['queens-road', 5, 'queens-road', 'east-ave'] };
    const s = loadTapState(() => JSON.stringify(stored), () => 'new');
    expect(s.spotsTimed).toEqual(['queens-road', 'east-ave']);
  });

  it('falls back to the pass keys when the stored value is malformed', () => {
    const stored = { ...fresh(), spotsTimed: 'nope', tappedPassKeys: ['queens-road|north|9'] };
    const s = loadTapState(() => JSON.stringify(stored), () => 'new');
    expect(s.spotsTimed).toEqual(['queens-road']);
  });

  it('keeps a declined choice and a high tap count', () => {
    const stored = { ...fresh(), choice: 'declined', taps: 61 };
    const s = loadTapState(() => JSON.stringify(stored), () => 'new');
    expect(s.taps).toBe(61);
    expect(s.choice).toBe('declined');
  });

  it('recordTap appends a new spot and leaves a known one alone', () => {
    let s = recordTap(fresh(), 'east-ave|north|1', 1, 2);
    expect(s.spotsTimed).toEqual(['east-ave']);
    s = recordTap(s, 'east-ave|south|2', 3, 4);
    expect(s.spotsTimed).toEqual(['east-ave']);
    s = recordTap(s, 'queens-road|north|3', 5, 6);
    expect(s.spotsTimed).toEqual(['east-ave', 'queens-road']);
  });

  it('is not capped with the pass keys', () => {
    let s = fresh();
    for (let i = 0; i < 30; i++) s = recordTap(s, `spot-${i}|north|${i}`, i, i);
    expect(s.spotsTimed).toHaveLength(30);
    expect(s.tappedPassKeys).toHaveLength(20);
  });
});

describe('the full help box for newcomers', () => {
  it('reads an older stored state as no box visits yet', () => {
    const s = loadTapState(() => JSON.stringify({ choice: 'unset', deviceId: 'old' }), () => 'new');
    expect(s.boxVisits).toBe(0);
  });

  it('keeps a stored count of box visits', () => {
    const s = loadTapState(() => JSON.stringify({ deviceId: 'old', boxVisits: 1 }), () => 'new');
    expect(s.boxVisits).toBe(1);
  });

  it('shows the full box on the first two visits, then not', () => {
    const first = fresh();
    expect(showsFullBox(first)).toBe(true);
    const second = noteFullBoxShown(first);
    expect(second.boxVisits).toBe(1);
    expect(showsFullBox(second)).toBe(true);
    expect(showsFullBox(noteFullBoxShown(second))).toBe(false);
  });

  it('never shows the full box once a train has been timed', () => {
    expect(showsFullBox({ ...fresh(), taps: 1 })).toBe(false);
  });
});
