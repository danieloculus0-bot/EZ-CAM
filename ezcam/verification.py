"""Evidence-backed, machine-independent acceptance report for a facing preview.

Reports are advisory: a sampled height field cannot establish machine safety.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math

from .core import Plan
from .motion import estimate_motion
from .stock_sim import simulate_facing


@dataclass(frozen=True)
class FacingAcceptance:
    operation: str
    source_sha256: str | None
    stock_width_mm: float
    stock_height_mm: float
    requested_depth_mm: float
    cell_mm: float
    sampled_coverage: float
    removed_mm3: float
    remaining_mm3: float
    feed_minutes: float
    rapid_distance_mm: float
    passed_sampled_checks: bool
    findings: tuple[str, ...]


def assess_facing(plan: Plan, *, cell_mm: float = 1.0,
                  min_coverage: float = 0.999, max_cells: int = 250_000) -> FacingAcceptance:
    """Check sampled depth coverage and rapid motion, without approving G-code.

    A failed/invalid simulation raises instead of fabricating a pass. A passing
    result is a sampled geometric check only, not collision or controller proof.
    """
    if not math.isfinite(min_coverage) or not 0 < min_coverage <= 1:
        raise ValueError("min_coverage must be finite and in (0, 1]")
    stock = simulate_facing(plan, cell_mm=cell_mm, max_cells=max_cells)
    motion = estimate_motion(plan)
    findings = list(dict.fromkeys((*stock.warnings, *motion.warnings)))
    if stock.target_coverage < min_coverage:
        findings.append("Sampled facing coverage is below the required threshold")
    if stock.minimum_height_mm < -plan.setup.facing_allowance_mm - 1e-7:
        findings.append("Sampled cutter sweep exceeds requested depth")
    if not plan.source_sha256:
        findings.append("No source CAD checksum recorded")
    passed = (
        stock.target_coverage >= min_coverage
        and stock.minimum_height_mm >= -plan.setup.facing_allowance_mm - 1e-7
        and not stock.warnings
        and not motion.warnings
    )
    return FacingAcceptance(
        plan.operation, plan.source_sha256, plan.setup.width_mm,
        plan.setup.height_mm, plan.setup.facing_allowance_mm, stock.cell_mm,
        stock.target_coverage, stock.removed_mm3, stock.remaining_mm3,
        motion.feed_minutes, motion.rapid_distance_mm, passed,
        tuple(dict.fromkeys(findings)),
    )


def acceptance_json(plan: Plan, **kwargs: object) -> str:
    """Stable JSON receipt for operator review and external test harnesses."""
    return json.dumps(asdict(assess_facing(plan, **kwargs)), indent=2, sort_keys=True)
