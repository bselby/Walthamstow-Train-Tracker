import { VIEWPOINTS, type Viewpoint } from './viewpoints';

export interface SwitcherModel {
  activeViewpoint: Viewpoint;
  favouriteViewpointId: string;
  onSwitch: (id: string) => void;
  onSetFavourite: (id: string) => void;
}

// Module-level state for the open/closed toggle, keyed by element. Using a
// WeakMap keeps memory tidy if multiple switchers are ever mounted, and avoids
// the DOM being the source of truth for open state (the class IS, but the
// listener wiring has to know too).
const openState = new WeakMap<HTMLElement, boolean>();

export function renderSwitcher(
  existing: HTMLElement | null,
  model: SwitcherModel,
): HTMLElement {
  const el = existing ?? buildSkeleton();
  updateDynamic(el, model);
  return el;
}

function buildSkeleton(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'switcher';
  // Use grid-rows animation for the sheet height (0fr → 1fr) so no layout jank.
  root.innerHTML = `
    <button type="button" class="switcher-header" aria-expanded="false" aria-controls="switcher-sheet">
      <span class="switcher-header-label"></span>
      <span class="switcher-header-chevron" aria-hidden="true">▾</span>
    </button>
    <div id="switcher-sheet" class="switcher-sheet" role="listbox" aria-label="Choose a viewpoint">
      <div class="switcher-sheet-inner"></div>
    </div>
  `;

  const header = root.querySelector<HTMLButtonElement>('.switcher-header')!;
  header.addEventListener('click', () => toggleOpen(root));

  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && openState.get(root)) {
      closeSheet(root);
      header.focus();
    }
  });

  // Clicking outside the switcher closes the sheet. Use capture phase so our
  // handler runs before any other stopped-propagation handlers.
  document.addEventListener(
    'click',
    (e) => {
      if (!openState.get(root)) return;
      if (!root.contains(e.target as Node)) closeSheet(root);
    },
    true,
  );

  openState.set(root, false);
  return root;
}

function toggleOpen(root: HTMLElement): void {
  if (openState.get(root)) closeSheet(root);
  else openSheet(root);
}

function openSheet(root: HTMLElement): void {
  openState.set(root, true);
  root.querySelector('.switcher-header')!.setAttribute('aria-expanded', 'true');
  root.querySelector('.switcher-sheet')!.classList.add('open');
}

function closeSheet(root: HTMLElement): void {
  openState.set(root, false);
  root.querySelector('.switcher-header')!.setAttribute('aria-expanded', 'false');
  root.querySelector('.switcher-sheet')!.classList.remove('open');
}

function updateDynamic(root: HTMLElement, model: SwitcherModel): void {
  const { activeViewpoint, favouriteViewpointId, onSwitch, onSetFavourite } = model;

  // Header label: "Weaver · East Ave bridge"
  const label = root.querySelector<HTMLElement>('.switcher-header-label')!;
  label.textContent = `${activeViewpoint.lineName} · ${activeViewpoint.name}`;

  // Rebuild the sheet inner content each render — cheap and keeps favourite/
  // active highlights in sync.
  const inner = root.querySelector<HTMLElement>('.switcher-sheet-inner')!;
  inner.innerHTML = '';
  for (const vp of VIEWPOINTS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'switcher-row';
    row.setAttribute('role', 'option');
    row.setAttribute('data-id', vp.id);
    row.setAttribute('aria-selected', vp.id === activeViewpoint.id ? 'true' : 'false');

    const rowInner = document.createElement('span');
    rowInner.className = 'switcher-row-content';
    rowInner.innerHTML = `
      <span class="switcher-row-dot${vp.id === activeViewpoint.id ? ' active' : ''}"></span>
      <span class="switcher-row-text">
        <span class="switcher-row-name">${escapeHtml(vp.name)}</span>
        <span class="switcher-row-line" style="color: ${vp.lineColor};">${escapeHtml(vp.lineName)} line</span>
      </span>
    `;
    row.appendChild(rowInner);

    // Row click → switch viewpoint. Don't bubble to the document click handler.
    // Also collapse the sheet so the user isn't left with an open panel over
    // the new viewpoint's strips — selecting a row is a terminal action.
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      // Don't fire switch when the click was actually on the star button.
      if ((e.target as HTMLElement).closest('.switcher-star')) return;
      closeSheet(root);
      onSwitch(vp.id);
    });

    // Star button (separate hit target).
    const star = document.createElement('button');
    star.type = 'button';
    star.className = `switcher-star${vp.id === favouriteViewpointId ? ' filled' : ''}`;
    star.setAttribute('aria-label', `Favourite: ${vp.name}`);
    star.setAttribute('aria-pressed', vp.id === favouriteViewpointId ? 'true' : 'false');
    star.innerHTML = vp.id === favouriteViewpointId
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      onSetFavourite(vp.id);
    });
    row.appendChild(star);

    inner.appendChild(row);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
