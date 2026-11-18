import type { Theme } from './season';

// Picture-book train drawings. The passenger train takes its door and stripe
// colour from CSS `color` (currentColor), so one drawing serves both lines.
// Outfits are overlays drawn on top; freight never gets one.
const N = '#1F2A44';

const flake = (x: number, y: number): string => `<g transform="translate(${x} ${y})" stroke="#7FB6CC" stroke-width="1.6" stroke-linecap="round"><path d="M-4 0 H4 M-2 -3.5 L2 3.5 M2 -3.5 L-2 3.5"/></g>`;
const flower = (x: number, c: string): string => `<path d="M${x} 12 V2" stroke="${N}" stroke-width="1.5"/><g fill="${c}" stroke="${N}" stroke-width="1"><circle cx="${x}" cy="-3" r="2.6"/><circle cx="${x - 3}" cy="0" r="2.6"/><circle cx="${x + 3}" cy="0" r="2.6"/><circle cx="${x - 2}" cy="3" r="2.6"/><circle cx="${x + 2}" cy="3" r="2.6"/></g><circle cx="${x}" cy="0.5" r="1.8" fill="#FFC93C"/>`;
const leaf = (x: number, y: number, r: number, c: string): string => `<path transform="translate(${x} ${y}) rotate(${r})" d="M0 0 Q6 -6 12 0 Q6 6 0 0 Z M0 0 H12" fill="${c}" stroke="${N}" stroke-width="1"/>`;
const burst = (cx: number, cy: number, r: number, c: string): string => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * r * 0.35, y1 = cy + Math.sin(a) * r * 0.35;
    const x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
    d += `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} `;
  }
  return `<path d="${d}" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="1.8" fill="${c}"/>`;
};
const confetti = (x: number, y: number, r: number, c: string): string => `<rect x="${x}" y="${y}" width="5" height="2.6" rx="1" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`;

const OUTFITS: Record<Exclude<Theme, null>, string> = {
  'winter-ski': `<path d="M66 12 Q66 -6 79 -6 Q92 -6 92 12 Z" fill="#2F7D8C" stroke="${N}" stroke-width="1.8"/><rect x="63" y="7" width="32" height="6" rx="3" fill="#FFFFFF" stroke="${N}" stroke-width="1.5"/><circle cx="79" cy="-9" r="4.5" fill="#FFFFFF" stroke="${N}" stroke-width="1.5"/>${flake(14, -14)}${flake(40, -20)}${flake(110, -18)}${flake(124, 4)}`,
  'world-book-day': `<path d="M60 11 Q67 6 75 9 V-3 Q67 -6 60 -1 Z" fill="#FFF4CF" stroke="${N}" stroke-width="1.6" stroke-linejoin="round"/><path d="M90 11 Q83 6 75 9 V-3 Q83 -6 90 -1 Z" fill="#FFF4CF" stroke="${N}" stroke-width="1.6" stroke-linejoin="round"/><path d="M63 2 Q67 0 72 1 M63 5 Q67 3 72 4 M78 1 Q83 0 87 2 M78 4 Q83 3 87 5" stroke="#46536E" stroke-width="1" fill="none"/>`,
  'easter': `<ellipse cx="70" cy="-4" rx="4.5" ry="13" transform="rotate(-12 70 -4)" fill="#FFFFFF" stroke="${N}" stroke-width="1.8"/><ellipse cx="70" cy="-3" rx="2" ry="8" transform="rotate(-12 70 -3)" fill="#F4B6C9"/><ellipse cx="82" cy="-4" rx="4.5" ry="13" transform="rotate(12 82 -4)" fill="#FFFFFF" stroke="${N}" stroke-width="1.8"/><ellipse cx="82" cy="-3" rx="2" ry="8" transform="rotate(12 82 -3)" fill="#F4B6C9"/><ellipse cx="18" cy="4" rx="6" ry="8" fill="#FFC93C" stroke="${N}" stroke-width="1.6"/><path d="M12.5 4 L15 1.5 L18 4 L21 1.5 L23.5 4" fill="none" stroke="#E4572E" stroke-width="1.4"/>`,
  'spring': `${flower(18, '#F4B6C9')}${flower(62, '#FFFFFF')}${flower(80, '#B9A6E3')}`,
  'summer': `<path d="M96 22 H113" stroke="#FFC93C" stroke-width="1.6"/><ellipse cx="100" cy="23.5" rx="4" ry="3" fill="${N}" stroke="#FFC93C" stroke-width="1.6"/><ellipse cx="109" cy="23.5" rx="3.6" ry="3" fill="${N}" stroke="#FFC93C" stroke-width="1.6"/><circle cx="112" cy="-12" r="7" fill="#FFC93C" stroke="${N}" stroke-width="1.5"/><path d="M112 -23 V-20.5 M112 -3.5 V-1 M101 -12 H103.5 M120.5 -12 H123 M104.2 -19.8 L106 -18 M118 -6 L119.8 -4.2 M104.2 -4.2 L106 -6 M118 -18 L119.8 -19.8" stroke="${N}" stroke-width="1.6" stroke-linecap="round"/>`,
  'autumn': `${leaf(10, -12, -20, '#E4572E')}${leaf(48, -20, 25, '#D98C1F')}${leaf(84, -8, -35, '#8A5A2B')}${leaf(112, -18, 15, '#E4572E')}`,
  'halloween': `<ellipse cx="74" cy="4" rx="10" ry="8" fill="#F08A24" stroke="${N}" stroke-width="1.6"/><path d="M74 -3.5 V12 M68 -1 Q66 4 68 11 M80 -1 Q82 4 80 11" stroke="${N}" stroke-width="1" fill="none"/><path d="M74 -4 Q75 -8 78 -9" stroke="#1E7B4B" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M14 -16 Q18 -22 22 -17 Q24 -21 26 -17 Q30 -22 34 -16 Q30 -15 28 -12 Q26 -14 24 -12 Q22 -14 20 -12 Q18 -15 14 -16 Z" fill="${N}"/>`,
  'bonfire': `${burst(24, -12, 11, '#E4572E')}${burst(64, -18, 9, '#FFC93C')}${burst(104, -10, 12, '#2F7D8C')}`,
  'christmas': `<path d="M66 12 Q72 -12 96 -8 Q86 -2 90 12 Z" fill="#D63A3A" stroke="${N}" stroke-width="1.8" stroke-linejoin="round"/><rect x="63" y="7" width="30" height="6" rx="3" fill="#FFFFFF" stroke="${N}" stroke-width="1.5"/><circle cx="97" cy="-8" r="4" fill="#FFFFFF" stroke="${N}" stroke-width="1.5"/><path d="M6 12 Q14 7 22 12 Q30 7 38 12 M56 12 Q60 9 63 11" stroke="${N}" stroke-width="1" fill="none"/><circle cx="10" cy="10" r="2.2" fill="#FFC93C"/><circle cx="18" cy="10" r="2.2" fill="#E4572E"/><circle cx="26" cy="10" r="2.2" fill="#1E7B4B"/><circle cx="34" cy="10" r="2.2" fill="#2F7D8C"/>`,
  'new-year': `<path d="M70 12 L79 -14 L88 12 Z" fill="#FFC93C" stroke="${N}" stroke-width="1.8" stroke-linejoin="round"/><path d="M73 4 L85 6 M75.5 -3 L83 -1.5" stroke="#E4572E" stroke-width="2"/><circle cx="79" cy="-15" r="3" fill="#E4572E" stroke="${N}" stroke-width="1.2"/>${confetti(14, -14, 20, '#E4572E')}${confetti(32, -6, -30, '#2F7D8C')}${confetti(50, -20, 45, '#FFC93C')}${confetti(104, -16, -15, '#B9A6E3')}${confetti(118, -2, 30, '#1E7B4B')}`,
};

export function outfitOverlay(theme: Theme): string {
  return theme === null ? '' : OUTFITS[theme];
}

const PASSENGER_BODY = `<path d="M4 12 H90 Q106 12 113 27 L116 36 Q116 41 111 41 H4 Z" fill="#FFFFFF" stroke="${N}" stroke-width="2.5" stroke-linejoin="round"/><path d="M93 16 Q104 17 109 28 H95 Z" fill="${N}"/><rect x="10" y="17" width="78" height="10" rx="3" fill="${N}"/><rect x="26" y="15" width="10" height="23" rx="1.5" fill="currentColor" stroke="${N}" stroke-width="1.5"/><rect x="62" y="15" width="10" height="23" rx="1.5" fill="currentColor" stroke="${N}" stroke-width="1.5"/><rect x="4" y="33" width="112" height="4" fill="currentColor"/><circle cx="111" cy="33" r="2.6" fill="#FFC93C"/><path d="M40 12 L47 5 L54 12 M43 5 H51" fill="none" stroke="${N}" stroke-width="2" stroke-linecap="round"/><rect x="10" y="40" width="26" height="5" rx="2" fill="${N}"/><rect x="74" y="40" width="26" height="5" rx="2" fill="${N}"/>`;

export function passengerTrainSvg(theme: Theme): string {
  return `<svg class="train-svg train-passenger" viewBox="-6 -30 136 90" aria-hidden="true">${PASSENGER_BODY}${outfitOverlay(theme)}</svg>`;
}

const FREIGHT_BODY = `<path d="M92 14 H138 L146 23 V41 H92 Z" fill="#8A5A2B" stroke="#1F2A44" stroke-width="2.5" stroke-linejoin="round"/><path d="M134 17 H139 L144 23 H134 Z" fill="#1F2A44"/><rect x="99" y="19" width="26" height="7" rx="1.5" fill="#1F2A44"/><rect x="104" y="8" width="7" height="6" fill="#1F2A44"/><rect x="92" y="34" width="54" height="3" fill="#FFC93C"/><circle cx="143" cy="31" r="2.4" fill="#FFF4CF"/><rect x="6" y="36" width="82" height="5" fill="#1F2A44"/><rect x="10" y="16" width="74" height="20" rx="1" fill="#2F7D8C" stroke="#1F2A44" stroke-width="2.5"/><path d="M24 19 V33 M38 19 V33 M52 19 V33 M66 19 V33" stroke="#1F2A44" stroke-width="1.5"/><rect x="86" y="36" width="8" height="3" fill="#1F2A44"/><rect x="96" y="41" width="20" height="5" rx="2" fill="#1F2A44"/><rect x="122" y="41" width="20" height="5" rx="2" fill="#1F2A44"/><rect x="12" y="41" width="18" height="5" rx="2" fill="#1F2A44"/><rect x="64" y="41" width="18" height="5" rx="2" fill="#1F2A44"/></svg>`;

export function freightTrainSvg(): string {
  return `<svg class="train-svg train-freight" viewBox="0 0 150 50" aria-hidden="true">${FREIGHT_BODY}</svg>`;
}
