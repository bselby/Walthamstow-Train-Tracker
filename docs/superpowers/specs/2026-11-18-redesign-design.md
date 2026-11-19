# E17 Trains redesign: build design

Date: 2026-11-18
Status: draft for Ben to approve. Nothing is built.
Sources:
- UX strategy and brief: `docs/design/2026-11-18-ux-strategy-and-design-brief.md`
- Design canvas (private to Ben): https://claude.ai/artifact/8i8eF18Eqd2juab32MbVbG,
  direction C "Picture book", rounds 2 to 4 (boards 1 to 19). Rounds A, B and
  the first C round are superseded.

## 1. Intent

Ben judged the current app not good enough: screens added one feature at a
time, a timing feature nobody understands, and two parts that look like
different apps. The redesign rebuilds the look, layout, wording and drawings of
the whole app to the Picture book design, so a parent on a pavement gets the
next train in two seconds, understands the timing feature in one sentence,
and finds the ticket a small reward.

## 2. Goals

1. Every screen and state on boards 1 to 19 exists in the app, in light and
   dark.
2. The countdown stays the largest thing on the spot screen, visible in both
   directions without scrolling on a 320 px wide phone.
3. The timing feature runs from invitation to explainer to button to clipped
   ticket to rank-up, as drawn.
4. New train drawings, line diagrams, seasonal outfits, app icon and link
   preview replace the old ones.
5. Privacy, Terms and About are rewritten in the same style and wording.
6. Released in one go, after Ben has tried the whole thing on his phone.

## 3. Non-goals

- New data, new spots, new features beyond what the boards show.
- A rename, new domain, sharing, donations (brief section 12).
- Any change to how times are worked out, the freight feed, the signalling
  proxy or the tap function's stored record.

## 4. Anti-goals (a failure even if it works)

- Anything covers, delays or pushes down the countdown.
- A parent loses their favourites or timing count when the new version
  arrives.
- Copy that is technical, or privacy detail on the app's screens instead of
  the privacy page.
- Anything that asks the child to look at or touch the screen.
- The live site changes before Ben approves the switch-over.

## 5. Constraints

- Plain TypeScript and CSS, no framework, built with Vite, as today. Light on
  a phone signal.
- Phone widths 320 to 430 px first.
- Contrast, screen reader labels, reduced motion and 44 px targets, as today.
- Every spot keeps its address. `localStorage` keys stay the same, so
  favourites (`favourites.ts`) and the tap state (`wtt_tap_state`) carry over.
  Any new field in the tap state is optional and defaults safely for old
  saved states.
- Line diagram rule for every spot: both end stations drawn as larger dots and
  named in full under the line; every station between as a small dot; the
  spot shown as a "You" pin; no per-spot drawings.
- No exclamation marks. British English. "Spot", not "viewpoint".
- The service worker updates itself (`registerType: 'autoUpdate'`), so
  installed copies switch on their next visit after go-live.

## 6. Approaches considered

1. **One separate branch with a private preview (chosen by Ben).** All work on
   one branch in its own worktree. The live site runs the old app until a
   single approved merge. Netlify builds a private preview of the branch so
   Ben can try it at the real spots. Cost: fixes made to the live app in the
   meantime must be copied across.
2. **A hidden switch in the live app.** Rejected: both designs side by side in
   one stylesheet for weeks, and half-finished code on the live site.
3. **A fresh app from scratch.** Rejected: throws away tested timing and
   countdown logic, and goes against Ben's rule not to replace the app
   unnecessarily.

## 7. What gets built

The logic stays; the presentation is replaced. Map from boards to code:

### 7.1 Look (foundation)

- New tokens in `src/styles.css`, replacing the current palette:
  - Light: background `#DCEEF5`, card `#FFFFFF` radius 22 px, ink `#1F2A44`,
    dim `#46536E`, Weaver `#7A2E54`, Suffragette `#1E7B4B`, button yellow
    `#FFC93C`, ticket cream `#FFF4CF`, pin `#E4572E`, freight brown `#8A5A2B`,
    container teal `#2F7D8C`, freight tag background `#F3E6D8` text
    `#6B4A1E`.
  - Dark (board 14), following the phone's setting via
    `prefers-color-scheme`, no in-app switch: background `#121829`, card
    `#1D2539`, border `#3A4560`, text `#F2F4F8`, dim `#A9B3C6`, Weaver text
    `#E79BC0`, Weaver doors on the train `#B4517F`, pin `#F0663F`.
    Suffragette dark values are left to the builder to match contrast.
  - Fonts: Baloo 2 (headings and numbers) and Nunito (body) from Google Fonts,
    replacing Big Shoulders in `index.html` and the three pages.
- The existing line colour override per spot (`--line-color`, set in
  `main.ts`) stays.

### 7.2 Drawings

- Passenger train: the board 7 drawing (viewBox 0 0 120 50, faces right,
  mirrored for the other direction, doors and stripe in the line colour).
- Freight: the board 7 drawing (loco plus container wagon). Replaces
  `freightSvg.ts`.
- Line diagram (board 7): replaces the strip drawing in `strip.ts`, including
  removing the bridge drawing (`BRIDGE_SVG`, `bridgeLabel`) in favour of the
  pin. The moving train and the pass celebration stay.
- Ten seasonal outfits (board 18) as overlays on the passenger train, chosen
  by the existing `season.ts` rules. Freight never wears one.
- Horn on tapping the train stays (`toot.ts`).

### 7.3 Screens

- Home (board 9): favourites, near you / all spots, rows, location states,
  TfL notice. `home.ts`, `homeModel.ts`, `homeArrivals.ts`.
- Spot screen (boards 4, 5, 10, 14): header with back link, ticket badge and
  favourite star; one card per direction with countdown, "then" times, line
  diagram and the timing slot; freight tag and "Coming from X, off to Y" from
  the existing freight data; fact; data age. `render.ts`, `spotHeader.ts`,
  `main.ts`.
- No trains for a while (board 11, with the TfL status link), live times lost
  (board 12, today's "live times paused"), plus connecting and error states
  drawn in the same style by the builder.
- Everything else on today's spot screen stays, restyled (author's call):
  the opt-in walking time with its off control, "Verify on map", and the
  About, Privacy and Terms links at the foot of the page.
- Fitting on small phones (author's call, to check on the preview): both
  directions' countdown numbers are visible without scrolling in a
  320 × 460 px visible area. Below 700 px of height (Ben, 2026-11-19) the cards use a
  compact layout (smaller numbers and button, diagram under the "then"
  times). While timing is on at a spot, each card's timing slot keeps one
  fixed height whether it holds the placeholder, the button or the "Got it"
  message, so nothing below it jumps.
- The text on boards (sample freight route, sample fact, times) is
  illustrative; real values come from the existing data.

### 7.4 Timing flow

The existing state machine in `tapStore.ts` (`askKind`: first, again, ready,
invite, off) and the ranks in `tap.ts` (Spotter 1, Guard 5, Signaller 15,
Driver 30, Station Master 60) stay. New presentation:

- First visit invitation inside the spot screen (board 1): "Fancy timing a
  train?", "Show me how", "No thanks". Maps to `first` and `again`. It sits
  below both direction cards, never above a countdown.
- The yellow button shows to everyone who hasn't said no, including people
  who haven't answered the invitation yet; their tap counts as a yes, as
  today (Ben's decision). So the invitation and the button can be on screen
  together.
- Explainer, two pages (boards 2 and 3), on its own address (Ben's decision),
  opened by "Show me how" and by "How it works" on the ticket page. "Count me
  in" means `chooseHelp('helping')`; "Not now" means `chooseHelp('declined')`.
  Back returns to the spot it was opened from.
- Today's ticket strip under the countdowns (`ready`, `invite`, `off`) is
  removed. Its job moves to the header ticket badge (author's call): shown at
  every spot, including Queens Road, for everyone. With taps it reads
  "Spotter · 4 trains"; with none it reads "Your ticket". It always opens the
  ticket page, so someone who said no can turn the button back on there.
- Waiting state: a dashed placeholder in the card, "Yellow button pops up
  here in N min" (board 4, second card), only for someone who said yes and
  only at spots with a timing button.
- The button (board 4): big yellow "Tap as the train passes / when the front
  reaches you", inside the direction card, during today's window (30 s
  before to 45 s after).
- Just after the tap (board 5): "Got it. Ticket clipped.", trains timed and
  the next rank, and the ticket badge in the header updates. No Undo link
  (Ben's decision): a stray tap is one among many.
- No signal (board 15): if the tap could not be sent, add "No signal, so that
  one didn't send. It still counts on your ticket." `sendTap` must report
  whether the send failed.
- Rank-up (board 8's words) when a tap crosses a threshold, using the
  existing `promotionFor`. It shows inside the direction card, in place of
  "Got it. Ticket clipped.", with a "See my ticket" link (Ben's decision), so
  it never covers a countdown.
- Ticket page (board 6) on its own address, for example `/ticket` (Ben's
  decision; `parseRoute` gains a route kind). Back returns to the spot it was
  opened from, or home if opened directly. It shows rank, trains timed, the
  ladder with "Your rank", spots timed at, the "Show the yellow button"
  switch (on means `chooseHelp('helping')`, off means
  `chooseHelp('declined')`), and "How it works".
- The ticket has no number (Ben's decision). A unique ticket number may come
  later; nothing in this build should rule it out.
- Spots timed at: a new optional list of spot ids in the tap state. On first
  load it is seeded from the spot ids already inside `tappedPassKeys`
  (`viewpointId|direction|ms`, the last 20 taps), then added to on each tap
  (author's call).

### 7.5 Pages, icon and preview

- `public/about.html`, `public/privacy.html`, `public/terms.html` and
  `public/docs.css` rewritten to boards 13, 16 and 17. Privacy keeps every
  fact the current page states; the timing taps section lists every field in
  `TapPayload`.
- `public/icon.svg` replaced by the board 19 icon; home-screen sizes
  regenerated with `npm run generate-icons`. `public/og-image.svg` and
  `og-image.png` replaced by the board 19 link preview.

## 8. Release

1. Work on branch `redesign` in its own worktree, from `main`.
2. Tests stay green throughout (`npm test`, `npm run build`). Tests that check
   old wording or markup are updated to the new design, not deleted.
3. When it is complete, a draft pull request gives a Netlify preview address.
   Opening it needs Ben's yes.
4. Ben tries the preview on his phone, at the spots.
5. Merge to `main` (which deploys live) only on Ben's explicit approval.

Taps on the preview: the tap function stores taps in a site-wide store, so a
tap on the preview would land in the live data. The builder's call: the app
does not send taps when it is not running on `e17trains.uk` (and not on
localhost tests), but still clips the ticket, so the flow can be tried. The
preview runs on a different address, so it has its own empty favourites and
ticket.

## 9. Left to the builder

- Exact spacing, motion and component structure, following the boards.
- How CSS is organised, as long as the old palette and fonts are fully
  removed.
- The connecting and error states, drawn in the same style.
- Suffragette dark-mode colour.

## 10. Decisions

Ben's, 18 November 2026:
- The yellow button shows to everyone who hasn't said no; a tap counts as yes.
- Ticket page and explainer get their own addresses; rank-up shows inside the
  direction card.
- No Undo.
- No ticket number for now; maybe a unique one later.

The author's, for Ben to check:
- Dark mode follows the phone's setting, no in-app switch.
- The 320 × 460 fit and fixed-height timing slot (7.3).
- Walking time, "Verify on map" and footer links stay.
- The ticket strip goes; the header badge shows at every spot for everyone.
- "Spots timed at" is seeded from the last 20 taps.
- Taps are not sent from the preview address (section 8).
