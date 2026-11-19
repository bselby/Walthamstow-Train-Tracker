// The map page: a header like the ticket page, the map itself, a card for the
// picked spot, and a hidden list of the spots for screen readers. The map
// engine is injected so tests can use a fake; the real one (mapEngine.ts)
// loads MapLibre on demand.
import type { Bounds, Camera, MapPin } from './mapModel';
import type { LatLng } from './walkingTime';

export interface MapEngine {
  setPins(pins: MapPin[], onPick: (id: string) => void): void;
  setYou(position: LatLng | null): void;
  fit(bounds: Bounds): void;
  setCamera(camera: Camera): void;
  /** byUser: the parent moved the map, rather than a fit or a resize. */
  onMove(fn: (camera: Camera, byUser: boolean) => void): void;
  setScheme(scheme: 'light' | 'dark'): void;
  destroy(): void;
}

export type CreateEngine = (
  container: HTMLElement,
  scheme: 'light' | 'dark',
  onFail: () => void,
) => Promise<MapEngine>;

export interface MapPageModel {
  pins: MapPin[];
  firstView: Bounds;
  camera: Camera | null;
  you: LatLng | null;
  locationOff: boolean;
}

export interface MapPageOptions {
  onBack: () => void;
  /** "See the list" on the failure message: the home list, wherever the map was opened from. */
  onSeeList: () => void;
  onOpen: (id: string) => void;
  onUseLocation: () => void;
  onMove: (c: Camera) => void;
  createEngine: CreateEngine;
}

const BACK_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3 L5 9 L11 15"/></svg>';
const CLOSE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4 L14 14 M14 4 L4 14"/></svg>';

interface PageState {
  root: HTMLElement;
  wrap: HTMLElement;
  options: MapPageOptions;
  pins: MapPin[];
  openId: string | null;
  you: LatLng | null;
  engine: MapEngine | null;
  failed: boolean;
  /** Set by leaveMapPage, so an engine that arrives late is destroyed at once. */
  left: boolean;
  cleanups: Array<() => void>;
  /** The map opened on a saved camera, or the parent has moved it since. */
  moved: boolean;
  /** The parent tapped Use my location and no fix has arrived yet. */
  awaitingFix: boolean;
  /** Watches the open card's height, to keep the map credit above it. */
  cardObserver: ResizeObserver | null;
}

let state: PageState | null = null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
}

/** A plain left click, not one asking for a new tab or window. */
function plainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

function closeCard(s: PageState): void {
  s.openId = null;
  s.cardObserver?.disconnect();
  s.cardObserver = null;
  s.wrap.classList.remove('card-open');
  s.wrap.style.removeProperty('--map-card-h');
  s.wrap.querySelector('.map-card')?.remove();
}

/** The card sits over the bottom of the map, so the map credit (bottom
    right) is lifted above it by the card's height. */
function liftCredit(s: PageState, card: HTMLElement): void {
  const set = () => s.wrap.style.setProperty('--map-card-h', `${card.offsetHeight}px`);
  s.wrap.classList.add('card-open');
  set();
  if (typeof ResizeObserver === 'function') {
    s.cardObserver = new ResizeObserver(set);
    s.cardObserver.observe(card);
  }
}

function openCard(s: PageState, id: string): void {
  const pin = s.pins.find((p) => p.id === id);
  if (!pin) return;
  closeCard(s);
  s.openId = id;

  const card = el('section', `map-card ${pin.lineClass}`);
  card.setAttribute('aria-label', pin.name);
  const close = el('button', 'map-card-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = CLOSE_SVG;
  close.addEventListener('click', () => closeCard(s));
  const text = el('div', 'map-card-text');
  text.append(el('h2', 'map-card-name', pin.name), el('span', 'map-card-line', `${pin.lineName} line`));
  if (pin.walk) text.append(el('span', 'map-card-walk', pin.walk));
  const open = el('button', 'map-card-open', 'Open');
  open.type = 'button';
  open.addEventListener('click', () => s.options.onOpen(pin.id));
  card.append(close, text, open);
  s.wrap.append(card);
  liftCredit(s, card);
}

function showFail(s: PageState): void {
  if (s.failed || s.left) return;
  s.failed = true;
  closeCard(s);
  s.engine?.destroy();
  s.engine = null;
  s.wrap.querySelector('.map-canvas')?.setAttribute('hidden', '');
  s.wrap.querySelector('.map-locate')?.remove();
  const fail = el('div', 'map-fail');
  const link = el('a', 'info-link', 'See the list');
  link.href = '/';
  link.addEventListener('click', (e) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    s.options.onSeeList();
  });
  fail.append(el('p', undefined, "The map can't load right now."), link);
  s.wrap.append(fail);
}

function syncLocate(s: PageState, locationOff: boolean): void {
  const existing = s.wrap.querySelector('.map-locate');
  if (!locationOff || s.failed) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const button = el('button', 'map-locate', 'Use my location');
  button.type = 'button';
  button.addEventListener('click', () => {
    s.awaitingFix = true;
    s.options.onUseLocation();
  });
  s.wrap.append(button);
}

function sameSpot(a: LatLng | null, b: LatLng | null): boolean {
  return a === b || (!!a && !!b && a.lat === b.lat && a.lng === b.lng);
}

export function renderMapPage(root: HTMLElement, model: MapPageModel, options: MapPageOptions): void {
  leaveMapPage();

  const back = el('button', 'info-back');
  back.type = 'button';
  back.innerHTML = BACK_SVG;
  back.append('Back');
  back.addEventListener('click', () => options.onBack());

  const h1 = el('h1', 'info-title', 'Map');

  const wrap = el('div', 'map-wrap');
  const canvas = el('div', 'map-canvas');
  wrap.append(canvas);

  const list = el('ul', 'visually-hidden map-list');
  list.setAttribute('aria-label', 'Spots');
  for (const pin of model.pins) {
    const li = el('li');
    const a = el('a', undefined, pin.name);
    a.href = pin.href;
    a.addEventListener('click', (e) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      options.onOpen(pin.id);
    });
    li.append(a);
    list.append(li);
  }

  root.replaceChildren(back, h1, wrap, list);

  const s: PageState = {
    root,
    wrap,
    options,
    pins: model.pins,
    openId: null,
    you: model.you,
    engine: null,
    failed: false,
    left: false,
    moved: model.camera !== null,
    awaitingFix: false,
    cleanups: [],
    cardObserver: null,
  };
  state = s;

  syncLocate(s, model.locationOff);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && s.openId) closeCard(s);
  };
  document.addEventListener('keydown', onKey);
  s.cleanups.push(() => document.removeEventListener('keydown', onKey));

  // A tap on the map itself (not a pin, not a drag) closes the card.
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.map-pin')) return;
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 0;
    down = null;
    if (moved < 6) closeCard(s);
  });

  const query = darkQuery();
  if (query) {
    const onScheme = (e: MediaQueryListEvent) => s.engine?.setScheme(e.matches ? 'dark' : 'light');
    query.addEventListener('change', onScheme);
    s.cleanups.push(() => query.removeEventListener('change', onScheme));
  }

  options
    .createEngine(canvas, query?.matches ? 'dark' : 'light', () => showFail(s))
    .then((engine) => {
      if (s.left || s.failed) {
        engine.destroy();
        return;
      }
      s.engine = engine;
      engine.setPins(s.pins, (id) => openCard(s, id));
      engine.setYou(s.you);
      if (model.camera) engine.setCamera(model.camera);
      else engine.fit(model.firstView);
      engine.onMove((c, byUser) => {
        if (byUser) s.moved = true;
        options.onMove(c);
      });
    })
    .catch(() => showFail(s));
}

export function updateMapPage(root: HTMLElement, model: MapPageModel): void {
  const s = state;
  if (!s || s.root !== root) return;
  s.pins = model.pins;
  if (!sameSpot(s.you, model.you)) {
    s.you = model.you;
    s.engine?.setYou(model.you);
    // The first fix after Use my location: show the parent where they are
    // (with the nearest spot), unless they've already moved the map.
    if (model.you && s.awaitingFix) {
      s.awaitingFix = false;
      if (!s.moved) s.engine?.fit(model.firstView);
    }
  }
  syncLocate(s, model.locationOff);
  if (s.openId) {
    const pin = s.pins.find((p) => p.id === s.openId);
    const card = s.wrap.querySelector('.map-card');
    if (!pin || !card) return;
    const text = card.querySelector('.map-card-text')!;
    let walk = card.querySelector('.map-card-walk');
    if (!pin.walk) walk?.remove();
    else if (walk) {
      if (walk.textContent !== pin.walk) walk.textContent = pin.walk;
    } else {
      walk = el('span', 'map-card-walk', pin.walk);
      text.append(walk);
    }
  }
}

export function leaveMapPage(): void {
  const s = state;
  if (!s) return;
  state = null;
  s.left = true;
  s.cleanups.forEach((fn) => fn());
  s.cardObserver?.disconnect();
  s.cardObserver = null;
  s.engine?.destroy();
  s.engine = null;
}
