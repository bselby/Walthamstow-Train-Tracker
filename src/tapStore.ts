// What the phone remembers about the "train's here" tap: the user's choice on
// the help card, their tap count, their latest tap and a random device id.
// Pure functions; storage access is passed in.

export const TAP_STORAGE_KEY = 'wtt_tap_state';

const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PASS_KEYS = 20;

export interface TapState {
  choice: 'unset' | 'helping' | 'declined';
  declinedAtMs: number | null;
  asksShown: number;
  taps: number;
  tappedPassKeys: string[];
  /** Spot ids the child's parent has timed here, oldest first, no duplicates. */
  spotsTimed: string[];
  deviceId: string;
  /** The most recent tap, so the register entry can be shown for a minute. */
  lastTap: { passKey: string; tapMs: number; predictedMs: number; tapsBefore: number } | null;
  /** Visits on which the full help box was shown. Optional: older saved
   *  states have none, read as 0. */
  boxVisits?: number;
}

/** Visits that get the full help box before it becomes the short line. */
const FULL_BOX_VISITS = 2;

/** What sits below the panels. `first` and `again` are the ask with its two
 *  choices; the rest are the permanent ticket strip: `ready` (said yes, nothing
 *  booked yet), `invite` (has booked trains) and `off` (buttons switched off). */
export type AskKind = 'first' | 'again' | 'ready' | 'invite' | 'off' | null;

function freshState(newId: () => string): TapState {
  return {
    choice: 'unset',
    declinedAtMs: null,
    asksShown: 0,
    taps: 0,
    tappedPassKeys: [],
    spotsTimed: [],
    deviceId: newId(),
    lastTap: null,
    boxVisits: 0,
  };
}

const spotOf = (passKey: string): string => passKey.split('|')[0];
const unique = (xs: string[]): string[] => [...new Set(xs)];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseLastTap(v: unknown): TapState['lastTap'] {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  if (typeof t.passKey !== 'string' || !isNum(t.tapMs) || !isNum(t.predictedMs)) return null;
  return {
    passKey: t.passKey,
    tapMs: t.tapMs,
    predictedMs: t.predictedMs,
    tapsBefore: isNum(t.tapsBefore) ? t.tapsBefore : 0,
  };
}

export function loadTapState(read: (key: string) => string | null, newId: () => string): TapState {
  const fresh = freshState(newId);
  let raw: string | null;
  try {
    raw = read(TAP_STORAGE_KEY);
  } catch {
    return fresh;
  }
  if (raw === null) return fresh;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fresh;
  const p = parsed as Record<string, unknown>;
  const tappedPassKeys = Array.isArray(p.tappedPassKeys)
    ? p.tappedPassKeys.filter((k): k is string => typeof k === 'string')
    : [];
  return {
    choice: p.choice === 'helping' || p.choice === 'declined' ? p.choice : 'unset',
    declinedAtMs: isNum(p.declinedAtMs) ? p.declinedAtMs : null,
    asksShown: isNum(p.asksShown) ? p.asksShown : 0,
    taps: isNum(p.taps) ? p.taps : 0,
    tappedPassKeys,
    spotsTimed: Array.isArray(p.spotsTimed)
      ? unique(p.spotsTimed.filter((k): k is string => typeof k === 'string' && k !== ''))
      : unique(tappedPassKeys.map(spotOf).filter(Boolean)),
    deviceId: typeof p.deviceId === 'string' && p.deviceId ? p.deviceId : fresh.deviceId,
    lastTap: parseLastTap(p.lastTap),
    boxVisits: isNum(p.boxVisits) ? p.boxVisits : 0,
  };
}

/** The full help box is for newcomers: the first two visits, and only until
 *  a train has been timed. After that each card has the short line. */
export function showsFullBox(state: TapState): boolean {
  return state.taps === 0 && (state.boxVisits ?? 0) < FULL_BOX_VISITS;
}

/** Count one more visit with the full box. */
export function noteFullBoxShown(state: TapState): TapState {
  return { ...state, boxVisits: (state.boxVisits ?? 0) + 1 };
}

export function saveTapState(write: (key: string, value: string) => void, state: TapState): void {
  write(TAP_STORAGE_KEY, JSON.stringify(state));
}

export function askKind(state: TapState, nowMs: number): AskKind {
  if (state.choice === 'declined') {
    // One more ask a week after a first "Not now", then never again. Someone
    // who has booked trains and then switched the buttons off is not re-asked.
    const due =
      state.taps === 0
      && state.asksShown === 1
      && state.declinedAtMs !== null
      && nowMs - state.declinedAtMs >= ASK_AGAIN_AFTER_MS;
    return due ? 'again' : 'off';
  }
  if (state.taps > 0) return 'invite';
  return state.choice === 'unset' ? 'first' : 'ready';
}

export function buttonsEnabled(state: TapState): boolean {
  return state.choice !== 'declined';
}

export function chooseHelp(state: TapState, choice: 'helping' | 'declined', nowMs: number): TapState {
  return {
    ...state,
    choice,
    asksShown: state.asksShown + 1,
    declinedAtMs: choice === 'declined' ? nowMs : state.declinedAtMs,
  };
}

export function resetChoice(state: TapState): TapState {
  return { ...state, choice: 'unset', declinedAtMs: null, asksShown: 0 };
}

export function recordTap(state: TapState, key: string, tapMs: number, predictedMs: number): TapState {
  if (hasTapped(state, key)) return state;
  return {
    ...state,
    choice: 'helping',
    taps: state.taps + 1,
    tappedPassKeys: [...state.tappedPassKeys, key].slice(-MAX_PASS_KEYS),
    spotsTimed: state.spotsTimed.includes(spotOf(key))
      ? state.spotsTimed
      : [...state.spotsTimed, spotOf(key)],
    lastTap: { passKey: key, tapMs, predictedMs, tapsBefore: state.taps },
  };
}

export function hasTapped(state: TapState, key: string): boolean {
  return state.tappedPassKeys.includes(key);
}
