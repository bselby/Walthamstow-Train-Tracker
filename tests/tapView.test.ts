import { describe, expect, it } from 'vitest';
import type { BridgeEvent } from '../src/bridge';
import type { TapPass } from '../src/tap';
import type { TapState } from '../src/tapStore';
import { msUntilButton, newDeviceId, tapAsk, tapDirectionView, tflExpectedArrivalMs } from '../src/tapView';
import { getViewpointById } from '../src/viewpoints';

const NOW = 1_800_000_000_000;

const pass: TapPass = {
  viewpointId: 'east-ave',
  direction: 'north',
  vehicleId: 'v1',
  berthTrainId: null,
  destination: 'Chingford',
  shownAtMs: NOW - 5_000,
  predictedAtShowMs: NOW + 25_000,
  latestPredictedMs: NOW + 20_000,
};
const KEY = `east-ave|north|${NOW + 25_000}`;

function state(overrides: Partial<TapState> = {}): TapState {
  return {
    choice: 'unset',
    declinedAtMs: null,
    asksShown: 0,
    taps: 0,
    tappedPassKeys: [],
    spotsTimed: [],
    deviceId: 'abcdefgh-1234',
    lastTap: null,
    ...overrides,
  };
}

const tapped = state({
  choice: 'helping',
  taps: 3,
  tappedPassKeys: [KEY],
  lastTap: { passKey: KEY, tapMs: NOW - 1_000, predictedMs: NOW + 2_000, tapsBefore: 2 },
});

type ViewInput = Parameters<typeof tapDirectionView>[0];
function view(over: Partial<ViewInput> = {}) {
  return tapDirectionView({
    pass: null,
    tapState: state(),
    thanksUntilMs: undefined,
    thanksPassKey: undefined,
    nowMs: NOW,
    canTune: true,
    msUntilButton: null,
    offline: false,
    ...over,
  });
}
const NONE = { state: 'none', passKey: null, destination: null, entry: null, msUntilButton: null, offline: false };

describe('tapDirectionView', () => {
  it('is none where timing is off: a spot with nothing to tune, or someone who said no', () => {
    expect(view({ canTune: false })).toEqual(NONE);
    expect(view({ tapState: state({ choice: 'declined' }) })).toEqual(NONE);
  });

  it('reserves the slot, empty, whenever timing is on and nothing is due', () => {
    // An undecided visitor before the button.
    expect(view()).toEqual({ ...NONE, state: 'reserved' });
    // Someone helping, with a freight hero (no button is coming).
    expect(view({ tapState: state({ choice: 'helping' }), msUntilButton: null })).toEqual({ ...NONE, state: 'reserved' });
    // After a tapped pass, once the minute's thank-you has ended.
    expect(view({ pass, tapState: tapped, thanksUntilMs: NOW - 1, thanksPassKey: KEY })).toEqual({ ...NONE, state: 'reserved' });
  });

  it('is a button for an untapped pass', () => {
    expect(view({ pass })).toEqual({ ...NONE, state: 'button', passKey: KEY, destination: 'Chingford' });
  });

  it('is a button for someone who has not answered the invitation yet', () => {
    expect(view({ pass, tapState: state({ choice: 'unset' }) }).state).toBe('button');
  });

  it('is none for a pass when the user said not now', () => {
    const declined = state({ choice: 'declined', declinedAtMs: NOW - 1, asksShown: 1 });
    expect(view({ pass, tapState: declined }).state).toBe('none');
  });

  it('is none at a spot that cannot be tuned, even with a pass and helping', () => {
    const helping = state({ choice: 'helping' });
    expect(view({ pass, tapState: helping, canTune: false }).state).toBe('none');
    expect(view({ tapState: helping, canTune: false, msUntilButton: 300_000 }).state).toBe('none');
  });

  it('placeholder for someone helping while the button is not yet due', () => {
    expect(view({ tapState: state({ choice: 'helping' }), msUntilButton: 300_000 }))
      .toEqual({ ...NONE, state: 'placeholder', msUntilButton: 300_000 });
  });

  it('no placeholder for someone who has not said yes, or said no', () => {
    expect(view({ tapState: state({ choice: 'unset' }), msUntilButton: 300_000 }).state).toBe('reserved');
    expect(view({ tapState: state({ choice: 'declined' }), msUntilButton: 300_000 }).state).toBe('none');
  });

  it('no placeholder without a time to count down to', () => {
    expect(view({ tapState: state({ choice: 'helping' }), msUntilButton: null }).state).toBe('reserved');
    expect(view({ tapState: state({ choice: 'helping' }), msUntilButton: 0 }).state).toBe('reserved');
  });

  it('the button wins over the placeholder once a pass is open', () => {
    expect(view({ pass, tapState: state({ choice: 'helping' }), msUntilButton: 300_000 }).state).toBe('button');
  });

  it('shows thanks with the last tap as the entry while the minute runs', () => {
    expect(view({ pass, tapState: tapped, thanksUntilMs: NOW + 59_000, thanksPassKey: KEY })).toEqual({
      ...NONE,
      state: 'thanks',
      passKey: KEY,
      destination: 'Chingford',
      entry: { tapMs: NOW - 1_000, predictedMs: NOW + 2_000, tapsBefore: 2 },
    });
  });

  it('thanks carries whether the send failed', () => {
    const v = view({ pass, tapState: tapped, thanksUntilMs: NOW + 59_000, thanksPassKey: KEY, offline: true });
    expect(v.state).toBe('thanks');
    expect(v.offline).toBe(true);
  });

  it('keeps the thanks after the pass itself has expired', () => {
    const v = view({ tapState: tapped, thanksUntilMs: NOW + 10_000, thanksPassKey: KEY });
    expect(v.state).toBe('thanks');
    expect(v.passKey).toBe(KEY);
  });

  it('is reserved for a tapped pass once the minute is up', () => {
    expect(view({ pass, tapState: tapped, thanksUntilMs: NOW, thanksPassKey: KEY }).state).toBe('reserved');
  });

  it('drops the thanks when the last tap was for another pass', () => {
    const other = { ...tapped, lastTap: { ...tapped.lastTap!, passKey: 'east-ave|south|1' } };
    expect(view({ pass, tapState: other, thanksUntilMs: NOW + 30_000, thanksPassKey: KEY }).state).toBe('reserved');
  });

  it('falls back to a button for a new pass once the minute is up', () => {
    const next: TapPass = { ...pass, predictedAtShowMs: NOW + 400_000 };
    const v = view({ pass: next, tapState: tapped, thanksUntilMs: NOW - 1, thanksPassKey: KEY });
    expect(v.state).toBe('button');
    expect(v.passKey).toBe(`east-ave|north|${NOW + 400_000}`);
  });
});

describe('tflExpectedArrivalMs', () => {
  function ev(vehicleId: string | undefined, expectedArrival: string): BridgeEvent {
    return {
      direction: 'north',
      bridgeTimeSeconds: 10,
      arrival: {
        id: 'a',
        stationName: 'S',
        lineId: 'weaver',
        destinationName: 'Chingford',
        timeToStation: 10,
        expectedArrival,
        modeName: 'overground',
        platformName: '1',
        vehicleId,
      },
    };
  }

  it('parses the expected arrival of the matching vehicle', () => {
    const events = [ev('v0', '2026-11-17T09:00:00Z'), ev('v1', '2026-11-17T10:00:00Z')];
    expect(tflExpectedArrivalMs(events, 'v1')).toBe(Date.parse('2026-11-17T10:00:00Z'));
  });

  it('is null without a vehicle id, a match or a parseable time', () => {
    const events = [ev('v1', 'not a date'), ev(undefined, '2026-11-17T10:00:00Z')];
    expect(tflExpectedArrivalMs(events, null)).toBeNull();
    expect(tflExpectedArrivalMs(events, 'v9')).toBeNull();
    expect(tflExpectedArrivalMs(events, 'v1')).toBeNull();
    expect(tflExpectedArrivalMs(undefined, 'v1')).toBeNull();
  });
});

describe('newDeviceId', () => {
  const RE = /^[a-z0-9-]{8,64}$/;

  it('uses randomUUID in lower case when available', () => {
    expect(newDeviceId(() => 'ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe('abcdef12-3456-7890-abcd-ef1234567890');
  });

  it('falls back to a random id that the server accepts', () => {
    const a = newDeviceId(undefined);
    const b = newDeviceId(undefined);
    expect(a).toMatch(RE);
    expect(b).toMatch(RE);
    expect(a).not.toBe(b);
  });
});

describe('tapAsk', () => {
  const none = NONE as ReturnType<typeof view>;

  it('hides the ask while either direction shows its thank-you, then invites again', () => {
    const during = view({ pass, tapState: tapped, thanksUntilMs: NOW + 30_000, thanksPassKey: KEY });
    expect(during.state).toBe('thanks');
    expect(tapAsk({ tapState: tapped, nowMs: NOW, offerable: true, views: [none, during] })).toBeNull();
    expect(tapAsk({ tapState: tapped, nowMs: NOW, offerable: true, views: [during, none] })).toBeNull();

    const later = NOW + 30_000;
    const after = view({ pass, tapState: tapped, thanksUntilMs: NOW + 30_000, thanksPassKey: KEY, nowMs: later });
    expect(after.state).not.toBe('thanks');
    expect(tapAsk({ tapState: tapped, nowMs: later, offerable: true, views: [none, after] })).toBe('invite');
  });

  it('is null where no tap can be offered', () => {
    expect(tapAsk({ tapState: state(), nowMs: NOW, offerable: false, views: [none, none] })).toBeNull();
    expect(tapAsk({ tapState: state(), nowMs: NOW, offerable: true, views: [none, none] })).toBe('first');
  });
});

describe('msUntilButton', () => {
  const EA = getViewpointById('east-ave')!;
  const QR = getViewpointById('queens-road')!;
  const hero = (bridgeTimeSeconds: number, category?: 'freight'): BridgeEvent => ({
    direction: 'north',
    bridgeTimeSeconds,
    arrival: {
      id: 'a', stationName: 'S', lineId: 'weaver', destinationName: 'Chingford',
      timeToStation: bridgeTimeSeconds, expectedArrival: '2026-11-17T10:00:00Z',
      modeName: 'overground', platformName: '1', category,
    },
  });

  it('is the time until the button opens, 30 seconds before the train', () => {
    expect(msUntilButton(EA, 'north', hero(330))).toBe(300_000);
  });

  it('is null with no train, a freight train, or at a spot with nothing to tune', () => {
    expect(msUntilButton(EA, 'north', undefined)).toBeNull();
    expect(msUntilButton(EA, 'north', hero(330, 'freight'))).toBeNull();
    expect(msUntilButton(QR, 'north', hero(330))).toBeNull();
  });
});
