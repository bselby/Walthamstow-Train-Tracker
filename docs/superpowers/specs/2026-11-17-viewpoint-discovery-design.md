# Viewpoint discovery: Walthamstow trial

Date: 2026-11-17
Status: approved by the owner on 2026-11-17 ("lets get everything live"). Not yet built.

## Intent and why

The app has three viewpoints and a dropdown that lists all of them. The owner
wants to get the experience right locally first: add a few more Walthamstow
viewpoints (5 to 10 in total, each visited in person), trial a better way of
finding the right one, and only then rebrand, move domain and promote it with
stickers and flyers. A larger rollout (hundreds of viewpoints, other areas) is
a later decision; this design must not block it, and must not build for it.

A parent on a pavement with a toddler should get from "open the app" to "a
train passes that bridge in 2 minutes" in a few seconds, one-handed.

What the current app cannot do:

- `src/switcher.ts` renders every entry of `VIEWPOINTS` in a fixed order.
- There is one favourite (`wtt_favourite_viewpoint`); the app opens on it, or
  on East Avenue if none is stored.
- Location is used only for the walking-time label, after an opt-in. It never
  chooses or sorts viewpoints.
- No viewpoint has its own URL, so one cannot be linked, shared, printed as a
  QR code or told apart in analytics (which show the single path `/`).

Current traffic is roughly 300 page views a month, about 97% mobile, mostly
returning direct visits. Existing users must not get a worse experience.

## Goals

1. From a cold open, a user with location enabled sees the nearest viewpoints
   and each one's next train without tapping.
2. A user without location still gets a useful list and can pick a viewpoint.
3. Favourites remain, become a list, and sit at the top of the home screen.
4. Every viewpoint has a permanent URL.
5. Adding a visited viewpoint on a line the app already knows needs one small
   record, not a new block of hand-built line data.

## Non-goals

- Countdown accuracy and data sources. That is separate work running first;
  this design must not make it harder.
- National Rail or any non-TfL arrivals feed. Trial viewpoints are on
  Overground lines the app already supports (Weaver, Suffragette).
- Rename, rebrand, new domain, stickers and flyers.
- Search, filters, area pages, a map, static pages for search engines, and an
  import script from the discovery project. All are parked (see "Later").
- User submissions, accounts, or syncing favourites between devices.
- Changing the countdown screen, the freight feature, or the td-proxy.

## Anti-goals

- An existing user takes longer to reach their countdown than today.
- A location permission prompt appears without the user tapping something.
- A viewpoint that has not been visited in person and judged safe by the owner
  appears in the live app.
- Home-screen polling gets the app rate-limited by TfL.

## Approaches considered

| | Opens on | Strength | Weakness |
|---|---|---|---|
| A. Nearest-first list | Favourites, then closest viewpoints with live countdowns | Fastest for "we're out now" | Needs location or a list to browse |
| B. Map-first | Map of pins | Good for exploring | Slow one-handed; heavy to load |
| C. Browse by area and line | Area, then line, then list | Good for search engines | Too many taps in the moment |

**Chosen by the owner: A.** B and C are parked as later additions built on the
same data. Also rejected: keeping the dropdown and adding a search field (still
one flat list with no sense of what is near).

## Design

### Vocabulary

Code keeps the name `Viewpoint`. User-facing copy says "spot". This is a
proposal, not something the owner asked for.

### Routes

| Route | Screen |
|---|---|
| `/` | Home |
| `/<place>/<slug>` | The existing countdown screen for one viewpoint |

`<place>` is a hand-chosen locality (`walthamstow` for all trial viewpoints),
so that slugs stay unique and readable when other areas are added. A published
URL is permanent and never reused; a rename keeps the old URL working as a
redirect. Proposed URLs for the current three:
`/walthamstow/east-avenue-bridge`, `/walthamstow/queens-road-station`,
`/walthamstow/northcote-road-bridge`. Internal ids (`east-ave` and so on) stay
as they are for storage. Routing uses the History API in the existing
single-page app; Netlify serves the app for these paths.

### Home

In order: header, "Your favourites" (hidden when empty), then "Near you".
Each row shows a line-colour dot, name, line name, walking time when location
is known, the next train's countdown, and a star.

- "Near you" is sorted by straight-line distance using the existing
  `walkingTime.ts` estimate. Without location it is titled "All spots" and
  sorted by name.
- The row countdown is the sooner of the two directions.
- Tapping a row opens that viewpoint's URL. Tapping the star toggles the
  favourite without navigating.
- Without location, a "Use my location" button sits above the list. Location
  is requested only when it is tapped. This and the existing walking-time
  opt-in become one stored consent; a user who already opted in to walking
  time is treated as opted in here.

The countdown screen replaces the dropdown with a way back to home.

### Where `/` lands

- No favourites: home.
- Exactly one favourite: straight to that favourite's countdown, as today,
  whether or not location is enabled.
- Two or more favourites: home.

### Favourites and existing users

Favourites become an ordered list under a new storage key.

- A stored `wtt_favourite_viewpoint` migrates into the list.
- A returning user with no stored favourite is seeded with East Avenue as
  their one favourite, because that is the screen they open on today. A
  returning user is one with `wtt_fact_index` in storage (written on every
  successful poll).
- A brand-new user gets an empty list and lands on home.
- Ids no longer in the data are ignored on read.

### Live countdowns on home

Arrivals are fetched per distinct TfL stop, since viewpoints share stops. Home
polls every 30 seconds for the rows on screen, capped at 8 distinct stops,
only while the tab is visible: at most 16 requests a minute. The builder must
confirm TfL's current unauthenticated limit before fixing these numbers; the
app sends no app key today. The countdown screen keeps its 20-second poll.

Home rows use TfL arrivals plus the viewpoint's offset only. They do not
include freight or signalling corrections, so a row can differ slightly from
the countdown screen. This keeps home off the Realtime Trains quota.

### Viewpoint records

Line data (ordered stops, inter-stop timings, name, colour) is already shared
per line in `viewpoints.ts`. A new viewpoint on a known line needs only: id,
place, slug, name, description, coordinates, line, TfL stop, anchor stop on
that line, and per direction a label, TfL direction, terminus name and offset
in seconds. Signalling berths, freight station code and a bespoke position
model stay optional extras; the three current viewpoints keep all of theirs.

Every trial viewpoint's offsets are timed by the owner on a visit. There is no
"estimated" tier and no approximate-countdown display in this design.

Records stay in code for the trial. Moving them to a data file is parked until
an import from the discovery project is wanted.

A per-direction stop (so each direction is predicted from the next station
downstream) may come out of the accuracy work. The record shape should allow
it to be added without breaking existing records.

## Phasing

Each phase ships on its own and gets its own implementation plan.

1. **URLs and favourites.** Per-viewpoint URLs, favourites list with
   migration, landing rule. The app looks unchanged apart from the address
   bar and multiple stars.
2. **Home.** The list, location consent, home polling. The dropdown is
   removed.

New viewpoints can be added at any point as the owner visits them.

## Later (parked, not designed here)

- Search over names, stations, lines and postcode districts; filters for line,
  step-free and playground nearby. Worth building once the list no longer fits
  on one screen.
- Static page per viewpoint with its own title and preview, and a generated
  sitemap. Best done with the rebrand and domain move.
- Sharing that is fun to use (owner's idea, 2026-11-17): something a parent
  would send to another parent, not a bare share button. Depends on
  per-viewpoint URLs from phase 1. Needs its own design.
- Light gamification (owner's idea, same date), for example collecting
  viewpoints visited or trains seen. Needs its own design.
- Event tracking (owner's request, same date): which viewpoints are opened,
  stars, shares, location opt-ins. The site currently promises no cookies, so
  the choice of tool affects the privacy page and whether a consent banner is
  needed.
- Area pages, a map toggle, a data file fed by the discovery project's
  approved rows, and a simpler tier for viewpoints nobody has hand-timed.

## Constraints

- Vite, vanilla TypeScript, Vitest, Netlify. No framework, no database.
- No new third-party request.
- The privacy page is updated when location starts being used for sorting.
- Existing tests keep passing. New pure logic (distance sort, favourites
  migration, landing rule, route parsing, stop grouping for polling) is
  unit-tested.
- Nothing is deployed, and no production configuration changes, without the
  owner's approval for that phase.

## Left to the builder

- File and module layout, and how the router is written.
- The storage key name and format for the favourites list.
- Exact row layout, spacing and motion, within the existing visual style
  (cream background, navy text, Big Shoulders type, line-colour accents).
- What home shows while the first arrivals are loading or when TfL fails.

## Calls made by the author, for the owner to check

1. "Spot" in the interface, `Viewpoint` in code.
2. URLs take the form `/walthamstow/east-avenue-bridge`.
3. Existing users with no stored favourite are given East Avenue as a
   favourite, so their opening screen does not change.
4. One favourite opens straight on its countdown; two or more open on home.
5. Home rows show TfL-only countdowns, without freight.
6. Search and filters are parked until there are more viewpoints than fit on
   one screen.
