"""JSON stdin/stdout adapter for synthetic facing decisions.

Example:
  python -m ezcam.facing_challenge_cli < synthetic_request.json

This invokes the existing deterministic planner and sampled stock evaluator.
It does not invoke BEAN Core, a CNC controller, or an external service.
"""
from __future__ import annotations

import json
import sys

from .facing_decision_challenge import evaluate_facing_choice, rank_facing_choices

MAX_REQUEST_BYTES = 1_000_000


def handle_request(request: dict) -> dict:
    """Return a stable receipt with independently computed outcomes."""
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    if set(request) - {"action", "challenge", "proposal"}:
        raise ValueError("unexpected request fields")
    action = request.get("action")
    challenge = request.get("challenge")
    if action == "evaluate":
        if set(request) != {"action", "challenge", "proposal"}:
            raise ValueError("evaluate requires challenge and proposal")
        return {"action": action, "result": evaluate_facing_choice(challenge, request["proposal"])}
    if action == "rank":
        if set(request) != {"action", "challenge"}:
            raise ValueError("rank requires challenge without proposal")
        return {"action": action, "results": rank_facing_choices(challenge)}
    raise ValueError("action must be evaluate or rank")


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        if len(raw) > MAX_REQUEST_BYTES:
            raise ValueError("request exceeds 1 MB")
        request = json.loads(raw)
        receipt = {"ok": True, **handle_request(request)}
        exit_code = 0
    except (ValueError, TypeError, OverflowError, KeyError) as exc:
        receipt = {"ok": False, "error": str(exc)}
        exit_code = 2
    print(json.dumps(receipt, sort_keys=True, allow_nan=False))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
