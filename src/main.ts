import { fetchArrivals, fetchStopArrivals } from './tfl';
import { pickNextNPerDirection } from './bridge';
import type { BridgeEvent } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller, createRetry } from './poller';
import { render, type ViewModel } from './render';
import { formatCountdown } from './display';
import { estimatePosition } from './trainPosition';
import { POLL_INTERVAL_MS, FREIGHT_POLL_INTERVAL_MS } from './constants';
import { getViewpointById, DEFAULT_VIEWPOINT_ID, VIEWPOINTS } from './viewpoints';
import type { Viewpoint } from './viewpoints';
import type { Direction } from './direction';
import { subscribe as subscribeLocation, start as startLocation, stop as stopLocation, getState as getLocationState } from './geolocation';
import { walkingEstimate, formatWalkingLabel } from './walkingTime';
import { factAt } from './facts';
import { subscribeBerthEvents } from './tdProxy';
import { berthEtaFromStep, liveBerthEta, alreadyPassedPerBerth } from './berthEta';
import { snapshotViewpoint, type DirectionSnapshot, type ViewpointSnapshots } from './snapshots';
import type { BerthEvent } from './tdProxy';
import { fetchFreight, clampFreightPosition } from './freight';
import { atViewpoint, canTuneViewpoint, passKey, updatePass, type TapPass } from './tap';
import { chooseHelp, loadTapState, recordTap, resetChoice, saveTapState } from './tapStore';
import { buildTapPayload, sendTap, shouldSendTaps } from './tapClient';
import { msUntilButton, newDeviceId, tapAsk, tapDirectionView, tflExpectedArrivalMs } from './tapView';
import { parseRoute, viewpointPath, HOME_PATH, TICKET_PATH, HOW_PATH } from './routes';
import { loadFavourites, saveFavourites, toggleFavourite } from './favourites';
import { landingFor } from './landing';
import { renderHome } from './home';
import { renderTicketPage } from './ticketPage';
import { renderHowItWorks } from './howItWorks';
import { buildHomeModel, homeRowOrder } from './homeModel';
import { pollHome, HOME_POLL_INTERVAL_MS, HOME_STALE_MS, type HomeSnapshots } from './homeArrivals';

// A small hello for anyone peeking at devtools. One console log, no overhead.
console.log(
  '%c🚂 E17 Trains\n%cLive train times from popular E17 toddler viewpoints.\nSource: github.com/bselby/Walthamstow-Train-Tracker',
  'font: 700 16px system-ui; color: #EE7C0E;',
  'font: 500 12px system-ui; color: #1a2840; line-height: 1.6;'
);

const root = document.getElementById('app')!;

const DIRECTIONS: readonly Direction[] = ['north', 'south'];
const CELEBRATE_DURATION_MS = 1000;
const TICKER_SIZE = 4; // hero + 3 ticker entries

type DirectionSnapshots = DirectionSnapshot;

let snapshots: ViewpointSnapshots = {};
let lastFetchMs: number | null = null;
let lastError: string | undefined;

// Freight snapshots, mirroring `snapshots` shape: pickNextNPerDirection has
// already classified rows into north/south, computed bridgeTimeSeconds, and
// capped per direction. buildViewModel merges these with passenger snapshots
// into a single live-sorted hero + ticker list per direction.
let freightSnapshots: ViewpointSnapshots = {};
let freightPollerStop: (() => void) | null = null;

// Berth-based ETAs: Unix ms timestamp when the next train is expected to
// reach the viewpoint, derived from a live TD berth step event.
// Takes precedence over TfL-prediction timing for the hero train.
const berthEtas: Partial<Record<Direction, number>> = {};
// The berth step behind each ETA: when it fired and which train it was, for
// the tap payload's berthStepMs and the pass's berthTrainId.
const berthSteps: Partial<Record<Direction, { stepMs: number; trainId: string }>> = {};

// "Train's here" tap: the open pass per direction, and the thank-you window
// after a tap (until when, and for which pass, since the pass may expire first).
const THANKS_DURATION_MS = 60_000;
const tapPasses: Record<Direction, TapPass | null> = { north: null, south: null };
const thanksUntilMs: Partial<Record<Direction, number>> = {};
const thanksPassKey: Partial<Record<Direction, string>> = {};
// The tap being thanked could not be sent: the thank-you says so.
const tapOffline: Partial<Record<Direction, boolean>> = {};

// Generation counter — incremented on every viewpoint switch. tick() captures
// the current value at invocation time and discards results if it has changed
// by the time the fetch resolves, preventing a stale viewpoint's arrivals from
// overwriting the current viewpoint's state during rapid switches.
let tickGeneration = 0;

const previousKind: Partial<Record<Direction, string>> = {};

// One consent for every use of location: sorting home by distance and the
// walking-time label. The key keeps its original name so anyone who already
// turned walking time on stays opted in.
const LOCATION_STORAGE_KEY = 'wtt_walking_enabled';

// Safe wrappers around localStorage. In Safari private browsing `localStorage`
// exists but `setItem` / `removeItem` throw; in other hardened browsers either
// op can fail. The feature works for the session even if persistence fails —
// the user just has to re-enable on next load.
function safeLocalRead(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* storage full / private mode / blocked — swallow, feature still works in-session */
  }
}

function safeLocalRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    /* same as above */
  }
}

let tapState = loadTapState(safeLocalRead, () => newDeviceId());

// QA / debugging: visiting `?reset=walking` clears the locationEnabled flag so
// the opt-in row reappears on next load. `?help=1` (the About page's "Help
// tune this spot" link) undoes a "Not now" so the ask card comes back. Both
// params are stripped from the URL after reading so a refresh doesn't repeat them.
try {
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.get('reset') === 'walking') {
    safeLocalRemove(LOCATION_STORAGE_KEY);
    url.searchParams.delete('reset');
    changed = true;
  }
  if (url.searchParams.get('help') === '1') {
    tapState = resetChoice(tapState);
    saveTapState(safeLocalWrite, tapState);
    url.searchParams.delete('help');
    changed = true;
  }
  if (changed) window.history.replaceState({}, '', url.toString());
} catch {
  /* no-op: URL / history API may be unavailable in exotic environments */
}

let locationEnabled = safeLocalRead(LOCATION_STORAGE_KEY) === '1';
const celebrateSetAt: Partial<Record<Direction, number>> = {};

// Starred viewpoints, oldest first. The first load after favourites became a
// list migrates the old single favourite (or seeds a returning user with East
// Avenue) and saves the result, even when empty, so it is only ever done once.
let favouriteIds: string[] = (() => {
  const loaded = loadFavourites(safeLocalRead);
  if (loaded.migrated) saveFavourites(safeLocalWrite, safeLocalRemove, loaded.ids);
  return loaded.ids;
})();

/** Correct the address bar without adding a history entry. */
function replaceAddress(path: string): void {
  try {
    if (window.location.pathname !== path) {
      window.history.replaceState({}, '', path + window.location.search + window.location.hash);
    }
  } catch {
    /* no-op: history API may be unavailable in exotic environments */
  }
}

// Where the app opens: the viewpoint the URL names; else, from the root URL,
// straight to the favourite when there is exactly one, and otherwise home.
// This rule is for opening the app only. Going to home from a countdown
// shows home whatever the favourites are.
const landing = landingFor(parseRoute(window.location.pathname), favouriteIds);
let screen: 'home' | 'countdown' | 'ticket' | 'how' =
  landing.screen === 'viewpoint' ? 'countdown' : landing.screen;
// The viewpoint the countdown screen shows. Kept while home is showing, so
// the countdown code never has to handle there being none.
let activeViewpoint: Viewpoint = landing.screen === 'viewpoint'
  ? landing.viewpoint
  : getViewpointById(DEFAULT_VIEWPOINT_ID)!;
replaceAddress(
  screen === 'countdown' ? viewpointPath(activeViewpoint)
  : screen === 'ticket' ? TICKET_PATH
  : screen === 'how' ? HOW_PATH
  : HOME_PATH,
);

// Home's arrivals, per viewpoint, and whether the latest home poll reached TfL.
let homeSnapshots: HomeSnapshots = {};
let lastHomePollFailed = false;
let homePollerStop: (() => void) | null = null;
let countdownPollerStop: (() => void) | null = null;

// Facts rotation — persist a monotonically-increasing index in localStorage so the
// user doesn't always see the same fact first on each app open. Advance once per
// successful TfL poll.
const HOME_TITLE = 'E17 Trains — Live Walthamstow train tracker';

const FACT_STORAGE_KEY = 'wtt_fact_index';
let factIndex = (() => {
  const raw = safeLocalRead(FACT_STORAGE_KEY);
  const parsed = raw === null ? 0 : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
})();

function advanceFact(): void {
  factIndex += 1;
  safeLocalWrite(FACT_STORAGE_KEY, String(factIndex));
}

/** Turn location on. Only ever called from a tap: "Use my location" on home
 *  or "Enable walking time" on a countdown. */
export function enableLocation(): void {
  locationEnabled = true;
  safeLocalWrite(LOCATION_STORAGE_KEY, '1');
  startLocation();
}

export function disableLocation(): void {
  locationEnabled = false;
  safeLocalRemove(LOCATION_STORAGE_KEY);
  stopLocation();
}

export function toggleFavouriteViewpoint(id: string): void {
  favouriteIds = toggleFavourite(favouriteIds, id);
  saveFavourites(safeLocalWrite, safeLocalRemove, favouriteIds);
  rerender();
}

/** Forget everything the countdown screen knew about the viewpoint it was
 *  showing, and make any poll still in flight discard its answer. */
function resetCountdownState(): void {
  // Clear snapshots AND lastFetchMs so the freshness state flips to 'no-data'
  // and the UI shows "Connecting to TfL…" — otherwise the previous viewpoint's
  // fresh poll satisfies classifyFreshness and we flash "No trains right now"
  // for up to a few hundred ms until the new tick resolves.
  snapshots = {};
  freightSnapshots = {};
  lastFetchMs = null;
  lastError = undefined;
  delete berthEtas.north;
  delete berthEtas.south;
  delete berthSteps.north;
  delete berthSteps.south;
  for (const dir of DIRECTIONS) {
    tapPasses[dir] = null;
    delete thanksUntilMs[dir];
    delete thanksPassKey[dir];
    delete tapOffline[dir];
  }
  // Invalidate any in-flight tick so it discards its results when it resolves.
  tickGeneration++;
}

/** Show a viewpoint's countdown. Always starts clean, including when it is
 *  the viewpoint that was showing before a visit to home. */
function showCountdown(viewpoint: Viewpoint): void {
  stopHomePoller();
  stopCountdownPollers();
  screen = 'countdown';
  activeViewpoint = viewpoint;
  resetCountdownState();
  // Home has usually just fetched this viewpoint's arrivals: start from those
  // so the numbers are there at once, and let the first poll refresh them.
  const fromHome = homeSnapshots[viewpoint.id];
  if (fromHome && Date.now() - fromHome.fetchedAtMs <= HOME_STALE_MS) {
    snapshots = fromHome.snapshots;
    lastFetchMs = fromHome.fetchedAtMs;
  }
  // Viewpoint name in the title so browser tabs are readable.
  document.title = `E17 Trains — ${activeViewpoint.lineName} · ${activeViewpoint.name}`;
  // The header + train livery take the line's colour.
  document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);
  rerender();
  // Each poller fetches at once, then on its interval. The freight one is a
  // no-op where the viewpoint has no freightStationCode (e.g. East Ave).
  startCountdownPollers();
}

function showHome(): void {
  stopCountdownPollers();
  screen = 'home';
  resetCountdownState();
  // Whether TfL can be reached is for the poll about to run to say.
  lastHomePollFailed = false;
  document.title = HOME_TITLE;
  document.documentElement.style.removeProperty('--line-color');
  rerender();
  startHomePoller();
}

/** Open a viewpoint from home: a new history entry, so back returns to home. */
function openViewpoint(id: string): void {
  const viewpoint = getViewpointById(id);
  if (!viewpoint) return;
  try {
    window.history.pushState({}, '', viewpointPath(viewpoint));
  } catch {
    /* no-op: the screen still changes */
  }
  showCountdown(viewpoint);
  window.scrollTo(0, 0);
}

function goHome(): void {
  try {
    window.history.pushState({}, '', HOME_PATH);
  } catch {
    /* no-op: the screen still changes */
  }
  showHome();
  window.scrollTo(0, 0);
}

const TICKET_TITLE = 'E17 Trains — Your ticket';
const HOW_TITLE = 'E17 Trains — How it works';

/** Show the ticket or the explainer. Neither polls, so both pollers stop;
 *  going back starts whichever the destination needs, from clean. */
function showInfoScreen(which: 'ticket' | 'how'): void {
  stopHomePoller();
  stopCountdownPollers();
  screen = which;
  resetCountdownState();
  document.title = which === 'ticket' ? TICKET_TITLE : HOW_TITLE;
  document.documentElement.style.removeProperty('--line-color');
  rerender();
}

/** Back from the ticket or the explainer: one step back in history when this
 *  app put it there (so the screen before returns as it was), else home. */
function backFromInfo(): void {
  const from = (window.history.state as { from?: string } | null)?.from;
  if (from) window.history.back();
  else goHome();
}

function openInfo(which: 'ticket' | 'how'): void {
  try {
    window.history.pushState({ from: window.location.pathname }, '', which === 'ticket' ? TICKET_PATH : HOW_PATH);
  } catch {
    /* no-op: the screen still changes */
  }
  showInfoScreen(which);
  window.scrollTo(0, 0);
}

// Tasks 7-10 call these from the screens' render options.
export function openTicket(): void { openInfo('ticket'); }
export function openHow(): void { openInfo('how'); }

// Back and forward: show whatever the address bar now names.
window.addEventListener('popstate', () => {
  const route = parseRoute(window.location.pathname);
  if (route.kind === 'viewpoint') showCountdown(route.viewpoint);
  else if (route.kind === 'ticket') showInfoScreen('ticket');
  else if (route.kind === 'how') showInfoScreen('how');
  else showHome();
});

function computeWalkingLabel(): string | null {
  if (!locationEnabled) return null;
  const { status, position } = getLocationState();
  if (status === 'unavailable') return null;                 // API missing — hide feature
  if (status === 'denied') return 'Location unavailable';    // user refused
  if (status === 'no-signal') return 'No GPS signal';        // granted but can't lock
  // If we have a position from a previous fix we can keep showing the estimate
  // even while the watch is paused (tab-hidden → visible, or between reacquires).
  // Only fall back to "Locating…" when we truly have nothing yet.
  if (position === null) return 'Locating…';
  const est = walkingEstimate(position, activeViewpoint.coords);
  return formatWalkingLabel(est);
}

/** Decrement snapshot[index]'s bridgeTimeSeconds by elapsed seconds since it was fetched.
 *  For the hero (index 0), a live berth ETA overrides the TfL-prediction timing. */
function liveEvent(snap: DirectionSnapshots, index: number, nowMs: number, berthEtaMs?: number): BridgeEvent | undefined {
  const ev = snap.events[index];
  if (!ev) return undefined;
  if (index === 0 && berthEtaMs !== undefined) {
    return { ...ev, bridgeTimeSeconds: (berthEtaMs - nowMs) / 1000 };
  }
  const elapsedSeconds = (nowMs - snap.snapshottedAtMs) / 1000;
  return { ...ev, bridgeTimeSeconds: ev.bridgeTimeSeconds - elapsedSeconds };
}

interface LiveCandidate {
  event: BridgeEvent;
  snapshot: DirectionSnapshots;
  indexInSnapshot: number;
  isFreight: boolean;
}

function buildViewModel(): ViewModel {
  const now = Date.now();

  const heroes: Partial<Record<Direction, BridgeEvent>> = {};
  const positions: Record<Direction, number | null> = { north: null, south: null };
  const tickers: Record<Direction, BridgeEvent[]> = { north: [], south: [] };

  for (const dir of DIRECTIONS) {
    const passengerSnap = snapshots[dir];
    const freightSnap = freightSnapshots[dir];
    if (!passengerSnap && !freightSnap) continue;

    // Build a unified live-event list across both sources, then sort by live
    // bridgeTimeSeconds. The hero (and the order of ticker entries) is decided
    // post-merge — a freight train sooner than the next passenger should
    // become the hero, and vice-versa.
    const candidates: LiveCandidate[] = [];
    if (passengerSnap) {
      for (let i = 0; i < passengerSnap.events.length; i++) {
        const live = liveEvent(passengerSnap, i, now);
        if (!live) continue;
        // TfL lags the train: once a berth step has timed it past the
        // viewpoint, don't let its late prediction return as a countdown.
        if (alreadyPassedPerBerth(now + live.bridgeTimeSeconds * 1000, berthEtas[dir], now)) continue;
        candidates.push({ event: live, snapshot: passengerSnap, indexInSnapshot: i, isFreight: false });
      }
    }
    if (freightSnap) {
      for (let i = 0; i < freightSnap.events.length; i++) {
        const live = liveEvent(freightSnap, i, now);
        if (live) candidates.push({ event: live, snapshot: freightSnap, indexInSnapshot: i, isFreight: true });
      }
    }
    candidates.sort((a, b) => a.event.bridgeTimeSeconds - b.event.bridgeTimeSeconds);

    const hero = candidates[0];
    if (hero) {
      // Berth ETA is a passenger-only signal (TD steps fire on Weaver-line
      // berths). Apply only when the eventual hero is a passenger event;
      // freight predictions stay on RTT-derived TfL-equivalent timing.
      const validEta = hero.isFreight ? undefined : liveBerthEta(berthEtas[dir], now);
      heroes[dir] = validEta !== undefined
        ? { ...hero.event, bridgeTimeSeconds: (validEta - now) / 1000 }
        : hero.event;

      // Position from the hero's source snapshot (uses its own snapshottedAtMs).
      // For freight beyond the modelled-position window, clamp to null so the
      // strip glyph hides while the countdown + ticker keep showing.
      const ev = hero.snapshot.events[hero.indexInSnapshot];
      const elapsedSeconds = (now - hero.snapshot.snapshottedAtMs) / 1000;
      const currentTts = ev.arrival.timeToStation - elapsedSeconds;
      const rawPos = estimatePosition(currentTts, ev.direction, activeViewpoint);
      positions[dir] = clampFreightPosition(rawPos, currentTts, hero.isFreight);
    }

    // Ticker = the next TICKER_SIZE-1 future-or-now candidates after the hero.
    for (let i = 1; i < candidates.length && tickers[dir].length < TICKER_SIZE - 1; i++) {
      if (candidates[i].event.bridgeTimeSeconds >= 0) tickers[dir].push(candidates[i].event);
    }
  }

  // Detect 'now'-state edges for bridge-jiggle celebration (hero only).
  for (const dir of DIRECTIONS) {
    const ev = heroes[dir];
    if (!ev) {
      delete previousKind[dir];
      continue;
    }
    const currentKind = formatCountdown(ev.bridgeTimeSeconds).kind;
    const prev = previousKind[dir];
    if (prev !== 'now' && currentKind === 'now') {
      celebrateSetAt[dir] = now;
    }
    previousKind[dir] = currentKind;
  }

  const celebrate: ViewModel['celebrate'] = { north: false, south: false };
  for (const dir of DIRECTIONS) {
    const setAt = celebrateSetAt[dir];
    if (setAt !== undefined && now - setAt < CELEBRATE_DURATION_MS) {
      celebrate[dir] = true;
    }
  }

  return {
    north: heroes.north,
    south: heroes.south,
    freshness: classifyFreshness(lastFetchMs, now),
    error: lastFetchMs === null ? lastError : undefined,
    northPos: positions.north,
    southPos: positions.south,
    celebrate,
    northTicker: tickers.north,
    southTicker: tickers.south,
    walkingLabel: computeWalkingLabel(),
    fact: factAt(factIndex),
    viewpoint: activeViewpoint,
    favouriteIds,
    tap: buildTapView(heroes, now),
  };
}

/** Advance each direction's pass against its hero and build the tap view. */
function buildTapView(heroes: Partial<Record<Direction, BridgeEvent>>, now: number): ViewModel['tap'] {
  const views = {} as Record<Direction, ViewModel['tap']['north']>;
  const canTune = canTuneViewpoint(activeViewpoint);
  for (const dir of DIRECTIONS) {
    const liveStep = liveBerthEta(berthEtas[dir], now) !== undefined ? berthSteps[dir] : undefined;
    tapPasses[dir] = updatePass(tapPasses[dir], {
      viewpoint: activeViewpoint,
      direction: dir,
      hero: heroes[dir],
      berthTrainId: liveStep?.trainId ?? null,
      nowMs: now,
    });
    views[dir] = tapDirectionView({
      pass: tapPasses[dir],
      tapState,
      thanksUntilMs: thanksUntilMs[dir],
      thanksPassKey: thanksPassKey[dir],
      nowMs: now,
      canTune,
      msUntilButton: msUntilButton(activeViewpoint, dir, heroes[dir]),
      offline: tapOffline[dir] === true,
    });
  }
  return {
    ask: tapAsk({ tapState, nowMs: now, offerable: canTune, views: [views.north, views.south] }),
    taps: tapState.taps,
    north: views.north,
    south: views.south,
  };
}

/** The yellow button: book the tap, show the thank-you, send it, and say so
 *  in the thank-you if the send failed. The count is recorded before the
 *  send, so a failed send still counts on the ticket. Only the live site
 *  sends; previews and local runs count the tap as sent.
 *  `pressedAtMs` is when the finger landed; the send time is taken below. */
async function onTap(dir: Direction, pressedAtMs: number): Promise<void> {
  const tapMs = pressedAtMs;
  const pass = tapPasses[dir];
  // The pass expired between the last redraw and the press: the redraw drops
  // the button, so there is nothing to book.
  if (!pass) {
    rerender();
    return;
  }
  const key = passKey(pass);
  const predictedAtTapMs = pass.latestPredictedMs;
  tapState = recordTap(tapState, key, tapMs, predictedAtTapMs);
  saveTapState(safeLocalWrite, tapState);
  thanksUntilMs[dir] = tapMs + THANKS_DURATION_MS;
  thanksPassKey[dir] = key;
  tapOffline[dir] = false;

  const berthLive = liveBerthEta(berthEtas[dir], tapMs) !== undefined;
  const position = locationEnabled ? getLocationState().position : null;
  const payload = buildTapPayload(pass, {
    tapMs,
    nowMs: Date.now(),
    predictedAtTapMs,
    source: berthLive ? 'berth' : 'tfl',
    berthStepMs: berthLive ? berthSteps[dir]?.stepMs ?? null : null,
    tflExpectedArrivalMs: tflExpectedArrivalMs(snapshots[dir]?.events, pass.vehicleId),
    atViewpoint: atViewpoint(position, activeViewpoint.coords),
    deviceId: tapState.deviceId,
  });
  rerender();
  const result = shouldSendTaps(location.hostname) ? await sendTap(payload) : 'sent';
  // A spot switch or a newer tap in this direction since: not this thank-you.
  if (thanksPassKey[dir] !== key) return;
  tapOffline[dir] = result === 'failed';
  rerender();
}

function onHelpChoice(choice: 'helping' | 'declined'): void {
  tapState = chooseHelp(tapState, choice, Date.now());
  saveTapState(safeLocalWrite, tapState);
  rerender();
}

function rerender(): void {
  if (screen === 'ticket') {
    // Painted again only when something it shows has changed, since the
    // one-second loop calls rerender.
    const names = tapState.spotsTimed
      .map((id) => getViewpointById(id)?.name)
      .filter((n): n is string => !!n);
    const key = `ticket|${tapState.taps}|${tapState.choice}|${names.join(',')}`;
    if (root.dataset.info !== key) {
      root.dataset.info = key;
      renderTicketPage(
        root,
        { taps: tapState.taps, choice: tapState.choice, spotNames: names },
        {
          onBack: backFromInfo,
          onToggleButton: (on) => onHelpChoice(on ? 'helping' : 'declined'),
          onOpenHow: openHow,
        },
      );
    }
    return;
  }
  if (screen === 'how') {
    // Painted once per visit: the page inside it is the screen's own state.
    if (root.dataset.info !== 'how') {
      root.dataset.info = 'how';
      renderHowItWorks(root, {
        onCountMeIn: () => { onHelpChoice('helping'); backFromInfo(); },
        onNotNow: () => { onHelpChoice('declined'); backFromInfo(); },
        onBack: backFromInfo,
      }, { choice: tapState.choice });
    }
    return;
  }
  delete root.dataset.info;
  if (screen === 'home') {
    renderHome(
      root,
      buildHomeModel({
        viewpoints: VIEWPOINTS,
        favouriteIds,
        locationEnabled,
        geo: getLocationState(),
        snapshots: homeSnapshots,
        lastPollFailed: lastHomePollFailed,
        nowMs: Date.now(),
      }),
      {
        onOpen: openViewpoint,
        onToggleFavourite: toggleFavouriteViewpoint,
        onUseLocation: enableLocation,
        onLocationOff: disableLocation,
        taps: tapState.taps,
        onOpenTicket: openTicket,
      },
    );
    return;
  }
  render(root, buildViewModel(), {
    onEnableWalkingTime: enableLocation,
    onDisableWalkingTime: disableLocation,
    onAdvanceFact: () => {
      // Tap on the fact line — advance + repaint immediately so the tap feels
      // instant (not "next time the 1 s loop fires"). Persisted index survives
      // across sessions so the next fact doesn't keep resetting.
      advanceFact();
      rerender();
    },
    onHome: goHome,
    onToggleFavourite: toggleFavouriteViewpoint,
    onTap: (dir, pressedAtMs) => { void onTap(dir, pressedAtMs); },
    onHelpChoice,
    onOpenTicket: openTicket,
    onOpenHow: openHow,
  });
}

async function freightTick(): Promise<void> {
  if (screen !== 'countdown') return;
  const stationCode = activeViewpoint.freightStationCode;
  if (!stationCode) return; // viewpoint without freight (e.g. East Ave) — no-op
  const gen = tickGeneration;
  try {
    const arrivals = await fetchFreight(stationCode, activeViewpoint);
    const picked = pickNextNPerDirection(arrivals, TICKER_SIZE, activeViewpoint);
    const now = Date.now();
    if (gen !== tickGeneration) return;
    freightSnapshots = {
      north: picked.north.length > 0 ? { events: picked.north, snapshottedAtMs: now } : undefined,
      south: picked.south.length > 0 ? { events: picked.south, snapshottedAtMs: now } : undefined,
    };
  } catch {
    // Freight failure is silent: passenger trains are still working and the
    // hero countdown stays on TfL data. Surfacing this in `lastError` would
    // dim the passenger UI for a freight-side problem (rotated RTT token,
    // RTT outage), which would be misleading.
  }
}

function startFreightPoller(): void {
  if (freightPollerStop !== null) return;
  if (!activeViewpoint.freightStationCode) return;
  freightPollerStop = startPoller(freightTick, FREIGHT_POLL_INTERVAL_MS);
}

// The quick retry after a failed first fetch. One at a time, and dropped
// when the countdown it was for is left.
const tickRetry = createRetry(() => { void tick(); }, 3000);
let berthUnsubscribe: (() => void) | null = null;

/** Everything the countdown screen listens to: TfL, freight where the
 *  viewpoint has it, and live signalling steps. */
function startCountdownPollers(): void {
  if (countdownPollerStop === null) countdownPollerStop = startPoller(tick, POLL_INTERVAL_MS);
  startFreightPoller();
  if (berthUnsubscribe === null) berthUnsubscribe = subscribeBerthEvents(onBerthEvent);
}

function stopCountdownPollers(): void {
  if (countdownPollerStop !== null) {
    countdownPollerStop();
    countdownPollerStop = null;
  }
  tickRetry.cancel();
  stopFreightPoller();
  // Home shows TfL times only, so it holds no signalling connection.
  if (berthUnsubscribe !== null) {
    berthUnsubscribe();
    berthUnsubscribe = null;
  }
}

/** One home poll: each TfL stop behind the rows on screen, asked once. */
let homeTickSeq = 0;
async function homeTick(): Promise<void> {
  const seq = ++homeTickSeq;
  const position = locationEnabled ? getLocationState().position : null;
  const result = await pollHome(
    homeRowOrder(VIEWPOINTS, favouriteIds, position),
    homeSnapshots,
    fetchStopArrivals,
    Date.now,
  );
  // A slow older poll must not overwrite a newer one's answer.
  if (seq !== homeTickSeq) return;
  homeSnapshots = result.snapshots;
  lastHomePollFailed = result.polled > 0 && result.failed === result.polled;
  rerender();
}

function startHomePoller(): void {
  if (homePollerStop === null) homePollerStop = startPoller(homeTick, HOME_POLL_INTERVAL_MS);
}

function stopHomePoller(): void {
  if (homePollerStop !== null) {
    homePollerStop();
    homePollerStop = null;
  }
}

function stopFreightPoller(): void {
  if (freightPollerStop !== null) {
    freightPollerStop();
    freightPollerStop = null;
  }
}

async function tick(): Promise<void> {
  // A retry timer can fire after the user has gone to home.
  if (screen !== 'countdown') return;
  const gen = tickGeneration;
  try {
    const fetched = await fetchArrivals(activeViewpoint.stopPointId, activeViewpoint.lineId);
    const now = Date.now();
    // Bail if the viewpoint switched while the fetch was in flight — these
    // arrivals belong to the old viewpoint and must not overwrite current state.
    if (gen !== tickGeneration) return;
    snapshots = snapshotViewpoint(snapshots, fetched, activeViewpoint, now, TICKER_SIZE);
    lastFetchMs = now;
    lastError = undefined;
    advanceFact();
  } catch (err) {
    // Discard errors from stale in-flight ticks.
    if (gen !== tickGeneration) return;
    lastError = err instanceof Error ? err.message : 'Network error — check connection';
    // If we have no data yet (e.g. right after a viewpoint switch cleared
    // lastFetchMs), retry in 3 s rather than leaving the user stuck on the
    // error screen for the full 20 s poll interval.
    if (lastFetchMs === null) tickRetry.schedule();
  }
  rerender();
}

if (locationEnabled) startLocation();

// Re-render whenever the geolocation state changes so the walking label
// reflects locating → granted → position transitions.
subscribeLocation(() => rerender());

// Visibility-aware rerender loop — pause when hidden so we don't run the 1s
// tick in background (browser throttles it anyway, but this makes intent
// explicit and frees a timer slot). Also pauses location watching.
let renderIntervalId: ReturnType<typeof setInterval> | null = null;
function startRenderLoop(): void {
  if (renderIntervalId !== null) return;
  rerender();
  renderIntervalId = setInterval(rerender, 1000);
}
function stopRenderLoop(): void {
  if (renderIntervalId !== null) {
    clearInterval(renderIntervalId);
    renderIntervalId = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    startRenderLoop();
    if (locationEnabled) startLocation();
  } else {
    stopRenderLoop();
    if (locationEnabled) stopLocation();
  }
});

// Sync CSS + title to the booted viewpoint. These normally update on switch,
// but first-paint needs them too.
if (screen === 'countdown') {
  document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);
  document.title = `E17 Trains — ${activeViewpoint.lineName} · ${activeViewpoint.name}`;
} else if (screen === 'ticket') {
  document.title = TICKET_TITLE;
} else if (screen === 'how') {
  document.title = HOW_TITLE;
}

// ── TD berth integration ──────────────────────────────────────────────────────
// When a live berth event arrives from the proxy, check if it matches the
// active viewpoint's berthSteps for either direction. If so, compute a
// precise ETA for when the train will reach the viewpoint and store it.
// The 1s render loop picks this up via liveEvent() and uses it instead of
// the TfL-prediction-based countdown.
function onBerthEvent(event: BerthEvent): void {
  // Home shows TfL times only; a countdown starts clean when it is opened.
  if (screen !== 'countdown') return;
  for (const dir of DIRECTIONS) {
    const eta = berthEtaFromStep(event, activeViewpoint.directions[dir].berthSteps);
    if (eta === null) continue;
    berthEtas[dir] = eta;
    berthSteps[dir] = { stepMs: event.timestamp, trainId: event.trainId };

    console.log(
      `[td] ${dir} berth hit: train ${event.trainId} @ ${event.station}` +
      ` → viewpoint ETA in ${((berthEtas[dir]! - Date.now()) / 1000).toFixed(0)}s`
    );
  }
}


startRenderLoop();
if (screen === 'countdown') startCountdownPollers();
else if (screen === 'home') startHomePoller();
