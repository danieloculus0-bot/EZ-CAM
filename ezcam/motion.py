"""Feed-time and travel estimates for planned CAM motion.

These are geometric estimates only. Rapids have no assumed machine speed;
acceleration, controller blending, tool changes and spindle time are excluded.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

from .core import Plan


@dataclass(frozen=True)
class MotionEstimate:
    feed_distance_mm: float
    rapid_distance_mm: float
    feed_minutes: float
    rapid_moves: int
    feed_moves: int
    warnings: tuple[str, ...]


def estimate_motion(plan: Plan) -> MotionEstimate:
    """Measure 3D segments, including Z plunges and retracts.

    The first move is a positioning target without a known starting position.
    A rapid's travel is counted but its duration is intentionally unknown.
    """
    feed_distance = rapid_distance = feed_minutes = 0.0
    rapid_moves = feed_moves = 0
    warnings: list[str] = []
    clearance = plan.tool.clearance_mm
    for previous, current in zip(plan.moves, plan.moves[1:]):
        distance = math.dist((previous.x, previous.y, previous.z),
                             (current.x, current.y, current.z))
        if current.mode == "rapid":
            rapid_moves += 1
            rapid_distance += distance
            if (math.hypot(current.x - previous.x, current.y - previous.y) > 1e-9
                    and min(previous.z, current.z) < clearance - 1e-9):
                warnings.append("Rapid XY travel below configured clearance")
        else:
            feed_moves += 1
            feed_distance += distance
            feed_minutes += distance / current.feed
    if not math.isfinite(feed_minutes):
        raise ValueError("Nonfinite estimated machining time")
    return MotionEstimate(feed_distance, rapid_distance, feed_minutes,
                          rapid_moves, feed_moves, tuple(dict.fromkeys(warnings)))
