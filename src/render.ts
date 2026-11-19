import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
import type { Fact } from './facts';
import type { Viewpoint } from './viewpoints';
import { formatCountdown, formatAge, formatLastLive } from './display';
import { renderDirectionStrip, clearPreviousPositions } from './strip';
import { renderSpotHeader } from './spotHeader';
import { escapeHtml } from './escapeHtml';
import { regionFor, isNewRegionThisSession, type Region } from './freightRegions';
import type { Direction } from './direction';
import { renderTapSlot, renderAskCard, type TapView } from './tapUi';
import { LOCATION_NUDGE, ticketBadgeLabel } from './tapCopy';

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
  /** The invitation's "Show me how": the explainer. */
  onOpenHow: () => void;
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
  for (const kept of root.querySelectorAll(':scope > .quiet-card, :scope > .lost-notice, :scope > .spot-tools, :scope > .location-nudge')) {
    preserved.add(kept);
  }

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

  const lost = vm.freshness.state === 'stale';
  const failed = vm.freshness.state === 'no-data' && vm.error !== undefined;

  // What stands where the cards go. Nothing goes above a live countdown; the
  // paused notice only shows when the cards hold a dash instead.
  if (vm.freshness.state === 'no-data') {
    // Before the first live times: connecting, or a plain-words error (the
    // error's own text is technical, so it is never shown).
    out.push(quietCard(root, failed ? 'error' : 'connecting', vm.viewpoint.lineId));
  } else if (lost) {
    out.push(lostNotice(root));
    for (const dir of ['north', 'south'] as const) {
      out.push(renderCard(dir === 'north' ? existingCardN : existingCardS, vm, dir));
    }
  } else if (!vm.north && !vm.south) {
    out.push(quietCard(root, 'none', vm.viewpoint.lineId));
  } else {
    for (const dir of ['north', 'south'] as const) {
      out.push(renderCard(dir === 'north' ? existingCardN : existingCardS, vm, dir));
    }
  }

  // The ask card sits in the page flow below the cards, never over a
  // countdown, and stays through spells with no trains to show.
  if (ask) out.push(ask);

  // Timing needs location: one line that turns it on, below the cards.
  if (vm.tap.nudge) out.push(locationNudgeLine(root));

  // The walking time (with its off control) and "Verify on map", together
  // under the cards so neither pushes a countdown down.
  out.push(spotTools(root, vm, failed));

  // Quiet rotating line of verified trivia above the data age. Tap to advance.
  const factLine = renderFactLine(vm.fact, options.onAdvanceFact);
  if (factLine) out.push(factLine);

  if (vm.freshness.state !== 'no-data') {
    const footer = document.createElement('div');
    footer.className = `footer ${vm.freshness.state}`;
    footer.textContent = vm.freshness.state === 'stale'
      ? formatLastLive(vm.freshness.ageMs)
      : `Live times · ${formatAge(vm.freshness.ageMs)}`;
    out.push(footer);
  }

  const docs = document.createElement('nav');
  docs.className = 'doc-links';
  docs.setAttribute('aria-label', 'Site information');
  docs.innerHTML =
    '<a href="/about.html">About</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/feedback.html">Feedback</a>' +
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

const TFL_STATUS_URL = 'https://tfl.gov.uk/tube-dlr-overground/status/';

type QuietKind = 'none' | 'connecting' | 'error';

const QUIET_COPY: Record<QuietKind, { heading: string; body: string; tfl: boolean }> = {
  // Board 11.
  none: { heading: 'No trains for a while', body: "The line's having a rest. Check back soon.", tfl: true },
  connecting: { heading: 'Getting the live times', body: "Won't be a moment.", tfl: false },
  error: { heading: "Can't get the live times", body: "We'll keep trying.", tfl: true },
};

// Board 11's sleeping train: the passenger drawing with its eye shut and its
// lamp off, doors in the line's colour, and "z z" only when the line rests.
const SLEEPING_TRAIN =
  '<path d="M4 12 H90 Q106 12 113 27 L116 36 Q116 41 111 41 H4 Z" fill="#FFFFFF" stroke="#1F2A44" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<path d="M93 16 Q104 17 109 28 H95 Z" fill="#1F2A44"/>' +
  '<path d="M100 22 Q104 25 108 22" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>' +
  '<rect x="10" y="17" width="78" height="10" rx="3" fill="#1F2A44"/>' +
  '<rect x="26" y="15" width="10" height="23" rx="1.5" fill="currentColor" stroke="#1F2A44" stroke-width="1.5"/>' +
  '<rect x="62" y="15" width="10" height="23" rx="1.5" fill="currentColor" stroke="#1F2A44" stroke-width="1.5"/>' +
  '<rect x="4" y="33" width="112" height="4" fill="currentColor"/>' +
  '<circle cx="111" cy="33" r="2.6" fill="#C9D3E0"/>' +
  '<path d="M40 12 L47 8 L54 12" fill="none" stroke="#1F2A44" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="10" y="40" width="26" height="5" rx="2" fill="#1F2A44"/>' +
  '<rect x="74" y="40" width="26" height="5" rx="2" fill="#1F2A44"/>';
const SNORE = '<text x="128" y="26" class="quiet-z">z</text><text x="146" y="14" class="quiet-z quiet-z-small">z</text>';

/** The card that stands in for both direction cards when there is nothing
 *  to count down: no trains (board 11), connecting, or an error. Kept while
 *  its kind is unchanged, so the one-second redraw keeps a focused link. */
function quietCard(root: HTMLElement, kind: QuietKind, lineId: string): HTMLElement {
  const existing = root.querySelector<HTMLElement>(':scope > .quiet-card');
  if (existing && existing.dataset.kind === kind && existing.dataset.line === lineId) return existing;
  const copy = QUIET_COPY[kind];
  const card = document.createElement('section');
  card.className = `quiet-card ${kind}`;
  card.dataset.kind = kind;
  card.dataset.line = lineId;
  card.innerHTML =
    `<svg class="quiet-art" viewBox="0 0 200 96" aria-hidden="true">${kind === 'none' ? SNORE : ''}` +
    '<rect class="quiet-track" x="0" y="88" width="200" height="4" rx="2"/>' +
    `<g class="quiet-train" transform="translate(28 34) scale(1.15)">${SLEEPING_TRAIN}</g></svg>`;
  const heading = document.createElement('h2');
  heading.className = 'quiet-heading';
  heading.textContent = copy.heading;
  const body = document.createElement('p');
  body.className = 'quiet-body';
  body.textContent = copy.body;
  card.append(heading, body);
  if (copy.tfl) {
    const link = document.createElement('a');
    link.className = 'quiet-link';
    link.href = TFL_STATUS_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'See what TfL says';
    card.appendChild(link);
  }
  // Connecting and the error are announced; the resting line is not news.
  if (kind !== 'none') card.setAttribute('role', 'status');
  return card;
}

/** Board 12: the live times have gone quiet. Kept across redraws so it is
 *  announced once. */
function lostNotice(root: HTMLElement): HTMLElement {
  const existing = root.querySelector<HTMLElement>(':scope > .lost-notice');
  if (existing) return existing;
  const notice = document.createElement('div');
  notice.className = 'lost-notice';
  notice.setAttribute('role', 'status');
  const title = document.createElement('p');
  title.className = 'lost-title';
  title.textContent = 'Live times paused';
  const line = document.createElement('p');
  line.className = 'lost-line';
  line.textContent = "Can't reach the live times right now. We'll keep trying.";
  notice.append(title, line);
  return notice;
}

/** "Turn on location to time trains here". Kept across redraws so a focused
 *  line keeps its focus. */
function locationNudgeLine(root: HTMLElement): HTMLElement {
  const existing = root.querySelector<HTMLElement>(':scope > .location-nudge');
  if (existing) return existing;
  const line = document.createElement('button');
  line.type = 'button';
  line.className = 'location-nudge';
  line.textContent = LOCATION_NUDGE;
  line.addEventListener('click', () => currentOptions?.onEnableWalkingTime());
  return line;
}

/** The walking time and "Verify on map" on one row under the cards. Kept
 *  while the spot and label are unchanged, so a focused control survives the
 *  one-second redraw. After an error the walking time is left out. */
function spotTools(root: HTMLElement, vm: ViewModel, failed: boolean): HTMLElement {
  const key = `${vm.viewpoint.id}|${failed ? 'x' : vm.walkingLabel ?? '-'}`;
  const existing = root.querySelector<HTMLElement>(':scope > .spot-tools');
  if (existing && existing.dataset.key === key) return existing;
  const tools = document.createElement('div');
  tools.className = 'spot-tools';
  tools.dataset.key = key;
  if (!failed) {
    tools.appendChild(renderWalkingTime(
      vm.walkingLabel,
      () => currentOptions?.onEnableWalkingTime(),
      () => currentOptions?.onDisableWalkingTime(),
    ));
  }
  // Map-verify link: opens Google Maps at the spot's exact coords, to tell
  // which Northcote Road bridge without an in-app picture.
  tools.appendChild(renderMapLink(vm.viewpoint));
  return tools;
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
  const card = renderAskCard(tap.ask, {
    onChoice: (choice) => currentOptions?.onHelpChoice(choice),
    onOpenHow: () => currentOptions?.onOpenHow(),
  });
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
    if (ev.arrival.category === 'freight') {
      const word = document.createElement('span');
      word.className = 'ticker-freight-word';
      word.textContent = ' (freight)';
      then.appendChild(word);
    }
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
    // Label + small "Turn off" button so the feature can be disabled (also useful for QA:
    // disable → refresh → re-enable to exercise the full opt-in flow).
    el.innerHTML = `${PIN_SVG}<span>${escapeHtml(label)}</span>`;

    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'walking-time-off';
    off.textContent = 'Turn off';
    off.setAttribute('aria-label', 'Turn off walking time');
    off.addEventListener('click', onDisable);
    el.appendChild(off);
  }

  return el;
}

/** The freight journey line, only with both ends known: half a journey reads
 *  as broken, so the line is skipped. */
function journeyFor(event: BridgeEvent | undefined): HTMLElement | null {
  if (!event?.arrival.origin || !event.arrival.destinationName) return null;
  return renderJourney(event.arrival.origin, event.arrival.destinationName);
}

function renderJourney(origin: string, destination: string): HTMLElement {
  const journey = document.createElement('p');
  journey.className = 'freight-journey';
  const originRegion = regionFor(origin);
  const destRegion = regionFor(destination);
  journey.append('Coming from ', origin, regionChip(originRegion), ', off to ', destination);
  // Same-region trips (e.g. Willesden to Wembley) skip the second chip so the
  // line stays short and the chip keeps its meaning.
  if (destRegion !== originRegion) journey.appendChild(regionChip(destRegion));
  journey.append('.');
  return journey;
}

function hiddenText(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'visually-hidden';
  span.textContent = text;
  return span;
}

function regionChip(region: Region): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'region-chip';
  // Brackets only for screen readers, so the region is not read as part of
  // the place name.
  chip.append(hiddenText(' ('), region, hiddenText(')'));
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
  const { terminusName } = vm.viewpoint.directions[dir];
  const card = existing ?? document.createElement('section');
  card.className = 'direction-card';
  card.dataset.direction = dir;
  card.setAttribute('aria-label', `Next train to ${terminusName}`);

  const lost = vm.freshness.state === 'stale';
  const isFreight = !lost && event?.arrival.category === 'freight';
  const nodes: HTMLElement[] = [];
  card.classList.toggle('lost', lost);

  const top = document.createElement('div');
  top.className = 'card-top';
  const dest = document.createElement('span');
  dest.className = 'card-dest';
  dest.textContent = `To ${terminusName}`;
  if (isFreight) {
    const tag = document.createElement('span');
    tag.className = 'freight-tag';
    tag.textContent = 'Freight';
    dest.appendChild(document.createTextNode(' '));
    dest.appendChild(tag);
  }
  top.appendChild(dest);
  const then = lost ? null : renderThen(ticker);
  if (then) top.appendChild(then);
  nodes.push(top);

  if (lost) {
    // Board 12: a dash where the countdown was, until the live times return.
    // The timing slot below stays exactly as it is: a pass can still be
    // timed, and its thank-you still shows.
    const dash = document.createElement('div');
    dash.className = 'value lost';
    dash.textContent = '–';
    dash.setAttribute('aria-hidden', 'true');
    const note = document.createElement('p');
    note.className = 'card-lost-note';
    note.textContent = 'Back when the live times return';
    nodes.push(dash, note);
    card.classList.remove('card-imminent');
    previousValueText[dir] = '–';
  } else {
    renderLiveParts(card, vm, dir, event, isFreight, nodes, vm.tap[dir].state === 'none');
  }

  const slot = renderTapSlot(
    card.querySelector<HTMLElement>(':scope > .tap-slot'),
    vm.tap[dir],
    {
      onTap: (pressedAtMs) => currentOptions?.onTap(dir, pressedAtMs),
      onOpenTicket: () => currentOptions?.onOpenTicket(),
      onOpenHow: () => currentOptions?.onOpenHow(),
    },
    vm.tap.short === true,
  );
  if (slot) {
    slot.dataset.direction = dir;
    // Board 10's "Coming from X, off to Y." goes in the slot a freight hero
    // leaves empty, so it never pushes the next card down. The button, the
    // thank-you and the rank-up come first; then the journey; then the
    // placeholder (which a freight hero never gets).
    const journey = slot.dataset.state === 'reserved' && isFreight ? journeyFor(event) : null;
    if (journey) {
      slot.replaceChildren(journey);
      slot.removeAttribute('aria-hidden');
      slot.dataset.state = 'journey';
    }
    nodes.push(slot);
  }

  place(card, nodes);
  return card;
}

/** The countdown, the freight journey and the line diagram of a card with
 *  live times. */
function renderLiveParts(
  card: HTMLElement,
  vm: ViewModel,
  dir: Direction,
  event: BridgeEvent | undefined,
  isFreight: boolean,
  nodes: HTMLElement[],
  /** No timing slot on this card, so the freight journey goes under the countdown. */
  noSlot: boolean,
): void {
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

  // Board 10: "Coming from X, off to Y." under the countdown where the card
  // has no timing slot (else it goes in the slot, see renderCard).
  const journey = isFreight && noSlot ? journeyFor(event) : null;
  if (journey) nodes.push(journey);

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
}
