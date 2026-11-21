"""Subprocess acceptance for the external synthetic facing challenge contract."""
import json
import subprocess
import sys
import unittest

from test_facing_decision_challenge import specimen
from ezcam.facing_decision_challenge import evaluate_facing_choice, rank_facing_choices


def invoke(request):
    return subprocess.run(
        [sys.executable, "-m", "ezcam.facing_challenge_cli"],
        input=json.dumps(request), text=True, capture_output=True, check=False,
    )


class FacingChallengeCLITests(unittest.TestCase):
    def test_external_agent_choice_matches_solver(self):
        challenge = specimen()
        request = {"action": "evaluate", "challenge": challenge,
                   "proposal": {"option_id": "wide", "claimed_score": 1e20}}
        completed = invoke(request)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        receipt = json.loads(completed.stdout)
        self.assertEqual(receipt["result"],
                         evaluate_facing_choice(challenge, {"option_id": "wide"}))
        self.assertTrue(receipt["ok"])
        self.assertEqual(completed.stdout, invoke(request).stdout)

    def test_external_ranking_matches_internal_evaluator(self):
        challenge = specimen()
        completed = invoke({"action": "rank", "challenge": challenge})
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["results"], rank_facing_choices(challenge))

    def test_invalid_proposal_has_machine_readable_failure(self):
        completed = invoke({"action": "evaluate", "challenge": specimen(),
                            "proposal": {"option_id": "missing"}})
        self.assertEqual(completed.returncode, 2)
        receipt = json.loads(completed.stdout)
        self.assertFalse(receipt["ok"])
        self.assertIn("unknown option_id", receipt["error"])

    def test_reject_extra_fields(self):
        completed = invoke({"action": "rank", "challenge": specimen(), "proposal": {}})
        self.assertEqual(completed.returncode, 2)
        self.assertFalse(json.loads(completed.stdout)["ok"])

    def test_malformed_json_has_machine_readable_failure(self):
        completed = subprocess.run(
            [sys.executable, "-m", "ezcam.facing_challenge_cli"],
            input="{broken", text=True, capture_output=True, check=False,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertFalse(json.loads(completed.stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
