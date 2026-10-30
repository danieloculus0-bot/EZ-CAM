import math
import unittest
from ezcam.core import Setup, Tool, plan_facing
from ezcam.post import review_gcode, export_plan_json


class FacingPlanTests(unittest.TestCase):
    def test_safe_start_and_end_and_exact_final_depth(self):
        tool = Tool(diameter_mm=10, stepdown_mm=0.4)
        plan = plan_facing(Setup(120, 70, 1.1), tool)
        self.assertEqual(plan.passes, 3)
        self.assertEqual(plan.moves[0].z, 5)
        self.assertEqual(plan.moves[-1].z, 5)
        self.assertAlmostEqual(min(x.z for x in plan.moves), -1.1)
        self.assertTrue(all(x.z >= -1.1 - 1e-8 for x in plan.moves))

    def test_every_plunge_is_outside_stock(self):
        plan = plan_facing(Setup(60, 40, 1), Tool(diameter_mm=8, stepdown_mm=0.3))
        for i, move in enumerate(plan.moves[1:], 1):
            prev = plan.moves[i-1]
            if move.mode == "feed" and move.z < prev.z:
                self.assertLess(move.x, -plan.tool.diameter_mm / 2)

    def test_each_cut_depth_covers_full_stock_width_and_height(self):
        plan = plan_facing(Setup(40, 25, 1), Tool(diameter_mm=6, stepover_ratio=.65))
        cut_points = [m for m in plan.moves if m.mode == "feed"]
        self.assertLess(min(m.x for m in cut_points), 0)
        self.assertGreater(max(m.x for m in cut_points), 40)
        radius = plan.tool.diameter_mm / 2
        self.assertLessEqual(min(m.y for m in cut_points) - radius, 0)
        self.assertGreaterEqual(max(m.y for m in cut_points) + radius, 25)

    def test_offsets_are_applied_only_to_export(self):
        plan = plan_facing(Setup(100, 60, 1, origin="center"), Tool())
        gcode = review_gcode(plan)
        first = next(line for line in gcode.splitlines() if line.startswith("G0 X"))
        self.assertIn("X-56.000", first)
        self.assertIn("Y-32.500", first)
        self.assertEqual(plan.moves[0].x, -6)

    def test_invalid_plans_fail_closed(self):
        with self.assertRaises(ValueError):
            Tool(diameter_mm=0)
        with self.assertRaises(ValueError):
            Tool(stepover_ratio=.95)
        with self.assertRaises(ValueError):
            Setup(100, 0, 1)
        with self.assertRaises(ValueError):
            Setup(100, 50, -1)
        with self.assertRaises(ValueError):
            Setup(100, 50, float("nan"))
        with self.assertRaises(ValueError):
            plan_facing(Setup(1000000, 1000000, 3), Tool(diameter_mm=0.001, stepover_ratio=.01))

    def test_export_never_claims_machine_ready(self):
        plan = plan_facing(Setup(30, 20, 1), Tool(), "a" * 64)
        review = review_gcode(plan)
        self.assertIn("REVIEW ONLY", review)
        self.assertIn("NO CONTROLLER POST", review)
        self.assertIn("a" * 64, review)
        self.assertFalse(any(line.startswith("M3 ") or line == "M3" for line in review.splitlines()))
        self.assertNotIn("M8", review)
        self.assertIn('"machine_verified": false', export_plan_json(plan))

if __name__ == "__main__":
    unittest.main()
