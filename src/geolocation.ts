import type { LatLng } from './walkingTime';

export type GeolocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

export interface GeolocationState {
  status: GeolocationStatus;
  position: LatLng | null;
}

type Listener = (state: GeolocationState) => void;

let watchId: number | null = null;
let currentState: GeolocationState = { status: 'idle', position: null };
const listeners = new Set<Listener>();

function emit(next: GeolocationState) {
  currentState = next;
  for (const fn of listeners) fn(currentState);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(currentState);
  return () => {
    listeners.delete(fn);
  };
}

export function getState(): GeolocationState {
  return currentState;
}

/** Start watching the user's position. Safe to call multiple times — noop if already watching. */
export function start(): void {
  if (watchId !== null) return;
  if (!('geolocation' in navigator)) {
    emit({ status: 'unavailable', position: null });
    return;
  }
  emit({ status: 'locating', position: currentState.position });

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      emit({
        status: 'granted',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
    },
    (err) => {
      const status: GeolocationStatus =
        err.code === err.PERMISSION_DENIED ? 'denied' : 'locating';
      emit({ status, position: currentState.position });
    },
    // enableHighAccuracy: true forces GPS-grade updates so the label actually
    // moves as the user walks. Without this the browser returns a coarse WiFi /
    // cell-tower fix that doesn't update over short walking distances.
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
  );
}

/** Stop watching. Safe to call multiple times. */
export function stop(): void {
  if (watchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}
