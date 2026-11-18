import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
import type { Fact } from './facts';
import type { Viewpoint } from './viewpoints';
import { formatCountdown, formatAge } from './display';
import { renderDirectionStrip, clearPreviousPositions } from './strip';
import { renderSpotHeader } from './spotHeader';
import { escapeHtml } from './escapeHtml';
import { regionFor, isNewRegionThisSession, type Region } from './freightRegions';
import type { Direction } from './direction';
import { renderTapSlot, renderAskCard, type TapView } from './tapUi';
import { ticketBadgeLabel } from './tapCopy';

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
  favouriteIds: readonly string[];   // every starred viewpoint, oldest first
  tap: TapView;   // timing slot per direction card + the ask card
}

export interface RenderOptions {
  onEnableWalkingTime: () => void;
  onDisableWalkingTime: () => void;
  /** Called when the user taps / clicks the fact ticker. Advances to the next
   *  fact immediately (giving Ben agency + the toddler something to poke at). */
  onAdvanceFact: () => void;
  /** Back to the list of all spots. */
  onHome: () => void;
  onToggleFavourite: (id: string) => void;
  /** `pressedAtMs` is when the finger landed, not when it lifted. */
  onTap: (direction: Direction, pressedAtMs: number) => void;
  onHelpChoice: (choice: 'helping' | 'declined') => void;
  /** The header ticket badge and a rank-up's "See my ticket". */
  onOpenTicket: () => void;
}

// The options from the latest render. Kept cards, slots and the ask card outlive
// the render that built them, so their listeners call through this instead of
// holding on to the handlers they were first given.
let currentOptions: RenderOptions | null = null;


// Track the viewpoint id from the last render so we can invalidate preserved
// strips when the user switches viewpoint — otherwise stale strips (with the
// wrong stops + bridge glyph) linger at the top of the DOM while the header
// gets re-appended below them. Also blanks previous-value memos keyed on the
// old viewpoint's direction labels, which would otherwise suppress the
// "ticking" animation on the first paint of the new viewpoint.
let lastRenderedViewpointId: string | null = null;

export function render(root: HTMLElement, vm: ViewModel, options: RenderOptions): void {
  const viewpointChanged = lastRenderedViewpointId !== null
    && lastRenderedViewpointId !== vm.viewpoint.id;
  lastRenderedViewpointId = vm.viewpoint.id;
  currentOptions = options;

  // Preserve the header and the direction cards across renders. The header
  // keeps its listeners (and a press on it in progress); each card is redrawn
  // in place around its line diagram and timing slot, which are never taken
  // out of the document: the diagram keeps its CSS transitions, a press in
  // progress survives, the clip does not replay and the thank-you is not
  // re-announced. Cards are NOT kept across a viewpoint switch: the diagram
  // needs fresh stops. The ask card is kept while its kind is unchanged.
  const existingHeader = root.querySelector<HTMLElement>('.spot-header');
  const existingCardN = viewpointChanged ? null : root.querySelector<HTMLElement>(':scope > .direction-card[data-direction="north"]');
  const existingCardS = viewpointChanged ? null : root.querySelector<HTMLElement>(':scope > .direction-card[data-direction="south"]');
  const ask = askCard(root.querySelector<HTMLElement>('.ask-card'), vm.tap);
  const answeredAskHadFocus = ask === null && focusedAskCard(root);
  const preserved = new Set<Element>();
  if (existingHeader) preserved.add(existingHeader);
  if (existingCardN) preserved.add(existingCardN);
  if (existingCardS) preserved.add(existingCardS);
  if (ask?.parentElement === root) preserved.add(ask);

  Array.from(root.children).forEach((child) => {
    if (!preserved.has(child)) root.removeChild(child);
  });

  if (viewpointChanged) {
    // Clear the previous-value memo so the new viewpoint's direction cards
    // don't inherit a "no change" state from the old viewpoint's labels.
    for (const key of Object.keys(previousValueText)) delete previousValueText[key];
    // Clear strip's last-known position so the first render after a switch
    // doesn't compare against the old viewpoint's strip position and pulse
    // wrong pips (e.g. comparing East Ave pos=5.5 with Queens Road pos=6).
    clearPreviousPositions();
  }

  // The page in order. Placed at the end without moving nodes that are
  // already in position, so kept nodes stay in the document.
  const out: HTMLElement[] = [];

  // The header always comes first: the way back to all spots, the ticket
  // badge, the star, then the spot name and line.
  out.push(renderSpotHeader(existingHeader, {
    viewpoint: vm.viewpoint,
    favourite: vm.favouriteIds.includes(vm.viewpoint.id),
    onHome: () => currentOptions?.onHome(),
    onToggleFavourite: (id) => currentOptions?.onToggleFavourite(id),
    ticketLabel: ticketBadgeLabel(vm.tap.taps),
    onOpenTicket: () => currentOptions?.onOpenTicket(),
    ticketFresh: vm.tap.north.state === 'thanks' || vm.tap.south.state === 'thanks',
  }));
  if (answeredAskHadFocus) {
    // The answered ask card is about to leave the page; its job is now the
    // badge's, so the keyboard focus goes there.
    focusAfterPlace = out[0].querySelector<HTMLElement>('.ticket-badge');
  }

  // Map-verify link: tap to open Google Maps with the viewpoint's exact coords —
  // disambiguates "which Northcote Road bridge?" without an in-app thumbnail.
  out.push(renderMapLink(vm.viewpoint));

  // Walking-time row immediately below the header (only when we're showing rows,
  // not in the error-only state — same treatment as the rows themselves).
  if (vm.freshness.state !== 'no-data' || !vm.error) {
    out.push(renderWalkingTime(vm.walkingLabel, options.onEnableWalkingTime, options.onDisableWalkingTime));
  }

  if (vm.freshness.state === 'no-data' && vm.error) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = vm.error;
    out.push(err);
    if (ask) out.push(ask);
    place(root, out);
    takeFocus();
    return;
  }

  // First paint fires before the initial TfL fetch resolves — show a connecting
  // state instead of the (misleading) "No trains right now" empty state.
  if (vm.freshness.state === 'no-data') {
    const connecting = document.createElement('div');
    connecting.className = 'empty';
    connecting.innerHTML = '<p>Connecting to TfL…</p>';
    out.push(connecting);
  } else if (!vm.north && !vm.south) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `
      <p>No trains right now.</p>
      <a href="https://tfl.gov.uk/tube-dlr-overground/status/" target="_blank" rel="noopener">Check TfL status</a>
    `;
    out.push(empty);
  } else {
    for (const dir of ['north', 'south'] as const) {
      out.push(renderCard(dir === 'north' ? existingCardN : existingCardS, vm, dir));
    }
  }

  // The ask card sits in the page flow below the cards, never over a
  // countdown, and stays through spells with no trains to show.
  if (ask) out.push(ask);

  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  out.push(footer);

  // Quiet rotating line of verified Weaver-line trivia, below the "updated Xs ago"
  // footer and above the About/Privacy/Terms links. Never competes with the data.
  // Tap to advance — turns it into a tiny interactive toy for toddler prodding.
  const factLine = renderFactLine(vm.fact, options.onAdvanceFact);
  if (factLine) out.push(factLine);

  const docs = document.createElement('nav');
  docs.className = 'doc-links';
  docs.setAttribute('aria-label', 'Site information');
  docs.innerHTML =
    '<a href="/about.html">About</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/privacy.html">Privacy</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/terms.html">Terms</a>';
  out.push(docs);
  place(root, out);
  takeFocus();
}

/** Put `nodes` into `root` in order. Nodes already in place are not touched,
 *  so a kept node is never taken out of the document; anything else goes. */
function place(root: HTMLElement, nodes: HTMLElement[]): void {
  const wanted = new Set<Element>(nodes);
  Array.from(root.children).forEach((child) => {
    if (!wanted.has(child)) root.removeChild(child);
  });
  nodes.forEach((node, i) => {
    const at = root.children[i] ?? null;
    if (at !== node) root.insertBefore(node, at);
  });
}

function takeFocus(): void {
  if (focusAfterPlace) {
    focusAfterPlace.focus();
    focusAfterPlace = null;
  }
}

// Where the keyboard focus goes once the page is placed: the ticket badge,
// when the ask card holding the focus has just been answered.
let focusAfterPlace: HTMLElement | null = null;

function focusedAskCard(root: HTMLElement): boolean {
  const card = root.querySelector('.ask-card');
  return card !== null && card.contains(document.activeElement);
}

function askCard(existing: HTMLElement | null, tap: TapView): HTMLElement | null {
  if (existing && existing.dataset.ask === tap.ask) return existing;
  const card = renderAskCard(tap.ask, (choice) => currentOptions?.onHelpChoice(choice));
  if (card) card.dataset.ask = tap.ask ?? '';
  return card;
}

/** "then 14 and 29 min": the trains after the hero, the unit said once. */
function renderThen(events: BridgeEvent[]): HTMLElement | null {
  if (events.length === 0) return null;
  const then = document.createElement('span');
  then.className = 'card-then';
  then.appendChild(document.createTextNode('then '));
  events.forEach((ev, i) => {
    if (i > 0) {
      then.appendChild(document.createTextNode(i === events.length - 1 ? ' and ' : ', '));
    }
    const val = document.createElement('span');
    val.className = 'ticker-value';
    if (ev.arrival.category === 'freight') val.classList.add('ticker-value-freight');
    const mins = Math.max(0, Math.floor(ev.bridgeTimeSeconds / 60));
    val.textContent = i === events.length - 1 ? `${mins} min` : `${mins}`;
    then.appendChild(val);
  });
  return then;
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

function renderMapLink(viewpoint: Viewpoint): HTMLElement {
  const { lat, lng } = viewpoint.coords;
  // ?api=1 deep-links into the Google Maps app on iOS/Android when installed,
  // and falls back to maps.google.com in a browser. Coords (not name) so the
  // pin always lands on the exact spot — even if multiple "Northcote Roads" exist.
  const href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  const el = document.createElement('a');
  el.className = 'map-link';
  el.href = href;
  el.target = '_blank';
  el.rel = 'noopener';
  el.setAttribute('aria-label', `Verify ${viewpoint.name} on Google Maps`);
  el.innerHTML = `${PIN_SVG}<span>Verify on map</span>`;
  return el;
}

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

function regionChip(region: Region): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'region-chip';
  chip.textContent = ` · ${region}`;
  if (isNewRegionThisSession(region)) {
    chip.classList.add('new-this-session');
    // Strip the class once the shimmer completes so a re-render of the same
    // region (still novel within this session) doesn't re-trigger the animation.
    chip.addEventListener(
      'animationend',
      () => chip.classList.remove('new-this-session'),
      { once: true },
    );
  }
  return chip;
}

/**
 * One direction's card (board 4): "To <destination>" and the trains after,
 * the countdown, the line diagram with both ends named, the timing slot and,
 * for freight, where it is going. A kept card is redrawn in place: its line
 * diagram and timing slot are reused and never leave the document.
 */
function renderCard(existing: HTMLElement | null, vm: ViewModel, dir: Direction): HTMLElement {
  const event = dir === 'north' ? vm.north : vm.south;
  const ticker = dir === 'north' ? vm.northTicker : vm.southTicker;
  const { label, terminusName } = vm.viewpoint.directions[dir];
  const card = existing ?? document.createElement('section');
  card.className = 'direction-card';
  card.dataset.direction = dir;
  card.setAttribute('aria-label', `Next train to ${terminusName}`);

  const isFreight = event?.arrival.category === 'freight';
  const nodes: HTMLElement[] = [];

  const top = document.createElement('div');
  top.className = 'card-top';
  const dest = document.createElement('span');
  dest.className = 'card-dest';
  dest.textContent = `To ${destinationOf(label, terminusName)}`;
  if (isFreight) {
    const tag = document.createElement('span');
    tag.className = 'freight-tag';
    tag.textContent = 'FREIGHT';
    tag.setAttribute('aria-label', 'Freight service');
    dest.appendChild(document.createTextNode(' '));
    dest.appendChild(tag);
  }
  top.appendChild(dest);
  const then = renderThen(ticker);
  if (then) top.appendChild(then);
  nodes.push(top);

  const valueEl = document.createElement('div');
  valueEl.className = 'value';
  let currentText: string;
  if (!event) {
    valueEl.classList.add('sleeping');
    currentText = 'No trains for a while';
    valueEl.textContent = currentText;
  } else {
    const countdown = formatCountdown(event.bridgeTimeSeconds);
    valueEl.classList.add(countdown.kind);
    currentText = countdown.text;
    if (countdown.kind === 'minutes' || countdown.kind === 'seconds') {
      // "6 min": the number big, the unit beside it.
      const [num, unit] = countdown.text.split(' ');
      const numEl = document.createElement('span');
      numEl.className = 'value-num';
      numEl.textContent = num;
      const unitEl = document.createElement('span');
      unitEl.className = 'value-unit';
      unitEl.textContent = unit;
      valueEl.append(numEl, ' ', unitEl);
    } else {
      valueEl.textContent = currentText;
    }
  }
  card.classList.toggle('card-imminent', valueEl.classList.contains('seconds'));
  if (previousValueText[dir] !== currentText) valueEl.classList.add('ticking');
  previousValueText[dir] = currentText;
  nodes.push(valueEl);

  nodes.push(renderDirectionStrip(card.querySelector<HTMLElement>(':scope > .strip'), {
    direction: dir,
    pos: dir === 'north' ? vm.northPos : vm.southPos,
    celebrate: vm.celebrate[dir],
    stops: vm.viewpoint.stops,
    anchorIndex: vm.viewpoint.anchorIndex,
    pinPosition: vm.viewpoint.pinPosition,
    lineId: vm.viewpoint.lineId,
    lineNameForAria: `${vm.viewpoint.lineName} line`,
    isFreight,
  }));

  const slot = renderTapSlot(
    card.querySelector<HTMLElement>(':scope > .tap-slot'),
    vm.tap[dir],
    {
      onTap: (pressedAtMs) => currentOptions?.onTap(dir, pressedAtMs),
      onOpenTicket: () => currentOptions?.onOpenTicket(),
    },
  );
  if (slot) {
    slot.dataset.direction = dir;
    nodes.push(slot);
  }

  // Origin → destination subtitle, only when we have BOTH ends — half an arrow
  // ("Tilbury Riverside Yard →") looks broken, so skip the row instead.
  if (isFreight && event?.arrival.origin && event?.arrival.destinationName) {
    const journey = document.createElement('div');
    journey.className = 'freight-journey';

    const originRegion = regionFor(event.arrival.origin);
    const destRegion = regionFor(event.arrival.destinationName);

    journey.appendChild(document.createTextNode(event.arrival.origin));
    journey.appendChild(regionChip(originRegion));
    journey.appendChild(document.createTextNode(' → '));
    journey.appendChild(document.createTextNode(event.arrival.destinationName));
    // Same-region trips (e.g. Willesden → Wembley) skip the duplicate chip
    // so the line stays compact and the chip retains meaning.
    if (destRegion !== originRegion) {
      journey.appendChild(regionChip(destRegion));
    }

    journey.setAttribute(
      'aria-label',
      `Freight journey: ${event.arrival.origin} (${originRegion}) to ${event.arrival.destinationName} (${destRegion})`,
    );
    nodes.push(journey);
  }

  place(card, nodes);
  return card;
}

/** The destination as the boards write it: the label without its arrow
 *  ("← Walthamstow Central"), falling back to the terminus name. */
function destinationOf(label: string, terminusName: string): string {
  const name = label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return name || terminusName;
}
