"""Pure, deterministic 2.5D geometry and toolpath planning (millimetres)."""
from __future__ import annotations

from dataclasses import dataclass
import math


def positive(value: float, label: str) -> float:
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f"{label} must be a positive, finite number")
    return number


@dataclass(frozen=True)
class Tool:
    diameter_mm: float = 10.0
    stepover_ratio: float = 0.6
    stepdown_mm: float = 0.5
    feed_mm_min: float = 450.0
    plunge_mm_min: float = 100.0
    clearance_mm: float = 5.0

    def __post_init__(self) -> None:
        for key in ("diameter_mm", "stepdown_mm", "feed_mm_min", "plunge_mm_min", "clearance_mm"):
            positive(getattr(self, key), key)
        if not math.isfinite(self.stepover_ratio) or not 0 < self.stepover_ratio <= 0.8:
            raise ValueError("Stepover ratio must be greater than 0 and at most 0.8")


@dataclass(frozen=True)
class Setup:
    width_mm: float
    height_mm: float
    facing_allowance_mm: float
    origin: str = "front-left"

    def __post_init__(self) -> None:
        positive(self.width_mm, "Stock width")
        positive(self.height_mm, "Stock height")
        positive(self.facing_allowance_mm, "Facing allowance")
        if self.origin not in ("front-left", "center"):
            raise ValueError("G54 origin must be 'front-left' or 'center'")

    def offset_xy(self) -> tuple[float, float]:
        return (0.0, 0.0) if self.origin == "front-left" else (-self.width_mm / 2, -self.height_mm / 2)


@dataclass(frozen=True)
class Move:
    mode: str  # rapid or feed
    x: float
    y: float
    z: float
    feed: float | None = None

    def __post_init__(self) -> None:
        if self.mode not in ("rapid", "feed"):
            raise ValueError("Unexpected move mode")
        if not all(math.isfinite(value) for value in (self.x, self.y, self.z)):
            raise ValueError("Nonfinite toolpath coordinate")
        if self.mode == "feed":
            positive(self.feed, "Feed rate")
        elif self.feed is not None:
            raise ValueError("Rapid move must not have feed")


@dataclass(frozen=True)
class Plan:
    setup: Setup
    tool: Tool
    moves: tuple[Move, ...]
    passes: int
    operation: str = "face"
    source_sha256: str | None = None

    def __post_init__(self) -> None:
        if not self.moves or self.operation != "face":
            raise ValueError("Only nonempty facing plans are supported")
        if not self.moves[0].mode == self.moves[-1].mode == "rapid":
            raise ValueError("Plan must begin and end with rapid moves")
        safe = self.tool.clearance_mm
        if abs(self.moves[0].z - safe) > 1e-7 or abs(self.moves[-1].z - safe) > 1e-7:
            raise ValueError("Plan must begin and end above stock")
        if min(move.z for move in self.moves) < -self.setup.facing_allowance_mm - 1e-7:
            raise ValueError("Toolpath cuts below the requested facing depth")


def plan_facing(setup: Setup, tool: Tool, source_sha256: str | None = None) -> Plan:
    """Face stock to part top using outside-stock edge entry and serpentine XY passes.

    G54 Z0 is the stock TOP before facing. Tool centre coordinates are relative
    to stock front-left, then shifted by the selected XY origin in the post.
    These are not machine-validated trajectories; review/verification mandatory.
    """
    radius = tool.diameter_mm / 2
    edge = radius + 1.0
    x_left, x_right = -edge, setup.width_mm + edge
    y_start = -radius / 2
    y_end = setup.height_mm + radius / 2
    stepover = tool.diameter_mm * tool.stepover_ratio
    # Positive finite dimensions already validated, but cap loops to avoid an
    # accidental billions-of-moves plan from an extreme user setting.
    depth_count = math.ceil(setup.facing_allowance_mm / tool.stepdown_mm)
    row_count = math.ceil((y_end - y_start) / stepover) + 1
    if depth_count * row_count > 50000:
        raise ValueError("Toolpath would exceed 50,000 cutting passes; use larger passes")
    rows = [y_start + (y_end - y_start) * i / (row_count - 1) for i in range(row_count)]
    moves: list[Move] = []
    for depth_index in range(1, depth_count + 1):
        z = -min(setup.facing_allowance_mm, depth_index * tool.stepdown_mm)
        moves.append(Move("rapid", x_left, rows[0], tool.clearance_mm))
        # The plunge is deliberately OUTSIDE the stock's left X boundary.
        moves.append(Move("feed", x_left, rows[0], z, tool.plunge_mm_min))
        for row_index, y in enumerate(rows):
            endpoint = x_right if row_index % 2 == 0 else x_left
            moves.append(Move("feed", endpoint, y, z, tool.feed_mm_min))
            if row_index < len(rows) - 1:
                # Link between rows occurs with the cutter entirely beyond X stock.
                moves.append(Move("feed", endpoint, rows[row_index + 1], z, tool.feed_mm_min))
        last = moves[-1]
        moves.append(Move("rapid", last.x, last.y, tool.clearance_mm))
    return Plan(setup, tool, tuple(moves), depth_count, source_sha256=source_sha256)
