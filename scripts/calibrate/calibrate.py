"""Work out signalling timings for a viewpoint between two stations.

Given Network Rail's SMART berth-offset data, the track distance between two
neighbouring stations and how far along the viewpoint sits, this proposes the
berth step to watch and how many seconds after it a train reaches the
viewpoint. Standard library only.

    python3 calibrate.py propose --td SO --from BLKHORSRD --to WLTHMSTQR \
        --line down --distance 1416 --viewpoint 785

The result is an estimate from distance and run time. It has not been checked
against a train at the viewpoint.
"""
import argparse
import json
import math
import os

DEFAULT_SMART = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'services', 'td-proxy', 'data', 'SMART-Q4-SO.json'
)

# SMART event codes: A = arrive (Up), B = depart (Up), C = arrive (Down), D = depart (Down).
DEPART = {'up': 'B', 'down': 'D'}
ARRIVE = {'up': 'A', 'down': 'C'}

# Acceleration / braking pairs (m/s^2) used to show how much the answer
# depends on the guess. The first is the working assumption.
PROFILES = ((0.8, 0.7), (1.0, 0.9), (0.6, 0.6))


def load_smart(path=DEFAULT_SMART):
    """Rows of the SMART extract. The vendored file has a one-line note before the JSON."""
    with open(path, encoding='utf-8-sig') as f:
        text = f.read()
    data = json.loads(text[text.index('{'):])
    return data['BERTHDATA']


def _steps(rows, td, stanme, event):
    return [
        r for r in rows
        if r['TD'] == td and r['STANME'].strip() == stanme and r['EVENT'] == event
    ]


def section(rows, td, from_station, to_station, line):
    """The departure step at one station and the arrival step at the next.

    `run_seconds` is the station-to-station time implied by SMART when one
    step serves as both; otherwise None, and the gap between the two steps
    has to come from a recording.
    """
    deps = _steps(rows, td, from_station, DEPART[line])
    arrs = _steps(rows, td, to_station, ARRIVE[line])
    if not deps:
        raise ValueError(f'no {line} departure step for {from_station} in TD area {td}')
    if not arrs:
        raise ValueError(f'no {line} arrival step for {to_station} in TD area {td}')

    def key(r):
        return (r['FROMBERTH'], r['TOBERTH'])

    pair = None
    for d in deps:
        for a in arrs:
            if key(d) == key(a):
                pair = (d, a)
                break
        if pair:
            break
    if not pair:
        for d in deps:
            for a in arrs:
                if d['TOBERTH'] == a['FROMBERTH']:
                    pair = (d, a)
                    break
            if pair:
                break
    if not pair:
        pair = (deps[0], arrs[0])
    dep, arr = pair
    dep_offset, arr_offset = int(dep['BERTHOFFSET']), int(arr['BERTHOFFSET'])
    same = key(dep) == key(arr)
    return {
        'dep_step': key(dep),
        'arr_step': key(arr),
        # Event time = step time + offset. Departures are negative: the train
        # left the platform that many seconds before passing the signal.
        'dep_offset': dep_offset,
        'arr_offset': arr_offset,
        'run_seconds': abs(dep_offset) + arr_offset if same else None,
    }


def _top_speed(distance, run, accel, brake):
    """Cruise speed that covers `distance` in `run` seconds, start to stop."""
    peak = math.sqrt(2 * distance * accel * brake / (accel + brake))
    if run < peak / accel + peak / brake:
        raise ValueError(f'{distance:.0f} m in {run:.0f} s is faster than a train can start and stop')

    def total(v):
        return v / accel + v / brake + (distance - v * v / (2 * accel) - v * v / (2 * brake)) / v

    lo, hi = 0.1, peak
    for _ in range(80):
        mid = (lo + hi) / 2
        if total(mid) > run:
            lo = mid
        else:
            hi = mid
    return hi


def seconds_after_departure(distance, run, position, accel=PROFILES[0][0], brake=PROFILES[0][1]):
    """Seconds after leaving the first station that the train is `position` metres along."""
    v = _top_speed(distance, run, accel, brake)
    accel_dist = v * v / (2 * accel)
    brake_dist = v * v / (2 * brake)
    if position <= accel_dist:
        return math.sqrt(2 * position / accel)
    if position <= distance - brake_dist:
        return v / accel + (position - accel_dist) / v
    return run - math.sqrt(2 * max(distance - position, 0) / brake)


def propose(rows, td, from_station, to_station, line, distance_m, viewpoint_m, gap_seconds=None):
    """Berth step and seconds-to-viewpoint for a viewpoint `viewpoint_m` along a `distance_m` section."""
    s = section(rows, td, from_station, to_station, line)
    run = s['run_seconds']
    if run is None:
        if gap_seconds is None:
            raise ValueError(
                f'departure step {s["dep_step"]} and arrival step {s["arr_step"]} differ; '
                'pass the measured gap between them (--gap)'
            )
        run = abs(s['dep_offset']) + gap_seconds + s['arr_offset']
    values = [
        seconds_after_departure(distance_m, run, viewpoint_m, a, b) + s['dep_offset']
        for a, b in PROFILES
    ]
    return {
        'berth_step': {'fromBerth': s['dep_step'][0], 'toBerth': s['dep_step'][1]},
        'seconds_to_viewpoint': round(values[0]),
        'range': [math.floor(min(values)), math.ceil(max(values))],
        'run_seconds': run,
        'top_speed_mph': round(_top_speed(distance_m, run, *PROFILES[0]) * 2.237),
        'arrival_step': {'fromBerth': s['arr_step'][0], 'toBerth': s['arr_step'][1]},
        'dep_offset': s['dep_offset'],
        'arr_offset': s['arr_offset'],
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='command', required=True)
    pr = sub.add_parser('propose', help='propose a berth step and timing for a viewpoint')
    pr.add_argument('--smart', default=DEFAULT_SMART)
    pr.add_argument('--td', required=True, help='TD area, e.g. Q4 or SO')
    pr.add_argument('--from', dest='from_station', required=True, help='SMART station name the train leaves')
    pr.add_argument('--to', dest='to_station', required=True, help='SMART station name the train arrives at')
    pr.add_argument('--line', choices=('up', 'down'), required=True)
    pr.add_argument('--distance', type=float, required=True, help='track distance between the stations, metres')
    pr.add_argument('--viewpoint', type=float, required=True, help='distance from the first station to the viewpoint, metres')
    pr.add_argument('--gap', type=float, help='measured seconds between the departure and arrival steps, if they differ')
    args = p.parse_args()
    result = propose(
        load_smart(args.smart), args.td, args.from_station, args.to_station, args.line,
        args.distance, args.viewpoint, args.gap,
    )
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
