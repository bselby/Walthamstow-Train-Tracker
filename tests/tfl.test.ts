import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArrivals, fetchStopArrivals } from '../src/tfl';

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

    const result = await fetchArrivals('STOPID', 'weaver');

    expect(result).toHaveLength(1);
    expect(result[0].destinationName).toBe('Chingford');
    expect(result[0].timeToStation).toBe(120);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.tfl.gov.uk/StopPoint/STOPID/Arrivals',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('throws when response is not ok', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503
    });

    await expect(fetchArrivals('STOPID', 'weaver')).rejects.toThrow(/503/);
  });

  it('filters out arrivals that are not on the requested line', async () => {
    const payload = [
      { id: '1', lineId: 'weaver', destinationName: 'Chingford', timeToStation: 60, expectedArrival: 'x', modeName: 'overground', platformName: 'P1', stationName: 'WC' },
      { id: '2', lineId: 'victoria', destinationName: 'Brixton', timeToStation: 30, expectedArrival: 'y', modeName: 'tube', platformName: 'P2', stationName: 'WC' }
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await fetchArrivals('STOPID', 'weaver');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by a non-weaver line id (Suffragette viewpoint)', async () => {
    const payload = [
      { id: '1', lineId: 'weaver', destinationName: 'Chingford', timeToStation: 60, expectedArrival: 'x', modeName: 'overground', platformName: 'P1', stationName: 'WC' },
      { id: '2', lineId: 'suffragette', destinationName: 'Barking Riverside', timeToStation: 90, expectedArrival: 'y', modeName: 'overground', platformName: 'P2', stationName: 'WQR' }
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await fetchArrivals('STOPID', 'suffragette');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});

describe('fetchStopArrivals', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  const rows = [
    { id: '1', lineId: 'weaver', destinationName: 'Chingford', timeToStation: 60 },
    { id: '2', lineId: 'victoria', destinationName: 'Brixton', timeToStation: 90 },
  ];

  it('returns every line at the stop from one request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => rows });
    const result = await fetchStopArrivals('STOPID');
    expect(result.map((a) => a.lineId)).toEqual(['weaver', 'victoria']);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.tfl.gov.uk/StopPoint/STOPID/Arrivals',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('fetchArrivals still keeps only the asked-for line', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => rows });
    expect((await fetchArrivals('STOPID', 'weaver')).map((a) => a.id)).toEqual(['1']);
  });

  it('rejects on a TfL error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchStopArrivals('STOPID')).rejects.toThrow('TfL API error: 500');
  });
});

describe('fetchStopArrivals when TfL never answers', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('gives up after 10 s, so the app can say it cannot get the times', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    ) as unknown as typeof fetch;
    const result = fetchStopArrivals('STOPID').then(() => 'answered', () => 'gave up');
    await vi.advanceTimersByTimeAsync(9_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('gave up');
  });
});
