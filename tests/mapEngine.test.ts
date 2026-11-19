import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchFirstLoad, STYLE_TIMEOUT_MS, type LoadEvents } from '../src/mapEngine';

type Handler = (e?: unknown) => void;

function fakeMap() {
  const handlers: Record<string, Handler[]> = {};
  const add = (type: string, fn: Handler) => {
    (handlers[type] ??= []).push(fn);
  };
  const map: LoadEvents & { fire: (type: string, e?: unknown) => void } = {
    on: add as LoadEvents['on'],
    once: ((type: string, fn: Handler) => {
      const wrapped: Handler = (e) => {
        handlers[type] = handlers[type].filter((h) => h !== wrapped);
        fn(e);
      };
      add(type, wrapped);
    }) as LoadEvents['once'],
    fire(type, e) {
      [...(handlers[type] ?? [])].forEach((h) => h(e));
    },
  };
  return map;
}

describe('watchFirstLoad', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fails on a style-level error before the map has loaded', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    watchFirstLoad(map, onFail);
    map.fire('error', { error: new Error('style fetch failed') });
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('ignores a single tile error before load', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    watchFirstLoad(map, onFail);
    map.fire('style.load');
    map.fire('error', { error: new Error('tile 404'), sourceId: 'openmaptiles', tile: {} });
    map.fire('error', { error: new Error('tile 500'), tile: {} });
    map.fire('error', { error: new Error('source failed'), sourceId: 'openmaptiles' });
    expect(onFail).not.toHaveBeenCalled();
  });

  it('ignores every error once the map has loaded', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    watchFirstLoad(map, onFail);
    map.fire('style.load');
    map.fire('load');
    map.fire('error', { error: new Error('anything') });
    expect(onFail).not.toHaveBeenCalled();
  });

  it('fails if the style has not arrived in time', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    watchFirstLoad(map, onFail);
    vi.advanceTimersByTime(STYLE_TIMEOUT_MS - 1);
    expect(onFail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('does not time out once the style has arrived', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    watchFirstLoad(map, onFail);
    map.fire('style.load');
    vi.advanceTimersByTime(STYLE_TIMEOUT_MS * 2);
    expect(onFail).not.toHaveBeenCalled();
  });

  it('fails only once', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    watchFirstLoad(map, onFail);
    map.fire('error', { error: new Error('one') });
    map.fire('error', { error: new Error('two') });
    vi.advanceTimersByTime(STYLE_TIMEOUT_MS);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('stops watching when cancelled', () => {
    const map = fakeMap();
    const onFail = vi.fn();
    const cancel = watchFirstLoad(map, onFail);
    cancel();
    map.fire('error', { error: new Error('late') });
    vi.advanceTimersByTime(STYLE_TIMEOUT_MS);
    expect(onFail).not.toHaveBeenCalled();
  });
});
