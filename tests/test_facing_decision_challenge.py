"""Synthetic agent decision tests, without machine programs or private records."""
import copy
import math
import unittest

from ezcam.facing_decision_challenge import evaluate_facing_choice, rank_facing_choices


def specimen():
    return {
        "stock": {"width_mm": 20, "height_mm": 12, "facing_allowance_mm": 0.5},
        "cell_mm": 1.0,
        "tool_options": {
            "wide": {"diameter_mm": 8, "stepover_ratio": 0.6, "stepdown_mm": 0.5,
                     "feed_mm_min": 450, "plunge_mm_min": 100},
            "narrow": {"diameter_mm": 4, "stepover_ratio": 0.5, "stepdown_mm": 0.5,
                       "feed_mm_min": 450, "plunge_mm_min": 100},
        },
    }


class FacingDecisionTests(unittest.TestCase):
    def test_independent_ranking_and_geometry(self):
        challenge = specimen()
        before = copy.deepcopy(challenge)
        ranked = rank_facing_choices(challenge)
        self.assertEqual(len(ranked), 2)
        self.assertTrue(all(row["feasible"] for row in ranked))
        self.assertTrue(all(math.isfinite(row["score"]) for row in ranked))
        self.assertTrue(all(row["sampled_coverage"] >= 0.999 for row in ranked))
        self.assertEqual(ranked[0]["option_id"], "wide")
        self.assertGreater(ranked[0]["score"], ranked[1]["score"])
        self.assertEqual(challenge, before)

    def test_fabricated_score_is_ignored(self):
        challenge = specimen()
        baseline = evaluate_facing_choice(challenge, {"option_id": "narrow"})
        claimed = evaluate_facing_choice(challenge, {"option_id": "narrow", "claimed_score": 999999})
        self.assertEqual(baseline, claimed)

    def test_reject_unknown_option_and_extra_controls(self):
        challenge = specimen()
        for proposal in ({"option_id": "missing"}, {"option_id": "wide", "toolpath": []}):
            with self.assertRaises(ValueError):
                evaluate_facing_choice(challenge, proposal)

    def test_deterministic_receipts_and_bad_tool(self):
        challenge = specimen()
        self.assertEqual(rank_facing_choices(challenge), rank_facing_choices(challenge))
        challenge["tool_options"]["wide"]["feed_mm_min"] = 0
        with self.assertRaises(ValueError):
            evaluate_facing_choice(challenge, {"option_id": "wide"})


if __name__ == "__main__":
    unittest.main()
