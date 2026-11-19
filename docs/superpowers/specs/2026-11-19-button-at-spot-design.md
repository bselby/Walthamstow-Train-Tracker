# Timing button only at the spot: short design

Date: 2026-11-19. Approved by Ben in chat.

## Why
Taps from people who are not at the spot (on the sofa, or walked off) would
make the timings worse. Ben: the button should only work with location on and
the phone within 100 m of the spot, allowing for a phone's location being off.

## What people see (spots that can be timed, anyone who has not said no)
- Location on, within 100 m: as before (help box on the first two visits,
  then the yellow button when a train is due).
- Location on, further away, or still finding the phone: nothing in the cards.
- Location off: one line below the cards, "Turn on location to time trains
  here", which turns location on like "Enable walking time".
- Browser has blocked location, or no location on this phone: nothing.

## Calls (Claude's, shown to Ben)
- A button already drawn for a train stays for that train if the location
  wobbles past 100 m.
- The help box only shows at the spot, so it never promises a button that
  will not come.
- The ask card ("Fancy timing a train?") is unchanged; the line sits under it.
- The tap function is unchanged. Taps already carry `atViewpoint`; rejecting
  others would fail taps from old cached app versions with a false "No signal".
- The `atViewpoint` check tightens from 150 m to 100 m, one rule everywhere.
- How it works and the privacy page say so. Coordinates still never leave
  the phone.

## Approaches considered
- Filter taps on the server and keep the button for everyone: no screen
  change, but people far away would be told they are helping when they are not.
- Check location at the moment of the tap: means telling someone afterwards
  that their tap did not count.
- Chosen: show the button only at the spot, with a one-line nudge when
  location is off (Ben's pick over showing nothing at all).
