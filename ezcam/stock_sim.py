"""Deterministic sampled stock-removal preview for flat-end-mill facing.

This is a 2.5D height-field approximation, not collision detection or
machine-ready verification. All dimensions are millimetres.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

from .core import Plan, positive


@dataclass(frozen=True)
class StockPreview:
    cell_mm: float
    columns: int
    rows: int
    heights_mm: tuple[tuple[float, ...], ...]
    removed_mm3: float
    remaining_mm3: float
    target_mm3: float
    target_coverage: float
    minimum_height_mm: float
    maximum_height_mm: float
    warnings: tuple[str, ...]


def _distance_squared(px: float, py: float, ax: float, ay: float,
                      bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0.0 else max(
        0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2)
    )
    return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2


def simulate_facing(plan: Plan, cell_mm: float = 1.0,
                    max_cells: int = 250_000) -> StockPreview:
    """Sweep a flat cutter disk over a sampled XY height field.

    A feed segment removes material at its *lower endpoint* Z. This is
    conservative for a downward ramp, but is not a continuous ramp solver.
    The result is a visualization/diagnostic, never a machine safety approval.
    """
    positive(cell_mm, "Cell pitch")
    if not isinstance(max_cells, int) or max_cells < 1:
        raise ValueError("max_cells must be a positive integer")
    width, height = plan.setup.width_mm, plan.setup.height_mm
    nx, ny = math.ceil(width / cell_mm), math.ceil(height / cell_mm)
    if nx * ny > max_cells:
        raise ValueError("Simulation grid exceeds max_cells; increase cell_mm")
    # Actual edge cells may be narrower; integrate their actual area.
    xs = [(i * cell_mm + min((i + 1) * cell_mm, width)) / 2 for i in range(nx)]
    ys = [(j * cell_mm + min((j + 1) * cell_mm, height)) / 2 for j in range(ny)]
    xw = [min(cell_mm, width - i * cell_mm) for i in range(nx)]
    yw = [min(cell_mm, height - j * cell_mm) for j in range(ny)]
    heights = [[0.0] * nx for _ in range(ny)]
    radius = plan.tool.diameter_mm / 2
    radius2 = radius * radius
    warnings: list[str] = []
    for previous, current in zip(plan.moves, plan.moves[1:]):
        if current.mode == "rapid":
            if current.z < 0 or (previous.z < 0 and (current.x != previous.x or current.y != previous.y)):
                warnings.append("Rapid traverses at or below stock top; inspect setup")
            continue
        depth = min(0.0, previous.z, current.z)
        if depth >= 0:
            continue
        # Limit the scan to the cutter's swept bounding rectangle.
        lo_x, hi_x = min(previous.x, current.x) - radius, max(previous.x, current.x) + radius
        lo_y, hi_y = min(previous.y, current.y) - radius, max(previous.y, current.y) + radius
        i0 = max(0, math.floor(lo_x / cell_mm) - 1)
        i1 = min(nx, math.ceil(hi_x / cell_mm) + 1)
        j0 = max(0, math.floor(lo_y / cell_mm) - 1)
        j1 = min(ny, math.ceil(hi_y / cell_mm) + 1)
        for j in range(j0, j1):
            for i in range(i0, i1):
                if _distance_squared(xs[i], ys[j], previous.x, previous.y,
                                     current.x, current.y) <= radius2:
                    heights[j][i] = min(heights[j][i], depth)
    target = plan.setup.facing_allowance_mm
    removed = 0.0
    covered_area = 0.0
    total_area = width * height
    for j, row in enumerate(heights):
        for i, z in enumerate(row):
            area = xw[i] * yw[j]
            removed += -z * area
            if z <= -target + 1e-7:
                covered_area += area
    target_volume = total_area * target
    remaining = max(0.0, target_volume - removed)
    coverage = min(1.0, covered_area / total_area)
    if coverage < 1.0 - 1e-8:
        warnings.append("Sampled stock contains areas above the requested facing depth")
    if any(z < -target - 1e-7 for row in heights for z in row):
        warnings.append("Sampled tool sweep exceeds requested facing depth")
    return StockPreview(cell_mm, nx, ny, tuple(tuple(r) for r in heights),
                        removed, remaining, target_volume, coverage,
                        min(min(r) for r in heights), max(max(r) for r in heights),
                        tuple(dict.fromkeys(warnings)))
