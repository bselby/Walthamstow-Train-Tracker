import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArrivals } from '../src/tfl';

describe('fetchArrivals', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed arrivals on 200', async () => {
    const payload = [
      {
        id: '1',
        stationName: 'Walthamstow Central',
        lineId: 'weaver',
        destinationName: 'Chingford',
        timeToStation: 120,
        expectedArrival: '2026-04-17T10:00:00Z',
        modeName: 'overground',
        platformName: 'Platform 1'
      }
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await fetchArrivals('STOPID');

    expect(result).toHaveLength(1);
    expect(result[0].destinationName).toBe('Chingford');
    expect(result[0].timeToStation).toBe(120);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.tfl.gov.uk/StopPoint/STOPID/Arrivals'
    );
  });

  it('throws when response is not ok', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503
    });

    await expect(fetchArrivals('STOPID')).rejects.toThrow(/503/);
  });

  it('filters out arrivals without a lineId of weaver', async () => {
    const payload = [
      { id: '1', lineId: 'weaver', destinationName: 'Chingford', timeToStation: 60, expectedArrival: 'x', modeName: 'overground', platformName: 'P1', stationName: 'WC' },
      { id: '2', lineId: 'victoria', destinationName: 'Brixton', timeToStation: 30, expectedArrival: 'y', modeName: 'tube', platformName: 'P2', stationName: 'WC' }
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await fetchArrivals('STOPID');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
