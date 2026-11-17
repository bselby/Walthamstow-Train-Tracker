import os
import unittest

from calibrate import load_smart, section, seconds_after_departure, propose

SMART = os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'td-proxy', 'data', 'SMART-Q4-SO.json')


class Kinematics(unittest.TestCase):
    def test_train_is_at_the_start_when_it_departs(self):
        self.assertAlmostEqual(seconds_after_departure(1400, 115, 0), 0, places=1)

    def test_train_is_at_the_far_station_after_the_whole_run_time(self):
        self.assertAlmostEqual(seconds_after_departure(1400, 115, 1400), 115, places=1)

    def test_midpoint_is_half_the_run_when_accelerating_and_braking_alike(self):
        self.assertAlmostEqual(seconds_after_departure(1400, 115, 700, accel=0.8, brake=0.8), 57.5, places=1)

    def test_later_points_take_longer(self):
        times = [seconds_after_departure(1400, 115, x) for x in range(0, 1401, 100)]
        self.assertEqual(times, sorted(times))

    def test_rejects_a_run_too_fast_to_be_real(self):
        with self.assertRaises(ValueError):
            seconds_after_departure(1400, 20, 700)


class SmartSections(unittest.TestCase):
    def setUp(self):
        self.rows = load_smart(SMART)

    def test_finds_the_down_line_step_between_blackhorse_road_and_queens_road(self):
        s = section(self.rows, 'SO', 'BLKHORSRD', 'WLTHMSTQR', 'down')
        self.assertEqual((s['dep_step'], s['arr_step']), (('ST21', 'ST23'), ('ST21', 'ST23')))
        self.assertEqual((s['dep_offset'], s['arr_offset']), (-24, 88))
        self.assertEqual(s['run_seconds'], 112)

    def test_finds_the_up_line_step_from_queens_road_to_blackhorse_road(self):
        s = section(self.rows, 'SO', 'WLTHMSTQR', 'BLKHORSRD', 'up')
        self.assertEqual(s['dep_step'], ('ST22', 'ST20'))
        self.assertEqual(s['run_seconds'], 108)

    def test_needs_a_measured_gap_when_departure_and_arrival_are_different_steps(self):
        s = section(self.rows, 'Q4', 'WALTHMSWC', 'WOOD ST', 'down')
        self.assertEqual((s['dep_step'], s['arr_step']), (('1415', '1419'), ('1419', '1421')))
        self.assertIsNone(s['run_seconds'])


class Proposals(unittest.TestCase):
    def setUp(self):
        self.rows = load_smart(SMART)

    def test_reproduces_the_hand_calibrated_east_avenue_northbound_figure(self):
        p = propose(self.rows, 'Q4', 'WALTHMSWC', 'WOOD ST', 'down', distance_m=1374, viewpoint_m=390, gap_seconds=70)
        self.assertEqual(p['berth_step'], {'fromBerth': '1415', 'toBerth': '1419'})
        self.assertTrue(20 <= p['seconds_to_viewpoint'] <= 30, p)

    def test_proposes_a_step_and_timing_for_northcote_road_outbound(self):
        p = propose(self.rows, 'SO', 'BLKHORSRD', 'WLTHMSTQR', 'down', distance_m=1416, viewpoint_m=785)
        self.assertEqual(p['berth_step'], {'fromBerth': 'ST21', 'toBerth': 'ST23'})
        self.assertTrue(34 <= p['seconds_to_viewpoint'] <= 39, p)
        low, high = p['range']
        self.assertTrue(low <= p['seconds_to_viewpoint'] <= high)


if __name__ == '__main__':
    unittest.main()
