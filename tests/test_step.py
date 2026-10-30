"""Real OCC STEP round-trip. Runs in CI when the optional gmsh extra is installed."""
import os
import tempfile
from pathlib import Path
import unittest

from ezcam.cad import inspect_step


class StepRoundTripTests(unittest.TestCase):
    @staticmethod
    def gmsh_module():
        try:
            import gmsh
            return gmsh
        except (ImportError, OSError) as exc:
            if os.environ.get("EZCAM_REQUIRE_GMSH") == "1":
                raise RuntimeError("Gmsh is mandatory for CI STEP tests, native loading failed") from exc
            raise unittest.SkipTest("Install optional Gmsh runtime for native STEP acceptance")

    def test_real_synthetic_box_step_import(self):
        gmsh = self.gmsh_module()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "entirely_fictional_box.step"
            gmsh.initialize()
            try:
                gmsh.option.setNumber("General.Terminal", 0)
                gmsh.model.add("synthetic CAD acceptance")
                gmsh.model.occ.addBox(0, 0, 0, 40, 30, 10)
                gmsh.model.occ.synchronize()
                gmsh.write(str(path))
            finally:
                gmsh.finalize()
            result = inspect_step(path)
            self.assertAlmostEqual(result.width_mm, 40, places=3)
            self.assertAlmostEqual(result.height_mm, 30, places=3)
            self.assertAlmostEqual(result.depth_mm, 10, places=3)
            self.assertEqual(result.solid_count, 1)
            self.assertTrue(result.top_faces)
            self.assertTrue(result.triangles)
            self.assertEqual(len(result.sha256), 64)

    def test_multiple_solids_refused(self):
        gmsh = self.gmsh_module()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic_multisolid.step"
            gmsh.initialize()
            try:
                gmsh.option.setNumber("General.Terminal", 0)
                gmsh.model.add("synthetic assembly")
                gmsh.model.occ.addBox(0, 0, 0, 20, 20, 10)
                gmsh.model.occ.addBox(40, 0, 0, 20, 20, 10)
                gmsh.model.occ.synchronize()
                gmsh.write(str(path))
            finally:
                gmsh.finalize()
            with self.assertRaisesRegex(ValueError, "one closed STEP solid"):
                inspect_step(path)

if __name__ == "__main__":
    unittest.main()
