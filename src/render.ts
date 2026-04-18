import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
import type { Theme } from './season';
import { formatCountdown, formatAge } from './display';
import { renderDirectionStrip } from './strip';

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
  theme: Theme;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  // Preserve static header and strips across renders so the header stays put
  // and the strips keep their CSS transitions alive between state updates.
  // Everything else (rows, footer, error, empty) is rebuilt each tick.
  const existingHeader = root.querySelector<HTMLElement>('.page-header');
  const existingStripN = root.querySelector<HTMLElement>('.strip-north');
  const existingStripS = root.querySelector<HTMLElement>('.strip-south');
  const preserved = new Set<Element>();
  if (existingHeader) preserved.add(existingHeader);
  if (existingStripN) preserved.add(existingStripN);
  if (existingStripS) preserved.add(existingStripS);

  Array.from(root.children).forEach((child) => {
    if (!preserved.has(child)) root.removeChild(child);
  });

  // Always re-append the header first so it sits at the top of the flex column.
  if (existingHeader) root.appendChild(existingHeader);

  if (vm.freshness.state === 'no-data' && vm.error) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = vm.error;
    root.appendChild(err);
    return;
  }

  if (!vm.north && !vm.south) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `
      <p>No trains right now.</p>
      <a href="https://tfl.gov.uk/tube-dlr-overground/status/" target="_blank" rel="noopener">Check TfL status</a>
    `;
    root.appendChild(empty);
  } else {
    // Northbound: row, strip, ticker
    root.appendChild(renderDirection('→ Chingford', vm.north));
    const stripN = renderDirectionStrip(existingStripN, {
      direction: 'north',
      pos: vm.northPos,
      celebrate: vm.celebrate.north,
    });
    root.appendChild(stripN);
    const tickerN = renderTicker(vm.northTicker);
    if (tickerN) root.appendChild(tickerN);

    // Southbound: row, strip, ticker
    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
    const stripS = renderDirectionStrip(existingStripS, {
      direction: 'south',
      pos: vm.southPos,
      celebrate: vm.celebrate.south,
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

// Remember each direction's last-rendered value text so we can animate ONLY on change.
// Keyed by direction label so both north and south rows track independently.
const previousValueText: Record<string, string> = {};

function renderDirection(label: string, event: BridgeEvent | undefined): HTMLElement {
  const row = document.createElement('section');
  row.className = 'row';

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
  }
  valueEl.textContent = currentText;

  if (previousValueText[label] !== currentText) {
    valueEl.classList.add('ticking');
  }
  previousValueText[label] = currentText;

  row.appendChild(valueEl);
  return row;
}
