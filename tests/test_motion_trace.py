"""End-to-end review-only facing motion trace acceptance tests."""
import contextlib
import csv
import io
import json
import math
from pathlib import Path
import tempfile
import unittest

from ezcam.core import Setup, Tool, plan_facing
from ezcam.motion import estimate_motion
from ezcam.motion_trace import motion_trace, motion_trace_csv
from ezcam.stock_preview_cli import main


class MotionTraceTests(unittest.TestCase):
    def setUp(self):
        self.plan = plan_facing(Setup(30, 20, 1), Tool(
            diameter_mm=10, stepover_ratio=0.5, stepdown_mm=0.5))

    def test_trace_reconciles_with_existing_motion_engine(self):
        rows = motion_trace(self.plan)
        estimate = estimate_motion(self.plan)
        self.assertEqual(len(rows), len(self.plan.moves))
        self.assertEqual(rows[0]["segment_distance_mm"], 0)
        self.assertIsNone(rows[0]["segment_feed_minutes"])
        self.assertAlmostEqual(rows[-1]["cumulative_feed_minutes"], estimate.feed_minutes)
        self.assertAlmostEqual(rows[-1]["cumulative_feed_distance_mm"], estimate.feed_distance_mm)
        self.assertAlmostEqual(rows[-1]["cumulative_rapid_distance_mm"], estimate.rapid_distance_mm)
        self.assertTrue(all(a["cumulative_feed_minutes"] <= b["cumulative_feed_minutes"]
                            for a, b in zip(rows, rows[1:])))

    def test_feed_segment_is_three_dimensional(self):
        rows = motion_trace(self.plan)
        plunge = rows[1]
        self.assertEqual(plunge["mode"], "feed")
        self.assertAlmostEqual(plunge["segment_distance_mm"], 5.5)
        self.assertAlmostEqual(plunge["segment_feed_minutes"], 5.5 / self.plan.tool.plunge_mm_min)

    def test_csv_preserves_all_segments(self):
        data = list(csv.DictReader(io.StringIO(motion_trace_csv(self.plan))))
        self.assertEqual(len(data), len(self.plan.moves))
        self.assertEqual(data[0]["mode"], "rapid")
        self.assertEqual(data[1]["mode"], "feed")

    def test_cli_produces_reviewable_motion_trace_and_stock_result(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, output, trace = root/"input.json", root/"stock.json", root/"trace.csv"
            source.write_text(json.dumps({
                "stock":{"width_mm":30,"height_mm":20,"facing_allowance_mm":1},
                "tool":{"diameter_mm":10,"stepover_ratio":0.5,"stepdown_mm":0.5},
                "cell_mm":1
            }), encoding="utf-8")
            self.assertEqual(main([str(source), "-o", str(output),
                                   "--motion-csv", str(trace)]), 0)
            result = json.loads(output.read_text())
            self.assertAlmostEqual(result["simulation"]["target_coverage"], 1)
            self.assertEqual(len(list(csv.DictReader(trace.open(newline="")))),
                             result["move_count"])

    def test_bad_input_does_not_write_trace(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, trace = root/"input.json", root/"trace.csv"
            source.write_text(json.dumps({"stock":{"width_mm":-1,"height_mm":20,
                            "facing_allowance_mm":1}}), encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main([str(source), "--motion-csv", str(trace)]), 2)
            self.assertFalse(trace.exists())


if __name__ == "__main__":
    unittest.main()
