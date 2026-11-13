"""Executable checks for geometric time estimates."""
import math
import unittest

from ezcam.core import Move, Plan, Setup, Tool, plan_facing
from ezcam.motion import estimate_motion


class MotionTests(unittest.TestCase):
    def test_facing_has_positive_feed_time(self):
        result = estimate_motion(plan_facing(Setup(20, 10, 1), Tool()))
        self.assertGreater(result.feed_distance_mm, 0)
        self.assertGreater(result.feed_minutes, 0)
        self.assertGreater(result.rapid_distance_mm, 0)
        self.assertEqual(result.warnings, ())

    def test_segment_length_and_feed_rate(self):
        setup = Setup(20, 20, 1)
        tool = Tool(clearance_mm=5)
        plan = Plan(setup, tool, (
            Move("rapid", 0, 0, 5),
            Move("feed", 0, 0, -1, 60),
            Move("feed", 3, 4, -1, 120),
            Move("rapid", 3, 4, 5),
        ), 1)
        result = estimate_motion(plan)
        self.assertAlmostEqual(result.feed_distance_mm, 11)
        self.assertAlmostEqual(result.feed_minutes, 6 / 60 + 5 / 120)
        self.assertEqual(result.rapid_moves, 1)
        self.assertEqual(result.feed_moves, 2)

    def test_rapid_xy_at_cutting_depth_warns(self):
        plan = Plan(Setup(20, 20, 1), Tool(), (
            Move("rapid", 0, 0, 5),
            Move("feed", 0, 0, -1, 100),
            Move("rapid", 4, 0, -1),
            Move("rapid", 4, 0, 5),
        ), 1)
        self.assertIn("Rapid XY travel below configured clearance",
                      estimate_motion(plan).warnings)


if __name__ == "__main__":
    unittest.main()
