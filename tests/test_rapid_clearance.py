"""Regression checks for rapid-height validation in review-only facing plans."""
import unittest

from ezcam.core import Move, Plan, Setup, Tool, plan_facing


class FacingRapidClearanceTests(unittest.TestCase):
    def setUp(self):
        self.setup = Setup(30.0, 20.0, 1.0)
        self.tool = Tool()

    def test_generated_plan_keeps_all_rapids_clear(self):
        plan = plan_facing(self.setup, self.tool)
        self.assertTrue(any(move.mode == "feed" and move.z < 0 for move in plan.moves))
        self.assertTrue(all(
            abs(move.z - self.tool.clearance_mm) < 1e-7
            for move in plan.moves if move.mode == "rapid"
        ))

    def test_rejects_intermediate_rapid_at_cutting_depth(self):
        plan = plan_facing(self.setup, self.tool)
        moves = list(plan.moves)
        moves.insert(3, Move("rapid", moves[2].x, moves[2].y, -0.5))
        with self.assertRaisesRegex(ValueError, "Every rapid move"):
            Plan(self.setup, self.tool, tuple(moves), plan.passes)

    def test_rejects_intermediate_rapid_at_wrong_positive_height(self):
        plan = plan_facing(self.setup, self.tool)
        moves = list(plan.moves)
        moves.insert(3, Move("rapid", moves[2].x, moves[2].y, 1.0))
        with self.assertRaisesRegex(ValueError, "Every rapid move"):
            Plan(self.setup, self.tool, tuple(moves), plan.passes)


if __name__ == "__main__":
    unittest.main()
