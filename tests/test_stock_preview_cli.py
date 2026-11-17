"""Synthetic end-to-end regression for the offline stock preview interface."""
import contextlib
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest

from ezcam.stock_preview_cli import evaluate, heightmap_csv, main


class StockPreviewCLITests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "stock": {"width_mm": 30, "height_mm": 20, "facing_allowance_mm": 1},
            "tool": {"diameter_mm": 10, "stepover_ratio": 0.5, "stepdown_mm": 0.5},
            "cell_mm": 1,
        }

    def test_full_facing_volume_and_coverage(self):
        result = evaluate(self.payload)
        sim = result["simulation"]
        self.assertFalse(result["machine_verified"])
        self.assertEqual(result["passes"], 2)
        self.assertAlmostEqual(sim["target_mm3"], 600)
        self.assertAlmostEqual(sim["removed_mm3"], 600)
        self.assertAlmostEqual(sim["remaining_mm3"], 0)
        self.assertAlmostEqual(sim["target_coverage"], 1)
        self.assertEqual(sim["uncut_cells"], 0)

    def test_json_file_to_json_file(self):
        with tempfile.TemporaryDirectory() as folder:
            src, dst = Path(folder) / "input.json", Path(folder) / "result.json"
            src.write_text(json.dumps(self.payload), encoding="utf-8")
            self.assertEqual(main([str(src), "-o", str(dst)]), 0)
            data = json.loads(dst.read_text(encoding="utf-8"))
            self.assertEqual(data["simulation"]["columns"], 30)
            self.assertEqual(data["simulation"]["rows"], 20)
            self.assertEqual(len(data["simulation"]["heights_mm"]), 20)

    def test_heightmap_csv_end_to_end(self):
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / "input.json"
            dst = Path(folder) / "result.json"
            heightmap = Path(folder) / "surface.csv"
            src.write_text(json.dumps(self.payload), encoding="utf-8")
            self.assertEqual(main([str(src), "-o", str(dst), "--heightmap-csv", str(heightmap)]), 0)
            result = json.loads(dst.read_text(encoding="utf-8"))
            with heightmap.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.reader(handle))
            self.assertEqual(len(rows), result["simulation"]["rows"] + 1)
            self.assertEqual(len(rows[0]), result["simulation"]["columns"])
            self.assertEqual([[float(value) for value in row] for row in rows[1:]], result["simulation"]["heights_mm"])

    def test_heightmap_csv_rejects_inconsistent_grid(self):
        with self.assertRaisesRegex(ValueError, "dimensions"):
            heightmap_csv({"simulation": {"rows": 2, "columns": 2, "heights_mm": [[1, 2]]}})

    def test_invalid_grid_rejected_without_output(self):
        with tempfile.TemporaryDirectory() as folder:
            src, dst = Path(folder) / "bad.json", Path(folder) / "out.json"
            payload = {**self.payload, "max_cells": 10}
            src.write_text(json.dumps(payload), encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(main([str(src), "-o", str(dst)]), 2)
            self.assertIn("max_cells", err.getvalue())
            self.assertFalse(dst.exists())

    def test_invalid_tool_rejected(self):
        payload = {**self.payload, "tool": {"diameter_mm": -1}}
        with self.assertRaises(ValueError):
            evaluate(payload)


if __name__ == "__main__":
    unittest.main()
