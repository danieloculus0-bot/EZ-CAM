"""Synthetic facing acceptance tests, no proprietary CAD or machine commands."""
import json
import unittest
from dataclasses import replace

from ezcam.core import Move, Plan, Setup, Tool, plan_facing
from ezcam.verification import acceptance_json, assess_facing


class FacingAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.plan = plan_facing(
            Setup(20, 12, 0.5),
            Tool(diameter_mm=6, stepover_ratio=0.5, stepdown_mm=0.5),
            source_sha256="a" * 64,
        )

    def test_planned_facing_covers_stock(self):
        result = assess_facing(self.plan, cell_mm=1)
        self.assertTrue(result.passed_sampled_checks, result.findings)
        self.assertAlmostEqual(result.sampled_coverage, 1)
        self.assertAlmostEqual(result.removed_mm3, 120)
        self.assertEqual(result.remaining_mm3, 0)

    def test_missing_cut_is_not_accepted(self):
        first = self.plan.moves[0]
        last = self.plan.moves[-1]
        incomplete = Plan(self.plan.setup, self.plan.tool, (first, last), 0)
        result = assess_facing(incomplete)
        self.assertFalse(result.passed_sampled_checks)
        self.assertLess(result.sampled_coverage, 1)

    def test_rapid_xy_below_clearance_fails(self):
        moves = list(self.plan.moves)
        start = moves[0]
        moves.insert(1, Move("rapid", start.x + 1, start.y, 0))
        altered = replace(self.plan, moves=tuple(moves))
        result = assess_facing(altered)
        self.assertFalse(result.passed_sampled_checks)
        self.assertTrue(any("Rapid" in finding for finding in result.findings))

    def test_json_receipt_and_invalid_threshold(self):
        receipt = json.loads(acceptance_json(self.plan))
        self.assertEqual(receipt["operation"], "face")
        self.assertEqual(receipt["source_sha256"], "a" * 64)
        with self.assertRaises(ValueError):
            assess_facing(self.plan, min_coverage=float("nan"))


if __name__ == "__main__":
    unittest.main()
