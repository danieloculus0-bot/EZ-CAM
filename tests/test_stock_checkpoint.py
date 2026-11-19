"""Acceptance tests for move-indexed material removal checkpoints."""
import unittest

from ezcam.core import Setup, Tool, plan_facing
from ezcam.stock_sim import simulate_facing
from ezcam.stock_preview_cli import evaluate


class StockCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.setup = Setup(width_mm=30, height_mm=20, facing_allowance_mm=1)
        self.tool = Tool(diameter_mm=10)
        self.plan = plan_facing(self.setup, self.tool)

    def test_first_move_removes_nothing(self):
        result = simulate_facing(self.plan, through_move=0)
        self.assertEqual(result.removed_mm3, 0)
        self.assertEqual(result.target_coverage, 0)

    def test_last_checkpoint_matches_full_simulation(self):
        full = simulate_facing(self.plan)
        partial = simulate_facing(self.plan, through_move=len(self.plan.moves)-1)
        self.assertEqual(full, partial)

    def test_removed_volume_never_decreases(self):
        indexes = sorted(set([0, len(self.plan.moves)//3, 2*len(self.plan.moves)//3, len(self.plan.moves)-1]))
        volumes = [simulate_facing(self.plan, through_move=i).removed_mm3 for i in indexes]
        self.assertEqual(volumes, sorted(volumes))
        self.assertGreater(volumes[-1], 0)

    def test_invalid_indices_rejected(self):
        for value in (-1, len(self.plan.moves), 1.5, True, "3"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    simulate_facing(self.plan, through_move=value)

    def test_cli_reports_selected_checkpoint(self):
        result = evaluate({"stock": {"width_mm": 30, "height_mm": 20, "facing_allowance_mm": 1},
                           "tool": {"diameter_mm": 10}, "through_move": 0})
        self.assertEqual(result["simulated_through_move"], 0)
        self.assertEqual(result["simulation"]["removed_mm3"], 0)


if __name__ == "__main__":
    unittest.main()
