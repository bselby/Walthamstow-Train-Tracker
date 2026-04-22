import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
import type { Fact } from './facts';
import type { Viewpoint } from './viewpoints';
import { formatCountdown, formatAge } from './display';
import { renderDirectionStrip, clearPreviousPositions } from './strip';
import { renderSwitcher } from './switcher';

export interface ViewModel {
  north?: BridgeEvent;
  south?: BridgeEvent;
  freshness: FreshnessState;
  error?: string;
  northPos: number | null;
  southPos: number | null;
  celebrate: { north: boolean; south: boolean };
  northTicker: BridgeEvent[];   // entries 1..n (hero is north)
  southTicker: BridgeEvent[];
  walkingLabel: string | null;  // null = feature disabled / not yet available
  fact: Fact;
  viewpoint: Viewpoint;   // active viewpoint — drives strip, header, theming
  favouriteViewpointId: string;   // id of the user's current favourite
}

export interface RenderOptions {
  onEnableWalkingTime: () => void;
  onDisableWalkingTime: () => void;
  /** Called when the user taps / clicks the fact ticker. Advances to the next
   *  fact immediately (giving Ben agency + the toddler something to poke at). */
  onAdvanceFact: () => void;
  onSwitchViewpoint: (id: string) => void;
  onSetFavouriteViewpoint: (id: string) => void;
}

// Track the viewpoint id from the last render so we can invalidate preserved
// strips when the user switches viewpoint — otherwise stale strips (with the
// wrong stops + bridge glyph) linger at the top of the DOM while the switcher
// gets re-appended below them. Also blanks previous-value memos keyed on the
// old viewpoint's direction labels, which would otherwise suppress the
// "ticking" animation on the first paint of the new viewpoint.
let lastRenderedViewpointId: string | null = null;

export function render(root: HTMLElement, vm: ViewModel, options: RenderOptions): void {
  const viewpointChanged = lastRenderedViewpointId !== null
    && lastRenderedViewpointId !== vm.viewpoint.id;
  lastRenderedViewpointId = vm.viewpoint.id;

  // Preserve the switcher and strips across renders so the switcher keeps its
  // open/closed state + listeners, and the strips keep their CSS transitions
  // alive between state updates. Everything else (rows, footer, error, empty)
  // is rebuilt each tick. Strips are NOT preserved across a viewpoint switch —
  // they need fresh stops + anchorIndex + bridge config.
  const existingSwitcher = root.querySelector<HTMLElement>('.switcher');
  const existingStripN = viewpointChanged ? null : root.querySelector<HTMLElement>('.strip-north');
  const existingStripS = viewpointChanged ? null : root.querySelector<HTMLElement>('.strip-south');
  const preserved = new Set<Element>();
  if (existingSwitcher) preserved.add(existingSwitcher);
  if (existingStripN) preserved.add(existingStripN);
  if (existingStripS) preserved.add(existingStripS);

  Array.from(root.children).forEach((child) => {
    if (!preserved.has(child)) root.removeChild(child);
  });

  if (viewpointChanged) {
    // Clear the previous-value memo so the new viewpoint's direction rows
    // don't inherit a "no change" state from the old viewpoint's labels.
    for (const key of Object.keys(previousValueText)) delete previousValueText[key];
    // Clear strip's last-known position so the first render after a switch
    // doesn't compare against the old viewpoint's strip position and pulse
    // wrong pips (e.g. comparing East Ave pos=5.5 with Queens Road pos=6).
    clearPreviousPositions();
  }

  // Always (re-)append the switcher first so it sits at the top of the flex column.
  const switcher = renderSwitcher(existingSwitcher, {
    activeViewpoint: vm.viewpoint,
    favouriteViewpointId: vm.favouriteViewpointId,
    onSwitch: options.onSwitchViewpoint,
    onSetFavourite: options.onSetFavouriteViewpoint,
  });
  root.appendChild(switcher);

  // Walking-time row immediately below the header (only when we're showing rows,
  // not in the error-only state — same treatment as the rows themselves).
  if (vm.freshness.state !== 'no-data' || !vm.error) {
    root.appendChild(renderWalkingTime(vm.walkingLabel, options.onEnableWalkingTime, options.onDisableWalkingTime));
  }

  if (vm.freshness.state === 'no-data' && vm.error) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = vm.error;
    root.appendChild(err);
    return;
  }

  // First paint fires before the initial TfL fetch resolves — show a connecting
  // state instead of the (misleading) "No trains right now" empty state.
  if (vm.freshness.state === 'no-data') {
    const connecting = document.createElement('div');
    connecting.className = 'empty';
    connecting.innerHTML = '<p>Connecting to TfL…</p>';
    root.appendChild(connecting);
  } else if (!vm.north && !vm.south) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `
      <p>No trains right now.</p>
      <a href="https://tfl.gov.uk/tube-dlr-overground/status/" target="_blank" rel="noopener">Check TfL status</a>
    `;
    root.appendChild(empty);
  } else {
    // Northbound: row, strip, ticker
    root.appendChild(renderDirection(
      vm.viewpoint.directions.north.label,
      vm.north,
      `Next train to ${vm.viewpoint.directions.north.terminusName}`,
    ));
    const stripN = renderDirectionStrip(existingStripN, {
      direction: 'north',
      pos: vm.northPos,
      celebrate: vm.celebrate.north,
      stops: vm.viewpoint.stops,
      anchorIndex: vm.viewpoint.anchorIndex,
      bridgeStripPosition: vm.viewpoint.positionModel === 'east-ave-bridge' ? 5.5 : null,
      bridgeLabel: vm.viewpoint.positionModel === 'east-ave-bridge' ? 'East Av' : null,
      lineNameForAria: `${vm.viewpoint.lineName} line`,
    });
    root.appendChild(stripN);
    const tickerN = renderTicker(vm.northTicker);
    if (tickerN) root.appendChild(tickerN);

    // Southbound: row, strip, ticker
    root.appendChild(renderDirection(
      vm.viewpoint.directions.south.label,
      vm.south,
      `Next train to ${vm.viewpoint.directions.south.terminusName}`,
    ));
    const stripS = renderDirectionStrip(existingStripS, {
      direction: 'south',
      pos: vm.southPos,
      celebrate: vm.celebrate.south,
      stops: vm.viewpoint.stops,
      anchorIndex: vm.viewpoint.anchorIndex,
      bridgeStripPosition: vm.viewpoint.positionModel === 'east-ave-bridge' ? 5.5 : null,
      bridgeLabel: vm.viewpoint.positionModel === 'east-ave-bridge' ? 'East Av' : null,
      lineNameForAria: `${vm.viewpoint.lineName} line`,
    });
    root.appendChild(stripS);
    const tickerS = renderTicker(vm.southTicker);
    if (tickerS) root.appendChild(tickerS);
  }

  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  root.appendChild(footer);

  // Quiet rotating line of verified Weaver-line trivia, below the "updated Xs ago"
  // footer and above the About/Privacy/Terms links. Never competes with the data.
  // Tap to advance — turns it into a tiny interactive toy for toddler prodding.
  const factLine = renderFactLine(vm.fact, options.onAdvanceFact);
  if (factLine) root.appendChild(factLine);

  const docs = document.createElement('nav');
  docs.className = 'doc-links';
  docs.setAttribute('aria-label', 'Site information');
  docs.innerHTML =
    '<a href="/about.html">About</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/privacy.html">Privacy</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/terms.html">Terms</a>';
  root.appendChild(docs);
}

function renderTicker(events: BridgeEvent[]): HTMLElement | null {
  if (events.length === 0) return null;

  const row = document.createElement('div');
  row.className = 'ticker';

  const prefix = document.createElement('span');
  prefix.className = 'ticker-prefix';
  prefix.textContent = 'Then';
  row.appendChild(prefix);

  events.forEach((ev, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      sep.textContent = '·';
      row.appendChild(sep);
    }
    const val = document.createElement('span');
    val.className = 'ticker-value';
    const mins = Math.max(0, Math.floor(ev.bridgeTimeSeconds / 60));
    // Only the LAST value gets the "min" suffix so the row doesn't shout "MIN · MIN · MIN".
    val.textContent = i === events.length - 1 ? `${mins} min` : `${mins}`;
    row.appendChild(val);
  });

  return row;
}

// Memo of the last-rendered fact so we can animate a fade only on change.
let previousFactText: string | null = null;

// Category → SVG icon. All 16×16 viewBoxes using `currentColor` so CSS controls
// the fill (Overground orange by default). Tiny, child-book-flavoured marks —
// they turn the ticker into something that visibly cycles through subjects.
//
// - line:    a weaver-zigzag inside a roundel (Weaver line origin = textile workers)
// - station: a platform/sign silhouette with a flagpole
// - train:   a cartoon train-front matching the strips' carriages
// - local:   a simple tree for Walthamstow-local trivia
// - default: the roundel-with-"?" used when a new fact is added without a category
const FACT_ICONS: Record<string, string> = {
  line:
    '<svg class="fact-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M3.8 8 L5.6 6.2 L7.4 9.8 L9.2 6.2 L11 9.8 L12.8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',
  station:
    '<svg class="fact-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M7.6 2.5 V6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M7.6 2.6 L11.2 3.6 L7.6 4.6 Z" fill="currentColor"/>' +
      '<rect x="3" y="7.2" width="9.4" height="5.8" rx="0.9" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M3 9.4 L12.4 9.4" stroke="currentColor" stroke-width="1.1"/>' +
      '<circle cx="5.4" cy="11.3" r="0.6" fill="currentColor"/>' +
      '<circle cx="10" cy="11.3" r="0.6" fill="currentColor"/>' +
    '</svg>',
  train:
    '<svg class="fact-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="2.4" y="4" width="11.2" height="7.2" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<rect x="4.2" y="5.8" width="2.6" height="2.2" rx="0.5" fill="currentColor"/>' +
      '<rect x="9.2" y="5.8" width="2.6" height="2.2" rx="0.5" fill="currentColor"/>' +
      '<circle cx="5.2" cy="12.2" r="0.9" fill="currentColor"/>' +
      '<circle cx="10.8" cy="12.2" r="0.9" fill="currentColor"/>' +
    '</svg>',
  local:
    '<svg class="fact-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M8 2 C5.5 4.5 4.8 6.8 4.8 8.3 C4.8 9.8 6.2 10.9 8 10.9 C9.8 10.9 11.2 9.8 11.2 8.3 C11.2 6.8 10.5 4.5 8 2 Z" fill="currentColor"/>' +
      '<path d="M8 10.5 L8 13.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
    '</svg>',
  default:
    '<svg class="fact-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M5.9 6.1c0-1.2 1-2.1 2.2-2.1 1.1 0 2.1.8 2.1 2 0 1.5-2 1.6-2 3.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
      '<circle cx="8.1" cy="11.3" r="0.75" fill="currentColor"/>' +
    '</svg>',
};

const CATEGORY_LABEL: Record<string, string> = {
  line: 'Line',
  station: 'Station',
  train: 'Train',
  local: 'Walthamstow',
  default: 'Trivia',
};

function renderFactLine(fact: Fact, onAdvance: () => void): HTMLElement | null {
  if (!fact || !fact.text) return null;

  const el = document.createElement('button');
  el.type = 'button';
  el.className = `fact-line fact-line-${fact.category}`;
  el.setAttribute(
    'aria-label',
    `${CATEGORY_LABEL[fact.category] ?? 'Trivia'}: ${fact.text}. Tap for another fact.`,
  );

  // Build icon + text so only the text wraps / ellipsises — the icon always
  // stays pinned to the left of the fact, flex-shrink:0 in CSS.
  const iconSvg = FACT_ICONS[fact.category] ?? FACT_ICONS.default;
  const text = document.createElement('span');
  text.className = 'fact-text';
  text.textContent = fact.text;
  el.innerHTML = iconSvg;
  el.appendChild(text);

  // Only animate on *change* — not on every re-render — so the icon pop reads
  // as "new fact arrived" rather than as ambient jitter.
  if (previousFactText !== fact.text) {
    el.classList.add('fact-enter');
  }
  previousFactText = fact.text;

  el.addEventListener('click', (e) => {
    e.preventDefault();
    onAdvance();
  });

  return el;
}

// Remember each direction's last-rendered value text so we can animate ONLY on change.
// Keyed by direction label so both north and south rows track independently.
const previousValueText: Record<string, string> = {};

const PIN_SVG = '<svg class="walking-icon" viewBox="0 0 10 13" aria-hidden="true"><path d="M5 0C2 0 0 2 0 5c0 3 5 8 5 8s5-5 5-8c0-3-2-5-5-5Zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" fill="currentColor"/></svg>';

function renderWalkingTime(
  label: string | null,
  onEnable: () => void,
  onDisable: () => void
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'walking-time';

  if (label === null) {
    el.classList.add('walking-time-enable');
    el.innerHTML = `${PIN_SVG}<span>Enable walking time</span>`;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', onEnable);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnable();
      }
    });
  } else {
    // Label + small "off" button so the feature can be disabled (also useful for QA:
    // disable → refresh → re-enable to exercise the full opt-in flow).
    el.innerHTML = `${PIN_SVG}<span>${escapeHtml(label)}</span>`;

    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'walking-time-off';
    off.textContent = 'off';
    off.setAttribute('aria-label', 'Disable walking time');
    off.addEventListener('click', onDisable);
    el.appendChild(off);
  }

  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

function renderDirection(
  label: string,
  event: BridgeEvent | undefined,
  ariaLabel: string,
): HTMLElement {
  const row = document.createElement('section');
  row.className = 'row';
  row.setAttribute('aria-label', ariaLabel);

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('div');
  valueEl.className = 'value';

  let currentText: string;
  if (!event) {
    valueEl.classList.add('sleeping');
    currentText = 'No trains for a while';
  } else {
    const countdown = formatCountdown(event.bridgeTimeSeconds);
    valueEl.classList.add(countdown.kind);
    currentText = countdown.text;
    // Cue the eye to the arrow in the last 11–59 s before NOW, when the user
    // is actively waiting. The .now state has its own celebration, so we stop
    // the pulse once the countdown transitions.
    if (countdown.kind === 'seconds') {
      row.classList.add('row-imminent');
    }
  }
  valueEl.textContent = currentText;

  if (previousValueText[label] !== currentText) {
    valueEl.classList.add('ticking');
  }
  previousValueText[label] = currentText;

  row.appendChild(valueEl);
  return row;
}
