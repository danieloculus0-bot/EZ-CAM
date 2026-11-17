"""Review-only, controller-independent 3D facing motion trace.

The first position is a target, not a known machine start. Rapids have no
time estimate. Feed durations are geometric distance divided by programmed
feed; no acceleration, blending or machine controller is modeled.
"""
from __future__ import annotations

import csv
import io
import math

from .core import Plan


def motion_trace(plan: Plan) -> list[dict]:
    if not plan.moves:
        raise ValueError("A nonempty facing plan is required")
    rows = []
    cumulative_feed_min = 0.0
    cumulative_feed_mm = 0.0
    cumulative_rapid_mm = 0.0
    for index, move in enumerate(plan.moves):
        if index:
            previous = plan.moves[index - 1]
            distance = math.dist((previous.x, previous.y, previous.z),
                                 (move.x, move.y, move.z))
            if move.mode == "feed":
                duration = distance / move.feed
                cumulative_feed_min += duration
                cumulative_feed_mm += distance
            else:
                duration = None
                cumulative_rapid_mm += distance
        else:
            distance = 0.0
            duration = None
        rows.append({
            "move_index": index, "mode": move.mode,
            "x_mm": move.x, "y_mm": move.y, "z_mm": move.z,
            "feed_mm_min": move.feed, "segment_distance_mm": distance,
            "segment_feed_minutes": duration,
            "cumulative_feed_minutes": cumulative_feed_min,
            "cumulative_feed_distance_mm": cumulative_feed_mm,
            "cumulative_rapid_distance_mm": cumulative_rapid_mm,
        })
    if not all(math.isfinite(v) for row in rows for v in row.values()
               if type(v) in (int, float)):
        raise ValueError("Nonfinite motion trace")
    return rows


def motion_trace_csv(plan: Plan) -> str:
    rows = motion_trace(plan)
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()
