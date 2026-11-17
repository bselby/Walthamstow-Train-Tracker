import { describe, it, expect } from 'vitest';
import { getViewpointById } from '../src/viewpoints';
import { matchBerth } from '../services/td-proxy/src/berths';

describe('Northcote Road berth steps', () => {
  const northcote = getViewpointById('northcote-rd')!;

  it('times trains towards Barking from the Blackhorse Road departure step', () => {
    expect(northcote.directions.north.berthSteps).toEqual([
      { fromBerth: 'ST21', toBerth: 'ST23', secondsToViewpoint: 36 },
    ]);
  });

  it('times trains towards Gospel Oak from the Queens Road departure step', () => {
    expect(northcote.directions.south.berthSteps).toEqual([
      { fromBerth: 'ST22', toBerth: 'ST20', secondsToViewpoint: 21 },
    ]);
  });
});

describe('signalling proxy berth watch list', () => {
  const step = (area_id: string, from: string, to: string) =>
    matchBerth({ time: '1794944899000', area_id, msg_type: 'CA', from, to, descr: '2J41' });

  it('emits the Suffragette line steps either side of Northcote Road', () => {
    expect(step('SO', 'ST21', 'ST23')).toMatchObject({ td: 'SO', fromBerth: 'ST21', toBerth: 'ST23', trainId: '2J41', timestamp: 1794944899000 });
    expect(step('SO', 'ST22', 'ST20')).toMatchObject({ td: 'SO', fromBerth: 'ST22', toBerth: 'ST20' });
  });

  it('still emits the Chingford branch steps East Avenue relies on', () => {
    expect(step('Q4', '1415', '1419')).not.toBeNull();
    expect(step('Q4', '1418', '1414')).not.toBeNull();
    expect(step('Q4', '1422', '1420')).not.toBeNull();
  });

  it('ignores the same berth numbers in another signalling area', () => {
    expect(step('XX', 'ST21', 'ST23')).toBeNull();
  });
});
