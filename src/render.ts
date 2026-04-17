import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
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
    // Interleave: row-north, strip-north, row-south, strip-south
    root.appendChild(renderDirection('→ Chingford', vm.north));
    const stripN = renderDirectionStrip(existingStripN, {
      direction: 'north',
      pos: vm.northPos,
      celebrate: vm.celebrate.north,
    });
    root.appendChild(stripN); // appendChild moves the node if it was already in the tree

    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
    const stripS = renderDirectionStrip(existingStripS, {
      direction: 'south',
      pos: vm.southPos,
      celebrate: vm.celebrate.south,
    });
    root.appendChild(stripS);
  }

  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  root.appendChild(footer);
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
