# "Train's here" tap: parent-powered calibration

Date: 2026-11-17
Status: approved by the owner on 2026-11-17. Not yet built.

## Intent and why

A countdown is only as good as the app's idea of when a train reaches the
viewpoint. For stations the rail data says so directly. For a bridge or path
between stations it has to be worked out, and the owner cannot stand at every
viewpoint with a stopwatch as the number of viewpoints grows.

Parents are already standing there when the train passes. One tap from a
parent at that moment is a measurement. Enough taps tune a viewpoint for
everyone, and asking for them is also the app's first piece of engagement:
the parent is thanked, and progress builds towards levels.

This sits on top of the distance-based estimate (separate work), which gives
every viewpoint a sensible starting point for taps to refine.

## Principles from the owner

- The countdown times are the most important thing in the app. Nothing in this
  feature may cover or delay them.
- This is a contribution from the parent. The child's experience stays
  screen-free: nothing here is designed for a child to tap, watch or hear.
- A tap must be unmistakably about one specific train. At East Avenue trains
  in opposite directions often pass within a minute or two of each other.
- The thank-you is immediate. Longer-term payoff builds through a ticket and
  grades, which later features (sharing, logging a train) can also feed.
- Whimsy is welcome where it is for the parent (owner, 2026-11-17).

## Goals

1. A parent can record the moment a specific train passes with one tap.
2. Taps improve the countdown for that viewpoint and direction for all users,
   without a code change or redeploy.
3. A single wrong, early, late or malicious tap cannot noticeably move a
   viewpoint's timing.
4. The parent is thanked at once, sees what their tap did, and sees progress
   towards a grade.
5. No account or sign-up.

## Non-goals

- Sharing, logging trains seen, leaderboards, or any social feature. The ticket
  is built so they can feed it later.
- Accounts or syncing progress between devices.
- Any child-facing interaction, and any sound.
- The distance-based estimate itself, and the TfL staleness fix.

## Anti-goals

- A prompt or button that hides, delays or shifts the countdowns.
- A tap being counted for the wrong train.
- Collecting location coordinates or anything that identifies a person.
- A viewpoint's timing getting worse because of bad taps.

## Approaches considered (where taps are stored)

| | How | For | Against |
|---|---|---|---|
| A. Netlify Functions + Netlify Blobs | A function receives taps and stores them; another serves calibration | Same host as the site and the existing freight function; no new account or service; included on every Netlify plan | Blobs is a simple key-value store, so aggregation is done in code |
| B. The Fly.io proxy with a small database | Add endpoints and a volume to the signalling proxy | Already running; sees the berth events itself | Turns a stateless relay into a stateful service; one small machine becomes a single point of failure for two jobs |
| C. Cloudflare Worker + D1 | New Worker with a SQL database | Proper SQL | A third hosting platform for a few hundred rows |

**Proposed: A.** At this scale (a few taps a day) the simplest option on the
platform already in use is enough. This is the author's recommendation; the
owner asked whether Netlify can handle it, and it can.

## Design

### On screen

**The ask.** On first load, a card below the two direction panels: a short
heading, one or two sentences saying timings can be a little out and that
tapping when a train passes tunes this spot for everyone, and two choices
("I'll help", "Not now"). It is in the page flow under the countdowns, never
an overlay. "Not now" hides it; it is offered once more after seven days and
then not again. On later visits, a helper who has tapped before sees a
one-line invitation in the same place ("Want to make it more accurate?")
with their ticket.

**The button.** Each direction panel gets its own button, inside that panel,
labelled with that train's destination ("Chingford train is passing"). It
appears when that direction's countdown reaches 30 seconds and stays until
the parent taps or until 45 seconds after the predicted time. Two trains
close together means two separate buttons in two panels. One tap per train
per device; the button then becomes the thank-you.

**The thank-you is a register entry.** Real signal boxes keep a Train
Register, a ledger of the time each train passes; the parent's tap is that
entry. Immediately in place of the button: "Booked in. Thank you.", then the
time they booked, the time the app predicted, and the gap in plain words
("2 seconds out", "Right time." when within 3 seconds, "We were 12 seconds
early. Noted."). Below it, the ticket with its new clip. A short vibration
where the phone supports it.

**The ticket and grades (owner's choice, 2026-11-17, replacing the ring).**
Progress is shown as an old-style card ticket carrying the parent's grade.
Each tap clips one hole; a full ticket is a promotion and a fresh ticket.
Grades: Spotter at 1 tap, Guard at 5, Signaller at 15, Driver at 30, Station
Master at 60. Progress is stored on the phone, like favourites. The ticket
cannot be mistaken for the existing amber confidence arc.

**Promotion notices.** Reaching a grade shows a short "Staff notice" in place
of the plain thank-you line: the new grade, the kit issued with it, and the
number of trains booked. Kit: Spotter, notebook issued; Guard, whistle
issued; Signaller, keys to the box; Driver, cap and timetable; Station
Master, top hat optional.

**Tone and motion.** The app's saved design brief is "bright, cheerful,
railway-truthful", a children's book about London trains, where delight
earns its keep. The parent is treated as railway staff booking trains in.
One movement only: the ticket being clipped, about 300 ms, no bounce, off
under `prefers-reduced-motion`. No sound, no confetti, nothing that runs
longer than a second, and nothing that asks a child to look at or touch the
phone. The button itself stays plainly worded.

### What a tap records

Sent to the server at once:

- viewpoint id and direction;
- seconds between the tap and sending (so the server, not the phone's clock,
  fixes the moment of the tap);
- what the app was predicting for that train, and from which source
  (signalling or TfL);
- the anchors needed to recalibrate: the train's signalled departure time
  from the previous station if one was received, and TfL's expected arrival
  time;
- the train's id from the source, to count one tap per train;
- whether the phone was at the viewpoint: yes, no or unknown. Decided on the
  phone when location is already enabled; coordinates are never sent;
- a random id made on the phone, used only to spot repeat taps and to count
  distinct helpers.

If sending fails the tap is thanked anyway and dropped.

### How taps become timings

A tap is usable when it is within 90 seconds of the prediction, not marked as
away from the viewpoint, and the first from that device for that train.

For each viewpoint and direction, the calibrated value is the median of
usable taps from the last 60 days. It is applied only once there are at least
5 usable taps from at least 3 different devices, and it is never allowed to
move more than 30 seconds from the distance-based estimate. Below those
thresholds the distance-based estimate stands.

Two values are calibrated per viewpoint and direction, because the app has
two ways of predicting: seconds from signalled departure to the viewpoint,
and seconds between TfL's expected station arrival and the viewpoint.

A scheduled job recomputes the values daily. The app fetches them at
start-up, keeps the last copy for offline use, and falls back to its built-in
values when none are available.

### Server

Two endpoints on Netlify, alongside the existing freight function:

- **Receive a tap.** Validates the shape, rejects unknown viewpoints, stamps
  the server time, stores one record per tap. Light rate limiting per random
  id.
- **Serve calibration.** Returns the current values for all viewpoints,
  cacheable for an hour.

Plus the daily scheduled job. Taps older than 12 months are deleted.

### Privacy

No account, no name, no coordinates. The random id is not linked to anything
else. The privacy page gains a short section describing what a tap sends.

## Decisions after the builder check

These settle points a builder would otherwise have to guess. All are the
author's calls unless marked.

- **Which train a tap belongs to.** When a direction's button first appears,
  the app fixes a "pass" for it: the direction, the TfL vehicle id of the
  train shown in that panel, the signalling train id if a berth event has
  been received for that direction, and the prediction at that moment. The
  button, its label, the one-tap rule and everything sent to the server refer
  to that pass, even if the panel's lead train changes underneath. Today the
  app does not match signalling trains to TfL trains; it applies a berth time
  to whichever train leads the panel. If the distance-based work introduces
  proper per-train tracking, the pass should use it.
- **The moment to tap** is the front of the train reaching the viewpoint,
  which is what the countdown's zero means. The help card says so.
- **If the countdown jumps** after the button has appeared, the button stays
  for that pass. Its 45-second expiry follows the latest prediction. The tap
  sends both the prediction when the button appeared and the prediction at
  the tap; the 90-second filter uses the one at the tap.
- **Station viewpoints** (where the viewpoint is the platform and the offset
  is zero) show no ask and no button. Their time comes straight from the rail
  data and is not calibrated by taps.
- **Freight trains** get no button in this version. Their timing comes from a
  different source and would need its own calibration.
- **Order of work.** Phase 1 does not depend on the distance-based estimate.
  Phase 2 does: the 30-second limit and the fallback are both measured from
  the app's built-in value for that viewpoint and direction, whatever method
  produced it. Phase 2 should follow the distance-based work.
- **Who sees the buttons (owner's decision, 2026-11-17).** Everyone, except
  people who chose "Not now". A "Help tune this spot" link on the About page
  brings the ask back for anyone who changes their mind.

## Owner's ideas for after the tap (2026-11-17, not yet designed)

- **A couple of questions for people who tap.** Short, one-tap answers, asked
  after the thank-you, never before the train.
- **A small donation ask for engaged users only.** Something like £1 or £2
  towards running costs (domain, hosting, the signalling proxy, tap storage),
  shown only to someone who has clearly taken to the app, and never pushed at
  everyone. It needs its own short design: who counts as engaged, how often
  it is shown, and which payment service takes the money.

## Phasing

1. **Collect.** The ask, the button, the thank-you, ticket and grades, and the
   endpoint that stores taps. Taps have no effect on timings yet, so real
   data can be examined before it is trusted.
2. **Apply.** The daily job, the calibration endpoint, and the app using the
   values.

## Constraints

- Same stack as the app: vanilla TypeScript, Vitest, Netlify.
- Nothing deployed without the owner's approval.
- New pure logic (button visibility window, tap filtering, median and
  thresholds, level from tap count) is unit-tested.

## Left to the builder

- Storage layout in Netlify Blobs and how aggregation reads it.
- Exact wording, within the tone of the examples above.
- The ticket's exact appearance, within the existing visual style.
- Rate-limit numbers.

## Calls made by the author, for the owner to check

1. Netlify Functions and Blobs for storage.
2. The button appears at 30 seconds and one tap per train is accepted.
3. "Not now" is respected: one more ask after seven days, then none.
4. Grade names, thresholds and kit as listed.
5. Phase 1 collects taps without changing any timing.
6. A calibrated value can move at most 30 seconds from the distance-based
   estimate, and needs 5 taps from 3 devices.
