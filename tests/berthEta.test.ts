import { describe, it, expect } from 'vitest';
import { berthEtaFromStep, liveBerthEta, alreadyPassedPerBerth, BERTH_ETA_GRACE_MS } from '../src/berthEta';
import { getViewpointById } from '../src/viewpoints';

const STEPS = [
  { fromBerth: '1422', toBerth: '1420', secondsToViewpoint: 48 },
  { fromBerth: '1418', toBerth: '1414', secondsToViewpoint: 5 },
];

describe('berthEtaFromStep', () => {
  it('times the viewpoint from the moment of the matching berth step', () => {
    const eta = berthEtaFromStep({ fromBerth: '1418', toBerth: '1414', timestamp: 1_000_000 }, STEPS);
    expect(eta).toBe(1_005_000);
  });

  it('ignores the SMART station offset, which describes the platform event and not the viewpoint', () => {
    const proxyEvent = { fromBerth: '1422', toBerth: '1420', timestamp: 2_000_000, offsetSeconds: -25 };
    const eta = berthEtaFromStep(proxyEvent, STEPS);
    expect(eta).toBe(2_048_000);
  });

  it('returns null for a step the viewpoint does not watch', () => {
    expect(berthEtaFromStep({ fromBerth: '1429', toBerth: '1431', timestamp: 1 }, STEPS)).toBeNull();
  });

  it('returns null when the direction has no berth steps', () => {
    expect(berthEtaFromStep({ fromBerth: '1418', toBerth: '1414', timestamp: 1 }, undefined)).toBeNull();
  });
});

describe('liveBerthEta', () => {
  const eta = 10_000_000;

  it('is live while the train is still approaching', () => {
    expect(liveBerthEta(eta, eta - 30_000)).toBe(eta);
  });

  it('stays live for a short grace period after the train passes', () => {
    expect(liveBerthEta(eta, eta + BERTH_ETA_GRACE_MS - 1)).toBe(eta);
  });

  it('expires once the grace period is over, so the next train is not shown as just crossed', () => {
    expect(liveBerthEta(eta, eta + BERTH_ETA_GRACE_MS + 1)).toBeUndefined();
  });

  it('is undefined when no berth step has been seen', () => {
    expect(liveBerthEta(undefined, eta)).toBeUndefined();
  });
});

describe('East Avenue berth steps', () => {
  const eastAve = getViewpointById('east-ave')!;

  it('times northbound trains from the Walthamstow Central starter signal', () => {
    expect(eastAve.directions.north.berthSteps).toEqual([
      { fromBerth: '1415', toBerth: '1419', secondsToViewpoint: 22 },
    ]);
  });

  it('times southbound trains from Wood Street, then from the signal just before the bridge', () => {
    expect(eastAve.directions.south.berthSteps).toEqual([
      { fromBerth: '1422', toBerth: '1420', secondsToViewpoint: 48 },
      { fromBerth: '1418', toBerth: '1414', secondsToViewpoint: 5 },
    ]);
  });
});

describe('alreadyPassedPerBerth', () => {
  const eta = 10_000_000;
  const afterGrace = eta + BERTH_ETA_GRACE_MS + 1_000;

  it('drops a TfL prediction for the train the berth step already timed past the viewpoint', () => {
    // TfL runs late: it still expects the same train 60 s after it passed.
    expect(alreadyPassedPerBerth(eta + 60_000, eta, afterGrace)).toBe(true);
  });

  it('keeps the following train', () => {
    expect(alreadyPassedPerBerth(eta + 15 * 60_000, eta, afterGrace)).toBe(false);
  });

  it('does not drop anything while the berth ETA is still driving the countdown', () => {
    expect(alreadyPassedPerBerth(eta + 60_000, eta, eta - 5_000)).toBe(false);
  });

  it('forgets the berth ETA after a few minutes', () => {
    expect(alreadyPassedPerBerth(eta + 6 * 60_000 + 30_000, eta, eta + 6 * 60_000)).toBe(false);
  });

  it('drops nothing when no berth step has been seen', () => {
    expect(alreadyPassedPerBerth(eta + 60_000, undefined, afterGrace)).toBe(false);
  });
});
