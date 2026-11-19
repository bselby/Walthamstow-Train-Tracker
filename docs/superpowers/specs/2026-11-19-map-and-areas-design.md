# Map of spots, and areas on the home list: design

Date: 2026-11-19
Status: draft for Ben to approve. Nothing is built.

## 1. Intent

E17 Trains will soon have spots outside Walthamstow (for example Camden,
Hampstead). Two things are needed so a parent can still find a spot quickly:

1. **A real map** (streets, not a schematic) showing every spot, so a parent
   can see where spots are and pick one.
2. **Areas on the home list**, so the list stays easy to scan once spots
   sit in several areas.

As before, everything is for the parent. The child stays screen-free.

## 2. Goals

- A `/map` page that shows every live spot as a pin on a street map. Tapping
  a pin opens that spot.
- On home, spots outside the parent's walking range are grouped under area
  headings once more than one area exists.
- The map goes live now, with today's three spots. Apart from the new map
  links, the home screen looks exactly as it does today while every spot is in
  Walthamstow.

## 3. Non-goals

- Live countdowns on the map.
- Pin clustering, search, filters or area pages. There are too few spots
  for any of these yet.
- Directions or route planning. The spot page's "Verify on map" link stays
  for that.
- Using the map offline.
- New spots. The areas in this document are examples. Only spots Ben has
  visited and judged safe go live, with coordinates taken on site.

## 4. Anti-goals (a failure even if it works)

- Anything that slows home or a spot's countdown. The map code loads only on
  `/map`.
- The map asking for location on its own, or showing a location the parent
  hasn't turned on.
- Technical or privacy detail on screen. The one exception is the map credit
  the tile licence requires, kept to the compact "i" control.
- Breaking the 44 px tap targets, light and dark mode, or the 320 px width.

## 5. Constraints

- Plain TypeScript and CSS with Vite, as today. No framework.
- British English, "spot" not "viewpoint", no exclamation marks.
- Any new third party is added to `public/privacy.html`.
- URLs `/<place>/<slug>` and `localStorage` keys don't change.
- A separate session is adding a feedback form to the home and spot page
  footers (`doc-links`). This work adds a "Map" link to those same footers,
  so whichever lands second rebases onto the other. A note is left in the
  shared session notes.

## 6. Approaches considered

### Map

| | How | Trade-off |
|---|---|---|
| A | Leaflet with OpenStreetMap's own tiles | Smallest code (~40 KB). Volunteer-run servers whose policy limits heavy use and can block apps. Third party: the OpenStreetMap Foundation. |
| **B (Ben's pick)** | **MapLibre GL JS with OpenFreeMap vector tiles** | Free, no key, no sign-up, no published limits; paid for by donations, with no guarantee. Can be recoloured for light and dark. About 1.1 MB of extra code (about 300 kB gzipped), plus a 0.5 MB worker (about 150 kB gzipped), loaded only on `/map` and not precached. Third parties: OpenFreeMap, and Cloudflare, which it may use to deliver the map. |
| C | MapLibre with a self-hosted Protomaps London extract | No new third party, but adds a large file, self-hosted fonts, manual refreshes, and relies on Netlify range requests. |

### Home grouping

1. **"Near you", then other areas (Ben's pick).** With location on, spots
   within walking range are listed flat, nearest first. Every other spot is
   grouped by area, areas nearest first.
2. Always grouped by area, nearest area first. Rejected: when the parent is
   in Walthamstow, the heading tells them nothing new.

## 7. Areas (data)

- `place` is the area key. A new `AREAS` record in `src/viewpoints.ts` maps
  each place to its display name, for example
  `walthamstow: { name: 'Walthamstow' }`.
- `defineViewpoint` throws if a spot's `place` has no entry in `AREAS`, the
  same way it already checks `anchorStop`.

## 8. Home list

Favourites stay first, ungrouped, in starred order, as now.

**One area only.** While every spot in `VIEWPOINTS` shares one `place`, home
behaves exactly as today: "Near you" (nearest first) or "All spots" (by
name).

**More than one area, location on:**
- **"Near you"**: spots that aren't favourites and are within a 30-minute
  walk (`walkingEstimate(...).seconds <= 1800`), nearest first. The 30
  minutes is the author's call. The section is left out when it's empty.
- Then one section per area, headed with the area's display name, for every
  remaining spot. Areas are ordered by their nearest spot, and spots within
  an area are nearest first.

**More than one area, location off, denied or not yet fixed:** one section
per area for every spot that isn't a favourite. Areas are in alphabetical
order of display name, and spots within an area by name.

An area whose spots are all in favourites or "Near you" gets no heading.

**Where the location control goes:** it stays where it is today, directly
after favourites and before the first non-favourite section.

**Live times:** home still asks TfL about at most 8 stops (`HOME_MAX_STOPS`),
taken in row order, so favourites and the nearest spots come first. A row
whose stop is beyond the cap shows its name and line with no countdown.
Today such a row would wait on "…" for ever. The row's countdown becomes
optional in `HomeRow` (author's call).

**Model shape (author's call):** `HomeModel.others` and `othersTitle` become
`groups: { key: string; title: string; rows: HomeRow[] }[]`, where `key` is
`'near'`, `'all'` or the place. `homeRowOrder` returns the same order, so the
poll cap follows the screen. `renderHome` keeps one section element per group
key, so rows keep their elements as they move between groups. That preserves
today's "a finger already down stays on the same element" behaviour.

## 9. Map page

**Address:** `/map`, a new `Route` kind `'map'` in `src/routes.ts`. The
existing `navigateFallback` already serves `index.html` for it.

**Opening it (Ben):**
- A "Map" link in the footer (`doc-links`) on home and on every spot page,
  alongside About, Privacy and Terms.
- A "See them on a map" button on home, directly under the non-favourite
  sections, at least 44 px tall. The exact look is the builder's call.

**Going back:**
- The map page has a back link that returns to wherever the map was opened
  from: home, or the spot page it was opened from. If it was opened directly,
  the back link goes home. This uses the same `history.state.from` approach
  as the ticket page (author's call).
- A spot opened from the map goes back to the map, at the zoom and position
  it was left at (author's call).

**Library and tiles:**
- `maplibre-gl` from npm, at an exact version.
- It's loaded with a dynamic `import()` only when `/map` opens, along with its
  CSS, so the main bundle doesn't grow.
- The style is OpenFreeMap's `positron` in light mode and a dark style in dark
  mode, following `prefers-color-scheme`. The map switches if the phone's
  setting changes while it's open.
- Recolouring roads, water and parks towards the Picture book palette
  (`src/styles.css` tokens) is the builder's call, done in code with
  `setPaintProperty`. Fonts and sprites come from OpenFreeMap with the style.
- Attribution uses MapLibre's compact attribution control, with the credits
  the OpenFreeMap style supplies.

**What it shows:**
- One pin per spot, drawn as the app's pin (the `PIN` shape in `home.ts`) in
  the spot's line colour. Each pin is a button with a 44 px tap area and an
  accessible name: the spot's name, then its line.
- **First view:** fitted to all spots, with padding. With location on and a
  fix held, it's fitted to the parent and the nearest spot instead.
- **Overlapping pins:** once spots are in several areas, the view fitted to
  every spot will overlap nearby pins. That's accepted, and the parent zooms
  in. Pins aren't clustered or spread apart (author's call).
- **Tapping a pin:** a card slides up from the bottom of the screen. It shows
  the spot's name, its line, the walking time when location is on (the
  `formatWalkShort` wording), and a full-width "Open" button that goes to
  `/<place>/<slug>`. It has no countdown. Tapping the map or another pin
  closes or replaces it.
- **The parent's position:** a dot appears only when home's location setting
  (`wtt_walking_enabled`) is on. If it's off, the map shows a "Use my
  location" button that turns on the same setting, exactly as home's button
  does. The map never starts location by itself.

**When it fails:** if the style or tiles fail to load, or the phone is
offline, the page says "The map can't load right now." with a link back to
the list. The spots stay reachable from home.

**Service worker:** OpenFreeMap requests aren't cached, which is the default
with no `runtimeCaching` rule.

**Accessibility:** a visually hidden list of the spots, as links, sits after
the map, so a screen reader user can pick a spot without the map.

## 10. Privacy page and cost

- `public/privacy.html` gains an entry under the third parties for
  **OpenFreeMap** (`tiles.openfreemap.org`). It loads only when the map page
  is opened. It sees the visitor's IP address and which part of the map is
  being looked at. It may be delivered through Cloudflare. The entry links
  OpenFreeMap's privacy policy, and says the map data is © OpenStreetMap
  contributors.
- The parent's location is never sent to OpenFreeMap. The pins and the
  parent's dot are drawn on the phone. Only the tile requests for the visible
  area of the map are sent.
- Cost: none. OpenFreeMap runs on donations; whether to give is Ben's call.
- Risk: OpenFreeMap could change its terms or shut down. If it does, only
  `/map` breaks, and the fallback is approach C or A.

## 11. Testing

- `homeModel` unit tests:
  - one area gives exactly today's output;
  - with several areas and location on, "Near you" holds only spots within
    the 30-minute walk and the areas are ordered by nearest spot;
  - with location off, areas are alphabetical;
  - favourites are never repeated in another section;
  - an empty area has no heading;
  - rows beyond the poll cap have no countdown.
- `viewpoints` test: an unknown `place` throws.
- `routes` test: `/map` parses.
- Test areas are made in the tests with invented, clearly fake spots. Nothing
  invented goes into `VIEWPOINTS`.
- Map page checked by hand in the browser at 320 px, in light and dark, with
  location on and off, and offline.

## 12. Left to the builder

- How the home "See them on a map" button looks.
- The recolouring of the map style, and the choice of dark style.
- Card animation (respecting reduced motion) and map padding.

## 13. Decisions

Ben's, 19 November 2026:
- A real street map.
- MapLibre with OpenFreeMap tiles (approach B).
- Home grouping 1: "Near you" first, then the other areas.
- The map goes live now, with today's spots.
- It's linked from the home and spot page footers, and from the home list.

The author's, for Ben to check:
- The map lives on its own page, `/map`.
- Back from the map returns to wherever it was opened from. Back from a spot
  opened from the map returns to the map, at the same position.
- Overlapping pins at the wide first view are accepted.
- "Near you" means within a 30-minute walk.
- With location off, areas are alphabetical.
- No area headings while there's only one area.
- Rows beyond the 8-stop live-times cap show no countdown.
- The map shows the parent's dot only when location is already on, and
  otherwise offers the same "Use my location" button as home.
- Pin card: name, line, walk time and "Open". No countdown.
