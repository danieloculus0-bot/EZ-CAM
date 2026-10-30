"""Review-only coordinate program output; NO validated machine postprocessor."""
from __future__ import annotations

import json
from dataclasses import asdict
import math
from .core import Plan


def _fmt(number: float) -> str:
    if not math.isfinite(number):
        raise ValueError("Cannot post a nonfinite coordinate")
    # Keep G-code compact, and avoid '-0.000' coordinates.
    return f"{0.0 if abs(number) < 0.0005 else number:.3f}"


def review_gcode(plan: Plan) -> str:
    """Unverified G-code motion listing, intentionally without spindle start.

    Export as .txt only. The operator must choose a controller-specific
    postprocessor and verify offsets, fixtures, entry, feeds and simulation
    before generating an executable .nc program in a future phase.
    """
    dx, dy = plan.setup.offset_xy()
    lines = [
        "(EZ CAM V0.1 - REVIEW ONLY - NOT FOR MACHINE EXECUTION)",
        "(NO CONTROLLER POST / TOOL LENGTH / FIXTURE OR SPINDLE VALIDATION)",
        "(G54 Z0 IS TOP OF UNMACHINED STOCK)",
        f"(G54 XY ORIGIN: {plan.setup.origin.upper()})",
        f"(TOOL DIAMETER MM: {_fmt(plan.tool.diameter_mm)})",
        f"(MODEL SHA256: {plan.source_sha256 or 'SYNTHETIC DEMO'})",
        "(NEVER RUN THIS FILE ON A CNC MACHINE)",
        "G21 G17 G90 G94 G40 G49 G80",
        "G54",
    ]
    for move in plan.moves:
        cmd = "G0" if move.mode == "rapid" else "G1"
        line = f"{cmd} X{_fmt(move.x + dx)} Y{_fmt(move.y + dy)} Z{_fmt(move.z)}"
        if move.feed is not None:
            line += f" F{_fmt(move.feed)}"
        lines.append(line)
    lines.extend(("(REVIEW ENDS - NO MACHINE READY PROGRAM GENERATED)", "M30"))
    return "\n".join(lines) + "\n"


def export_plan_json(plan: Plan) -> str:
    return json.dumps({"schema": "ezcam.preview_plan.v1", "machine_verified": False, "plan": asdict(plan)}, indent=2) + "\n"
