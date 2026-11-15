"""Headless desktop stock export integration checks."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from xml.etree import ElementTree

from ezcam.core import Setup, Tool, plan_facing
from ezcam.desktop import Desktop


class StockExportTests(unittest.TestCase):
    def test_exports_real_plan_to_svg(self):
        plan = plan_facing(Setup(20, 12, 1), Tool(6, 0.6, 0.5))
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "stock.svg"
            desktop = Desktop.__new__(Desktop)
            desktop.plan = plan
            desktop._verify_source = lambda: None
            statuses = []
            desktop.status = SimpleNamespace(set=statuses.append)
            with patch("ezcam.desktop.filedialog.asksaveasfilename", return_value=str(output)):
                desktop.export_stock_svg()
            root = ElementTree.parse(output).getroot()
            self.assertTrue(root.tag.endswith("svg"))
            self.assertIn("coverage", statuses[0])
            self.assertIn("not collision verified", statuses[0])

    def test_missing_plan_does_not_export(self):
        desktop = Desktop.__new__(Desktop)
        desktop.plan = None
        with patch("ezcam.desktop.messagebox.showwarning") as warning, patch(
            "ezcam.desktop.filedialog.asksaveasfilename"
        ) as dialog:
            desktop.export_stock_svg()
        warning.assert_called_once()
        dialog.assert_not_called()


if __name__ == "__main__":
    unittest.main()
