"""Synthetic facing-decision environment with independent stock-simulation feedback.

Agents choose an option identifier, never a toolpath, claimed score, or machine
program. This is a deterministic software challenge, not a BEAN Core connection.
"""
from __future__ import annotations

from dataclasses import asdict
import math

from .core import Setup, Tool, plan_facing
from .verification import assess_facing


def evaluate_facing_choice(challenge: dict, proposal: dict) -> dict:
    """Evaluate one proposed option using the existing planner and stock checker."""
    if not isinstance(challenge, dict) or not isinstance(proposal, dict):
        raise ValueError("challenge and proposal must be objects")
    if set(proposal) - {"option_id", "claimed_score"}:
        raise ValueError("unexpected proposal fields")
    options = challenge.get("tool_options")
    option_id = proposal.get("option_id")
    if not isinstance(options, dict) or not options:
        raise ValueError("tool_options must be a nonempty object")
    if not isinstance(option_id, str) or option_id not in options:
        raise ValueError("unknown option_id")
    stock = challenge.get("stock")
    if not isinstance(stock, dict) or set(stock) != {"width_mm", "height_mm", "facing_allowance_mm"}:
        raise ValueError("stock must specify width_mm, height_mm and facing_allowance_mm")
    params = options[option_id]
    if not isinstance(params, dict) or set(params) != {"diameter_mm", "stepover_ratio", "stepdown_mm", "feed_mm_min", "plunge_mm_min"}:
        raise ValueError("tool option has unexpected fields")
    # Explicitly restrict the challenge to a fixed, synthetic stock and tools.
    setup = Setup(**stock)
    tool = Tool(**params)
    plan = plan_facing(setup, tool, source_sha256="0" * 64)
    report = assess_facing(plan, cell_mm=challenge.get("cell_mm", 1.0))
    if not math.isfinite(report.feed_minutes) or report.feed_minutes < 0:
        raise ValueError("invalid simulated feed time")
    passed = report.passed_sampled_checks
    score = 1.0 / (1.0 + report.feed_minutes) if passed else 0.0
    return {
        "option_id": option_id,
        "feasible": passed,
        "score": score,
        "feed_minutes": report.feed_minutes,
        "sampled_coverage": report.sampled_coverage,
        "removed_mm3": report.removed_mm3,
        "findings": list(report.findings),
        "evaluator": "ezcam.verification.assess_facing",
    }


def rank_facing_choices(challenge: dict) -> list[dict]:
    """Compute the independently scored ranking for all supplied options."""
    options = challenge.get("tool_options")
    if not isinstance(options, dict) or not options:
        raise ValueError("tool_options must be a nonempty object")
    return sorted(
        (evaluate_facing_choice(challenge, {"option_id": key}) for key in options),
        key=lambda item: (-item["score"], item["feed_minutes"], item["option_id"]),
    )
