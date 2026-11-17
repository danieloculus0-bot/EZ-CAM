"""Offline, controller-independent facing stock preview from JSON input.

Input schema:
{"stock": {"width_mm": 30, "height_mm": 20, "facing_allowance_mm": 1},
 "tool": {"diameter_mm": 10}, "cell_mm": 1}
No controller programs are generated.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from dataclasses import asdict
from pathlib import Path

from .core import Setup, Tool, plan_facing
from .stock_sim import simulate_facing


def evaluate(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Input must be a JSON object")
    stock = payload.get("stock")
    if not isinstance(stock, dict):
        raise ValueError("stock must be an object")
    tool = payload.get("tool", {})
    if not isinstance(tool, dict):
        raise ValueError("tool must be an object")
    setup = Setup(**stock)
    cutter = Tool(**tool)
    cell_mm = payload.get("cell_mm", 1.0)
    max_cells = payload.get("max_cells", 250000)
    plan = plan_facing(setup, cutter)
    result = simulate_facing(plan, cell_mm=cell_mm, max_cells=max_cells)
    return {
        "operation": "facing_stock_preview",
        "units": "mm",
        "machine_verified": False,
        "passes": plan.passes,
        "move_count": len(plan.moves),
        "simulation": asdict(result),
    }


def heightmap_csv(result: dict) -> str:
    """Export sampled surface heights as a rectangular, row-major CSV grid."""
    sim = result["simulation"]
    heights = sim["heights_mm"]
    rows, cols = sim["rows"], sim["columns"]
    if len(heights) != rows or any(len(row) != cols for row in heights):
        raise ValueError("Simulation heightmap dimensions are inconsistent")
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow([f"column_{i}_height_mm" for i in range(cols)])
    writer.writerows(heights)
    return buffer.getvalue()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline sampled facing stock simulation")
    parser.add_argument("input", nargs="?", default="-", help="JSON file or - for stdin")
    parser.add_argument("-o", "--output", help="Write result to JSON file instead of stdout")
    parser.add_argument("--heightmap-csv", help="Export sampled remaining-stock surface as CSV")
    args = parser.parse_args(argv)
    try:
        source = sys.stdin.read() if args.input == "-" else Path(args.input).read_text(encoding="utf-8")
        result = evaluate(json.loads(source))
        rendered = json.dumps(result, indent=2, allow_nan=False) + "\n"
        if args.output:
            Path(args.output).write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
        if csv_data is not None:
            Path(args.heightmap_csv).write_text(csv_data, encoding="utf-8", newline="")
    except (ValueError, TypeError, KeyError, OSError, json.JSONDecodeError) as exc:
        print(f"Stock preview failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
