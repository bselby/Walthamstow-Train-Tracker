// Class 66-style freight locomotive + a single container wagon behind. Flat-top,
// blocky — reads as "freight" at a glance, especially next to the rounded-nose
// Aventra passenger SVG. Colour comes from CSS so the loco can be tinted
// independently of the passenger livery.
export const FREIGHT_TRAIN_SVG = `
<svg class="strip-freight-svg" viewBox="0 0 62 22" aria-hidden="true">
  <path class="freight-body" d="M2 6 L18 6 L22 8.5 L22 17 L2 17 Z"/>
  <rect class="freight-roof" x="2" y="5" width="16" height="2"/>
  <rect class="freight-exhaust" x="6" y="3" width="3" height="3"/>
  <rect class="freight-window" x="4" y="8" width="3.5" height="3"/>
  <rect class="freight-window" x="9" y="8" width="3.5" height="3"/>
  <rect class="freight-grille" x="14" y="9.5" width="6" height="4"/>
  <rect class="freight-bogie" x="4" y="17" width="6" height="3" rx="0.4"/>
  <rect class="freight-bogie" x="14" y="17" width="6" height="3" rx="0.4"/>
  <rect class="freight-coupling" x="22" y="12" width="2" height="2"/>
  <rect class="freight-wagon-base" x="24" y="13" width="36" height="4"/>
  <rect class="freight-container" x="26" y="6" width="32" height="7"/>
  <rect class="freight-container-line" x="26" y="8.5" width="32" height="0.5"/>
  <rect class="freight-bogie" x="28" y="17" width="6" height="3" rx="0.4"/>
  <rect class="freight-bogie" x="50" y="17" width="6" height="3" rx="0.4"/>
</svg>
`;
