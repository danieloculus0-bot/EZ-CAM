"""End-to-end synthetic stock report regression."""
import json
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

from ezcam.core import Move, Plan, Setup, Tool
from ezcam.preview import main, render_svg
from ezcam.stock_sim import simulate_facing


class PreviewTests(unittest.TestCase):
    def test_cli_writes_parseable_svg_and_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            svg = Path(tmp) / "stock.svg"
            report = Path(tmp) / "stock.json"
            self.assertEqual(main(["--width", "20", "--height", "10",
                                   "--allowance", "1", "--tool", "8",
                                   "--svg", str(svg), "--json", str(report)]), 0)
            root = ElementTree.fromstring(svg.read_text(encoding="utf-8"))
            self.assertTrue(root.tag.endswith("svg"))
            result = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(result["target_mm3"], 200)
            self.assertAlmostEqual(result["target_coverage"], 1)
            self.assertFalse(result["verified_for_machine_execution"])

    def test_partial_stock_is_visible_and_reported(self):
        setup = Setup(10, 10, 1)
        tool = Tool(diameter_mm=2)
        moves = (Move("rapid", -2, -2, 5),
                 Move("feed", -2, -2, -1, 100),
                 Move("feed", 2, -2, -1, 100),
                 Move("rapid", 2, -2, 5))
        preview = simulate_facing(Plan(setup, tool, moves, 1))
        svg = render_svg(preview, 10, 10, 1)
        ElementTree.fromstring(svg)
        self.assertIn("Coverage: 0.0%", svg)
        self.assertGreater(preview.remaining_mm3, 0)

    def test_distinct_output_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "same")
            with self.assertRaises(SystemExit):
                main(["--width", "10", "--height", "10",
                      "--allowance", "1", "--svg", path, "--json", path])


if __name__ == "__main__":
    unittest.main()
