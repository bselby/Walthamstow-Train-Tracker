import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 1;
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  close(): void { this.readyState = FakeEventSource.CLOSED; }
  emit(data: unknown): void { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
}

describe('subscribeBerthEvents', () => {
  let subscribeBerthEvents: typeof import('../src/tdProxy').subscribeBerthEvents;

  beforeEach(async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.resetModules();
    ({ subscribeBerthEvents } = await import('../src/tdProxy'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens one connection and passes events to the subscriber', () => {
    const cb = vi.fn();
    subscribeBerthEvents(cb);
    expect(FakeEventSource.instances.length).toBe(1);
    FakeEventSource.instances[0].emit({ type: 'connected' });
    FakeEventSource.instances[0].emit({ trainId: '2T01', fromBerth: '1415', toBerth: '1419' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].trainId).toBe('2T01');
  });

  it('closes the connection when the last subscriber leaves', () => {
    const stopA = subscribeBerthEvents(vi.fn());
    const stopB = subscribeBerthEvents(vi.fn());
    expect(FakeEventSource.instances.length).toBe(1);
    stopA();
    expect(FakeEventSource.instances[0].readyState).not.toBe(FakeEventSource.CLOSED);
    stopB();
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
  });

  it('connects afresh for a later subscriber', () => {
    subscribeBerthEvents(vi.fn())();
    const cb = vi.fn();
    subscribeBerthEvents(cb);
    expect(FakeEventSource.instances.length).toBe(2);
    FakeEventSource.instances[1].emit({ trainId: '2T02' });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
