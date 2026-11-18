# E17 Trains: UX strategy and design brief

Date: 2026-11-18
Status: draft for the owner to approve. Nothing has been designed or built from it.
Reader: Claude Design, redesigning the whole app from the ground up.
Live app: https://e17trains.uk (three spot pages, e.g. `/walthamstow/east-avenue-bridge`)

## 1. What the app is

A free web app for parents in Walthamstow whose small children love trains. It
says, to the second, when the next train will pass a particular bridge or
platform, so the parent can get the child to the railings in time. It works on
a phone browser and can be added to the home screen. There is no login.

## 2. Who uses it, and when

A parent or carer on a pavement, pushing a buggy or holding a hand, often in
daylight, with a child asking "train?". They look at the phone for a few
seconds at a time, one-handed, then look up. About 97% of visits are on a
phone; most are returning visitors.

The child does not use the app. The child's experience is the real train.
Nothing in the design should need a child to look at or touch the screen.

## 3. What the parent needs, in order

1. **How long until a train passes right here?** In each direction, large
   enough to read at arm's length in sunlight.
2. **Can I trust that number right now?** If the data is old, missing or
   broken, say so plainly instead of showing a confident wrong time.
3. **Which spot should we go to?** A short list of nearby spots, each with its
   next train, sorted by distance if they allow location.
4. **What's coming after this one?** So they can decide to wait or move on.
5. **Something to say to the child while waiting.** Which way it is coming
   from, whether it is a freight train, a short fact.

Everything else is secondary and must never push these down the screen, cover
them or delay them.

## 4. Design principles

- **The countdown is the product.** It is the largest thing on the spot
  screen and is visible without scrolling, in both directions, on a small
  phone.
- **Glanceable.** A parent should get the answer in under two seconds. Few
  words, strong hierarchy, high contrast outdoors.
- **One hand, big targets.** Nothing important needs precision or two hands.
- **Honest.** Stale, estimated and unavailable are shown as such.
- **Plain words.** No railway or software jargon. A first-time visitor
  understands every label without an explanation.
- **Warm, not babyish.** It is for adults who are out with children. Charm
  comes from the trains and the small touches, not from decoration.
- **Asks come after value.** Any request (location, help with timing, later a
  donation) appears after the app has been useful, is easy to refuse, and is
  easy to find again.

## 5. What is not working today

This is the author's diagnosis after the owner said the current design is not
good enough; the owner has not confirmed each point.

- The screens were added one feature at a time and it shows. The spot screen
  stacks: header, walking time, two countdowns, two line diagrams, two
  "then" rows, a help strip, an "updated" line, a fact, a map link and footer
  links, with no clear order of importance below the countdowns.
- **The timing feature is confusing.** Parents can tap a button as a train
  passes to improve the times, and earn grades for it. The button only exists
  for about 75 seconds around each train, so most visitors never see it. The
  explanation lives in a fold-out strip that does not say what it is. Words
  like "tune", "booked" and "on the staff" mean nothing to a new visitor. The
  owner tried it, tapped "I'll help", and could not tell what had happened or
  where the button was.
- The home list and the spot screen look like two different apps.
- The train drawings are small geometric shapes. They are recognisable but
  have little character.
- There is no first-visit moment that says what the app is for.

## 6. What exists today (everything to be redesigned)

### Home (`/`)

- Title "E17 Trains".
- "Your favourites" (hidden when empty), then "Near you" (with location) or
  "All spots" (without).
- Each row: line-colour dot, spot name, line name and walking time, the next
  train's countdown, a star to favourite.
- "Use my location" button; once on, a status line with an "off" control.
  States: finding, on, unavailable, no GPS signal.
- Row countdown states: loading, stale, no trains, minutes, seconds, NOW.
- A notice when TfL cannot be reached.
- A visitor with exactly one favourite skips home and opens on that spot.

### Spot screen (`/walthamstow/<spot>`)

- Back to "All spots", line name, spot name, favourite star.
- Walking time to the spot (opt-in), with an off control.
- Two direction panels, e.g. "→ Chingford" and "← Walthamstow Central". Each
  has:
  - the countdown: minutes, then seconds in the last minute, then "NOW",
    then "just crossed", or "No trains for a while";
  - a line diagram showing the stations and a small train moving along it,
    with a bridge marker at East Avenue;
  - "Then 12 · 27 min" for the following trains;
  - a brief celebration when the train passes.
- Freight trains (two of the three spots): a "FREIGHT" tag, a different
  train drawing, and where it has come from and is going to, with a region
  for each place.
- The timing button and grade ticket (see section 8).
- Data age: "updated 12s ago", amber when stale.
- A rotating fact about the line, station, train or area (about two dozen verified facts). Tapping it shows the next one.
- "Verify on map" link to the spot on Google Maps.
- Links to About, Privacy and Terms.
- Other states: connecting, no trains right now (with a link to TfL status),
  error, live times paused.

### Small touches

- Tapping the train drawing plays a short two-tone horn.
- The passenger train wears a seasonal outfit: winter, World Book Day,
  Easter, spring, summer, autumn, Halloween, Bonfire Night, Christmas, New
  Year. Freight trains do not.

### Other pages and assets

- About, Privacy and Terms pages.
- App icon, home-screen icons and the link-preview image.

### Current look, for reference only

Cream background, navy text, Overground orange, burgundy for the Weaver line
and green for the Suffragette line, green for "NOW", amber for stale, red for
errors. Big Shoulders Display and Text typefaces. None of this has to
survive, apart from the two line colours matching TfL's.

## 7. The spots

| Spot | Line | Directions | Freight | Timing button |
|---|---|---|---|---|
| East Avenue Bridge | Weaver | Chingford / Walthamstow Central | no | yes |
| Queens Road Station | Suffragette | Barking Riverside / Gospel Oak | yes | no |
| Northcote Road Bridge | Suffragette | Barking Riverside / Gospel Oak | yes | yes |

The owner plans 5 to 10 spots in Walthamstow, each visited in person. The
home list must work for 3 and for 10.

## 8. The hardest problem: asking parents to time trains

The app's times are estimates of when a train leaves or reaches a station,
adjusted by a few seconds to the bridge. Parents standing at the bridge are
the only people who can say when the train really passed. One tap, as the
front of the train reaches them, improves the time for everyone.

How it works now, which the design may change:

- A button appears under a direction's countdown from 30 seconds before the
  predicted pass to 45 seconds after.
- Each timed train counts towards a grade: Spotter (1), Guard (5),
  Signaller (15), Driver (30), Station Master (60). The grade is shown as a
  railway ticket with a hole clipped for each train.
- The parent can decline, and can turn it back on later.
- No account. Each tap is sent without a name; the parent's own count is
  kept on the phone.

What the redesign must solve:

- A first-time visitor understands in one sentence what the tap is and why it
  helps.
- The parent can see, at any time, that the feature exists and when the
  button will be ready, without it competing with the countdown.
- At the moment the train passes, the tap target is unmissable and usable
  without looking closely, because the parent is watching the child and the
  train.
- After a tap, it is obvious that it counted.
- Progress and the grade are easy to find again and feel like a small reward
  for the adult.
- Declining is easy and nothing nags.

The grade names and thresholds, the ticket idea and all the wording are open
to change.

## 9. Illustration and icons

Redraw everything; this is where most of the charm should come from.

- **Passenger train**: a London Overground Class 710, in the line's colour.
- **Freight train**: a Class 66 diesel locomotive with a container wagon.
- **Bridge** marker, and a way of showing a station.
- **Seasonal outfits** for the passenger train (ten, listed in section 6).
- **Interface icons**: favourite star, location pin, walking, back, and the
  four fact categories (line, station, train, local).
- **Grade ticket** or whatever replaces it.
- **App icon** and link-preview image.

Requirements: the two trains are told apart at a glance at about 50 pixels
wide; they face the direction of travel; they take a line colour; they work
on light and dark backgrounds; they are simple vector shapes that can be
drawn in code and animated along a line.

## 10. Voice and wording

Short, plain and friendly, British English. Say "spot", not "viewpoint". Say
what will happen, not how it works. No exclamation marks, no railway or
software terms, no asking for help before the app has helped. Rewrite all
existing wording as part of the redesign.

## 11. What cannot change

- **The facts shown**: times come from TfL and, for freight, Realtime Trains,
  with live signalling corrections. The design cannot invent data the app
  does not have (no train photos, no carriage counts, no platform numbers).
- **Privacy promises**: no account, no cookies, location only after the
  visitor taps to allow it. Their position never leaves the phone; a timing
  tap records only whether they were near the spot.
- **Every spot has its own permanent address**, already in use.
- **Favourites** and the timing count are kept on the phone and must survive
  the redesign.
- **Accessibility**: readable contrast, works with a screen reader, respects
  reduced-motion settings, tap targets at least 44 pixels.
- **Technology**: a single-page web app in plain TypeScript and CSS, no
  framework. Light to load on a phone signal. Works at 320 to 430 pixels
  wide first; anything wider is a bonus.
- **The child stays screen-free.**

## 12. Room to leave, not to design now

A new name and domain; sharing a spot with another parent; a small donation
ask; other kinds of train; printed stickers and flyers with a code that opens
one spot. The identity should not depend on the name "E17 Trains" or on
Walthamstow alone.

## 13. What to deliver

1. A short statement of the design direction, with two or three distinct
   directions to choose between before any detail is drawn.
2. For the chosen direction: colour, type, spacing and component rules, in
   light and dark.
3. Phone screens for home and the spot screen, in every state listed in
   section 6, including first visit.
4. The timing feature from first sight to a clipped ticket (section 8).
5. The illustration set in section 9.
6. About, Privacy and Terms in the same style.
7. All wording.

## 14. Calls made by the author, for the owner to check

1. The redesign may change layout, flow and wording, not only the look.
2. The current colours and typefaces are not protected.
3. Dark mode is asked for. The app has none today.
4. The horn and seasonal outfits stay as small touches for the adult to share
   with the child, even though the child is meant to stay off the screen.
5. The grade names, thresholds and ticket are open to change.
6. "E17 Trains" stays as the working name; the rebrand is not part of this.
7. Claude Design is asked for two or three directions first, so the owner
   chooses a direction before a full set of screens is drawn.
