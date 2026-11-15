"""Synthetic, controller-independent sampled facing simulation tests."""
import unittest

from ezcam.core import Move, Plan, Setup, Tool, plan_facing
from ezcam.stock_sim import simulate_facing


class StockSimulationTests(unittest.TestCase):
    def test_facing_removes_requested_depth(self):
        plan = plan_facing(Setup(30, 20, 1.0), Tool(
            diameter_mm=10, stepover_ratio=0.5, stepdown_mm=0.5))
        result = simulate_facing(plan, cell_mm=1.0)
        self.assertEqual((result.columns, result.rows), (30, 20))
        self.assertAlmostEqual(result.target_mm3, 600)
        self.assertAlmostEqual(result.removed_mm3, 600)
        self.assertAlmostEqual(result.remaining_mm3, 0)
        self.assertAlmostEqual(result.target_coverage, 1)
        self.assertEqual(result.warnings, ())

    def test_unmachined_stock_is_reported(self):
        setup = Setup(20, 20, 1)
        tool = Tool(diameter_mm=2)
        moves = (
            Move("rapid", -2, -2, 5),
            Move("feed", -2, -2, -1, 100),
            Move("feed", 2, -2, -1, 200),
            Move("rapid", 2, -2, 5),
        )
        result = simulate_facing(Plan(setup, tool, moves, 1), 1)
        self.assertEqual(result.target_coverage, 0)
        self.assertEqual(result.removed_mm3, 0)
        self.assertEqual(result.remaining_mm3, 400)
        self.assertTrue(result.warnings)

    def test_edge_cell_areas_and_grid_limit(self):
        plan = plan_facing(Setup(10.5, 5.5, 0.5), Tool(diameter_mm=6))
        result = simulate_facing(plan, 2)
        self.assertAlmostEqual(result.target_mm3, 10.5 * 5.5 * 0.5)
        self.assertLessEqual(result.removed_mm3, result.target_mm3 + 1e-8)
        with self.assertRaises(ValueError):
            simulate_facing(plan, 0.01, max_cells=100)

    def test_overcut_does_not_hide_unmachined_stock(self):
        setup = Setup(10, 10, 1)
        tool = Tool(diameter_mm=2)
        moves = (
            Move("rapid", 1, 1, 5),
            Move("feed", 1, 1, -2, 100),
            Move("feed", 3, 1, -2, 100),
            Move("rapid", 3, 1, 5),
        )
        # Plan validation must reject an overcut before simulation.
        with self.assertRaisesRegex(ValueError, "below the requested facing depth"):
            Plan(setup, tool, moves, 1)

        # A legal partial pass still must report unmachined stock independently.
        legal_moves = tuple(
            Move(move.mode, move.x, move.y, max(move.z, -1), move.feed_mm_min)
            for move in moves
        )
        result = simulate_facing(Plan(setup, tool, legal_moves, 1), 1)
        self.assertGreater(result.removed_mm3, 0)
        self.assertGreater(result.remaining_mm3, 0)
        self.assertLess(result.target_coverage, 1)
        self.assertTrue(any("above the requested" in w for w in result.warnings))

    def test_detects_unsafe_lateral_rapid(self):
        setup = Setup(10, 10, 1)
        tool = Tool(diameter_mm=4)
        moves = (Move("rapid", 0, 0, 5),
                 Move("feed", 0, 0, -1, 100),
                 Move("rapid", 5, 5, 5))
        result = simulate_facing(Plan(setup, tool, moves, 1))
        self.assertTrue(any("Rapid" in warning for warning in result.warnings))


if __name__ == "__main__":
    unittest.main()
