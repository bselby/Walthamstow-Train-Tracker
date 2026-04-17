import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
import { formatCountdown, formatAge } from './display';

export interface ViewModel {
  north?: BridgeEvent;
  south?: BridgeEvent;
  freshness: FreshnessState;
  error?: string;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  root.innerHTML = '';

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
    root.appendChild(renderDirection('→ Chingford', vm.north));
    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
  }

  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  root.appendChild(footer);
}

function renderDirection(label: string, event: BridgeEvent | undefined): HTMLElement {
  const row = document.createElement('section');
  row.className = 'row';

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('div');
  valueEl.className = 'value';

  if (!event) {
    valueEl.classList.add('sleeping');
    valueEl.textContent = '— no trains for a while 💤';
  } else {
    const countdown = formatCountdown(event.bridgeTimeSeconds);
    valueEl.classList.add(countdown.kind);
    valueEl.textContent = countdown.text;
  }

  row.appendChild(valueEl);
  return row;
}
