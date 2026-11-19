/// <reference types="vite/client" />
// The real map engine: MapLibre with OpenFreeMap tiles. MapLibre and its CSS
// are loaded with import() so they land in their own chunk, fetched only
// when the map page opens. Only watchFirstLoad has a unit test: MapLibre
// needs WebGL, which jsdom doesn't have, so mapPage's tests use a fake engine.
import { PIN_PATH } from './home';
import type { CreateEngine, MapEngine } from './mapPage';

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** Where the map sits before the first fit lands: Walthamstow. */
const START: [number, number] = [-0.02, 51.585];

/** Keeps a zero-size box (the parent standing at a spot) at street level. */
const MAX_FIT_ZOOM = 16;

function pinSvg(): string {
  return `<svg class="map-pin-shape" width="22" height="28" viewBox="0 0 22 28" aria-hidden="true"><path d="${PIN_PATH}" fill="currentColor" stroke="var(--pin-outline)" stroke-width="2"/><circle cx="11" cy="10" r="3.5" fill="var(--card)"/></svg>`;
}

function fitPadding(container: HTMLElement): number {
  const short = Math.min(container.clientWidth, container.clientHeight);
  return Math.max(16, Math.min(56, Math.floor(short / 6)));
}

/** How long the style may take to arrive before the map counts as failed. */
export const STYLE_TIMEOUT_MS = 15_000;

/** The part of a MapLibre map that watchFirstLoad listens to. */
export interface LoadEvents {
  once(type: 'load' | 'style.load', fn: () => void): unknown;
  on(type: 'error', fn: (e: { sourceId?: unknown; tile?: unknown }) => void): unknown;
}

/**
 * Calls onFail (once) if the map can't load: a style-level error before the
 * first load (offline, or OpenFreeMap down), or no style within the timeout.
 * Errors for a single tile or source carry sourceId or tile and are ignored,
 * as is every error after the first load. Returns a function that stops it.
 */
export function watchFirstLoad(map: LoadEvents, onFail: () => void, timeoutMs = STYLE_TIMEOUT_MS): () => void {
  let done = false;
  const stop = () => {
    done = true;
    clearTimeout(timer);
  };
  const fail = () => {
    if (done) return;
    stop();
    onFail();
  };
  const timer = setTimeout(fail, timeoutMs);
  map.once('style.load', () => clearTimeout(timer));
  map.once('load', stop);
  map.on('error', (e) => {
    if (e.sourceId || e.tile) return;
    fail();
  });
  return stop;
}

export const createMapLibreEngine: CreateEngine = async (container, scheme, onFail) => {
  // MapLibre looks for its worker beside its own module, where Vite doesn't
  // put it. Importing the worker with ?url makes Vite emit it as a file (it
  // has no imports of its own), and setWorkerUrl points MapLibre at it.
  const [maplibregl, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);
  maplibregl.setWorkerUrl(workerUrl);

  const map = new maplibregl.Map({
    container,
    style: STYLES[scheme],
    center: START,
    zoom: 13,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true }));

  // MapLibre tracks the container's size itself (trackResize), so no resize code here.
  const stopWatching = watchFirstLoad(map, onFail);

  let pinMarkers: InstanceType<typeof maplibregl.Marker>[] = [];
  let youMarker: InstanceType<typeof maplibregl.Marker> | null = null;

  const engine: MapEngine = {
    setPins(pins, onPick) {
      pinMarkers.forEach((m) => m.remove());
      pinMarkers = pins.map((pin) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `map-pin ${pin.lineClass}`;
        button.setAttribute('aria-label', `${pin.name}, ${pin.lineName} line`);
        button.innerHTML = pinSvg();
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          onPick(pin.id);
        });
        return new maplibregl.Marker({ element: button, anchor: 'bottom' })
          .setLngLat([pin.coords.lng, pin.coords.lat])
          .addTo(map);
      });
    },

    setYou(position) {
      if (!position) {
        youMarker?.remove();
        youMarker = null;
        return;
      }
      if (!youMarker) {
        const dot = document.createElement('div');
        dot.className = 'map-you';
        dot.setAttribute('aria-hidden', 'true');
        youMarker = new maplibregl.Marker({ element: dot, anchor: 'center' });
      }
      youMarker.setLngLat([position.lng, position.lat]).addTo(map);
    },

    fit(bounds) {
      map.fitBounds(bounds, { padding: fitPadding(container), maxZoom: MAX_FIT_ZOOM, animate: false });
    },

    setCamera(camera) {
      map.jumpTo({ center: [camera.lng, camera.lat], zoom: camera.zoom });
    },

    onMove(fn) {
      map.on('moveend', () => {
        const c = map.getCenter();
        fn({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
      });
    },

    setScheme(next) {
      // Markers are DOM elements over the canvas, so a new style keeps them.
      map.setStyle(STYLES[next]);
    },

    destroy() {
      stopWatching();
      map.remove();
    },
  };
  return engine;
};
