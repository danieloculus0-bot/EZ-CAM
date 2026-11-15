"""Offline facing stock visualization and evidence export (synthetic dimensions only)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape

from .core import Setup, Tool, plan_facing
from .stock_sim import StockPreview, simulate_facing


def render_svg(preview: StockPreview, width_mm: float, height_mm: float,
               target_mm: float) -> str:
    """Render sampled remaining stock as an SVG heatmap; darker = more stock."""
    if not 0 <= preview.target_coverage <= 1:
        raise ValueError("Invalid stock coverage")
    scale = min(900 / width_mm, 650 / height_mm)
    w, h = width_mm * scale, height_mm * scale
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w:.3f} {h + 50:.3f}" role="img">',
        '<title>EZ-CAM sampled remaining stock</title>',
        f'<desc>Target coverage {preview.target_coverage:.2%}; '
        'dark cells indicate unmachined material</desc>',
        f'<rect width="{w:.3f}" height="{h:.3f}" fill="#b8e2d4"/>',
    ]
    for j, row in enumerate(preview.heights_mm):
        y = j * preview.cell_mm
        ch = min(preview.cell_mm, height_mm - y)
        for i, z in enumerate(row):
            remaining = max(0.0, min(1.0, (target_mm + z) / target_mm))
            if remaining <= 1e-9:
                continue
            x = i * preview.cell_mm
            cw = min(preview.cell_mm, width_mm - x)
            shade = round(220 - 170 * remaining)
            parts.append(
                f'<rect x="{x*scale:.3f}" y="{y*scale:.3f}" '
                f'width="{cw*scale:.3f}" height="{ch*scale:.3f}" '
                f'fill="rgb({shade},{shade},{shade})"/>'
            )
    parts.append(
        f'<text x="4" y="{h+22:.3f}" font-size="15" fill="#333">'
        f'Coverage: {preview.target_coverage:.1%}; '
        f'remaining: {preview.remaining_mm3:.2f} mm3</text>'
    )
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline sampled facing stock report")
    parser.add_argument("--width", type=float, required=True)
    parser.add_argument("--height", type=float, required=True)
    parser.add_argument("--allowance", type=float, required=True)
    parser.add_argument("--tool", type=float, default=10.0)
    parser.add_argument("--stepover", type=float, default=0.6)
    parser.add_argument("--stepdown", type=float, default=0.5)
    parser.add_argument("--cell", type=float, default=1.0)
    parser.add_argument("--svg", type=Path, required=True)
    parser.add_argument("--json", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.svg.resolve() == args.json.resolve():
        parser.error("SVG and JSON output paths must differ")
    setup = Setup(args.width, args.height, args.allowance)
    tool = Tool(diameter_mm=args.tool, stepover_ratio=args.stepover,
                stepdown_mm=args.stepdown)
    plan = plan_facing(setup, tool)
    preview = simulate_facing(plan, cell_mm=args.cell)
    report = {
        "model": "sampled-2.5d-flat-cutter",
        "units": "mm",
        "grid": {"rows": preview.rows, "columns": preview.columns,
                 "cell_mm": preview.cell_mm},
        "stock": {"width_mm": setup.width_mm, "height_mm": setup.height_mm,
                  "target_depth_mm": setup.facing_allowance_mm},
        "tool": {"diameter_mm": tool.diameter_mm},
        "target_coverage": preview.target_coverage,
        "removed_mm3": preview.removed_mm3,
        "remaining_mm3": preview.remaining_mm3,
        "target_mm3": preview.target_mm3,
        "warnings": list(preview.warnings),
        "verified_for_machine_execution": False,
    }
    args.svg.write_text(render_svg(preview, setup.width_mm, setup.height_mm,
                                   setup.facing_allowance_mm), encoding="utf-8")
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
