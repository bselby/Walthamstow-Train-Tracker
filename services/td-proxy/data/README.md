# SMART reference data

`SMART-Q4-SO.json` is a filtered extract of Network Rail's SMART berth-offset
file (the codebook that translates Train Describer berth steps into platform
events). Captured 2026-04-25 from raildata.org.uk (full extract was 33,995
rows; this subset is the 206 rows for TD areas relevant to E17 — Q4
(Chingford branch + Liverpool Street) and SO (GOBLIN / Suffragette)).

## When you'd use this

Only if the TD live feed ever resumes. Right now both routes are blocked
(see `memory/project_td_integration.md`), so this file is dormant reference.

If/when events flow, this replaces the manual `travelSecondsFromDeparture`
calibration in `src/viewpoints.ts` — given a step like `1415→1419` in area
`Q4` the file tells you authoritatively: "Walthamstow Central, platform 2,
departed, fires 11 s before the actual departure event."

## Refreshing

SMART changes when berth layouts change — usually slowly, but check the
`COMMENT` field for the per-row last-modified date. To refresh:

1. https://raildata.org.uk → SMART (Berth Offset) Data → download JSON
2. Filter to TD areas `Q4` and `SO` (or expand if we add new viewpoints
   on a different line — check the new line's TD area on
   https://wiki.openraildata.com/index.php/Train_Describers).
3. Replace this file. Commit dated.

## Schema

```ts
{
  BERTHDATA: Array<{
    TD: string;            // TD area, e.g. "Q4", "SO"
    STANOX: string;        // 5-digit Network Rail location code
    STANME: string;        // 8-char alpha (e.g. "WLTHMSTQR")
    STEPTYPE: 'B' | 'F';   // Between (regular) | From (entry)
    FROMBERTH: string;
    TOBERTH: string;
    EVENT: 'A' | 'B' | 'C' | 'D';
    //   A = arrival   (Up,   plat 1 typically)
    //   B = between   (Up,   past the platform)
    //   C = approach  (Down, plat 2 typically)
    //   D = departure (Down, past the platform)
    PLATFORM: string;      // optional
    BERTHOFFSET: string;   // signed seconds: negative = step fires BEFORE
                           // event (predictive), positive = AFTER (descriptive)
    ROUTE: string;         // optional
    FROMLINE: string;      // 'U' | 'D' | '' typically
    TOLINE: string;
    COMMENT: string;       // last-modified date, e.g. "15/10/2024"
  }>
}
```

## Local stations (quick lookup)

| TD | STANOX | STANME    | Notes                                   |
|----|--------|-----------|-----------------------------------------|
| Q4 | 52733  | WALTHMSWC | Walthamstow Central (Weaver, East Ave)  |
| Q4 | 52729  | WOOD ST   | Wood Street (Weaver, East Ave southbound) |
| Q4 | 52732  | HIGHAMSPK | Highams Park (Weaver)                   |
| Q4 | 52741  | LIVERPLST | Liverpool Street (terminus)             |
| SO | 51553  | WLTHMSTQR | **Walthamstow Queens Road** (Suffragette) |
| SO | 51551  | LEYTONMRD | Leyton Midland Road                     |
| SO | 51555  | BLKHORSRD | Blackhorse Road                         |

## Audit against `src/viewpoints.ts` (2026-04-25)

Cross-checked every TD-related assumption in the codebase against SMART. All
correct as written:

- **TD areas Q4 (Chingford branch) + SO (GOBLIN)** — confirmed; both Walthamstow
  stations sit in these areas.
- **East Ave north berth `1415 → 1419`** — Q4 STANOX 52733, EVENT=D (departed),
  Plat 2 Down, BERTHOFFSET −11s. Correct: Down line = northbound past WC.
- **East Ave south berth `1422 → 1420`** — Q4 STANOX 52729 (Wood St), EVENT=B
  (between/past), Plat 1 Up, BERTHOFFSET −25s. Correct: Up line = southbound,
  step fires as the train clears Wood St heading toward WC.
- **Direction convention `north = outbound = Plat 2 Down`** — holds at every
  Q4 and SO station audited.
- **Queens Road CRS `WMW`** — matches the rtt.io fixture in `tests/fixtures`.

Retraction: an earlier commit message (`8f2d2fb`) claimed the East Ave
southbound berth step was wrong and should be `1421 → 1423`. That was a
misread — Plat 1 Up EVENT=B is the correct southbound past-platform event.
The code in `src/viewpoints.ts` is right as-is; only the commit message is
misleading, and it stays in history.

The two numbers that SMART can't verify are the manual
`travelSecondsFromDeparture` calibrations (60s north, 85s south). Geometry
suggests they're in the right ballpark (~40s / ~75s), but live observation
is the only way to nail them — and that's blocked until TD events flow
again.
