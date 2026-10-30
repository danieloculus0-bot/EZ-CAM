"""Optional real STEP/OCC import using the same Gmsh geometry family as EZ-FEA.

No FEA solver is imported. CAM needs CAD topology, not structural stiffness.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
from pathlib import Path


@dataclass(frozen=True)
class Part:
    path: str
    sha256: str
    bounds_mm: tuple[float, float, float, float, float, float]
    # (x0,y0,z0,x1,y1,z1) in source mm, no screen normalization.
    top_faces: tuple[int, ...]
    triangles: tuple[tuple[tuple[float,float,float], tuple[float,float,float], tuple[float,float,float]], ...]
    solid_count: int

    @property
    def width_mm(self) -> float:
        return self.bounds_mm[3] - self.bounds_mm[0]

    @property
    def height_mm(self) -> float:
        return self.bounds_mm[4] - self.bounds_mm[1]

    @property
    def depth_mm(self) -> float:
        return self.bounds_mm[5] - self.bounds_mm[2]


def inspect_step(path: str | Path, triangle_cap: int = 6000) -> Part:
    """Read *actual* STEP geometry; never claim an STL/illustration is CAD topology.

    The initial implementation intentionally rejects assemblies. It keeps the
    real CAD surface IDs (top_faces) and a bounded triangular preview.
    """
    source = Path(path)
    if source.suffix.lower() not in (".step", ".stp") or not source.is_file():
        raise ValueError("Open an existing .step or .stp file")
    if source.stat().st_size > 100 * 1024 * 1024:
        raise ValueError("STEP file exceeds the 100 MB import limit")
    if not 1 <= triangle_cap <= 100000:
        raise ValueError("Invalid triangle limit")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    try:
        import gmsh
    except ImportError as exc:
        raise RuntimeError("STEP import requires Gmsh: pip install gmsh") from exc
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setString("Geometry.OCCTargetUnit", "MM")
        gmsh.model.add("EZ-CAM source CAD")
        gmsh.model.occ.importShapes(str(source))
        gmsh.model.occ.synchronize()
        volumes = gmsh.model.getEntities(3)
        if len(volumes) != 1:
            raise ValueError(f"Initial EZ CAM supports one closed STEP solid, found {len(volumes)}")
        bounds = tuple(float(v) for v in gmsh.model.getBoundingBox(3, volumes[0][1]))
        if any(not math.isfinite(v) for v in bounds) or any(bounds[i+3] - bounds[i] <= 0 for i in range(3)):
            raise ValueError("Invalid STEP solid dimensions")
        thickness_eps = max(1e-5, (bounds[5] - bounds[2]) * 1e-5)
        top_faces = []
        for _, face in gmsh.model.getEntities(2):
            bbox = gmsh.model.getBoundingBox(2, face)
            if abs(bbox[2] - bounds[5]) <= thickness_eps and abs(bbox[5] - bounds[5]) <= thickness_eps:
                top_faces.append(int(face))
        gmsh.option.setNumber("Mesh.MeshSizeMin", max(0.5, max(bounds[i+3] - bounds[i] for i in range(3)) / 60))
        gmsh.option.setNumber("Mesh.MeshSizeMax", max(0.8, max(bounds[i+3] - bounds[i] for i in range(3)) / 25))
        gmsh.model.mesh.generate(2)
        ids, coordinates, _ = gmsh.model.mesh.getNodes()
        nodes = {int(tag): tuple(float(v) for v in coordinates[i*3:i*3+3]) for i, tag in enumerate(ids)}
        faces: list[tuple[tuple[float,float,float], tuple[float,float,float], tuple[float,float,float]]] = []
        for _, face in gmsh.model.getEntities(2):
            types, _, blocks = gmsh.model.mesh.getElements(2, face)
            for kind, block in zip(types, blocks):
                if int(kind) != 2:
                    continue
                for i in range(0, len(block), 3):
                    if len(faces) >= triangle_cap:
                        raise ValueError("STEP preview exceeds triangle limit; use a simpler single solid")
                    faces.append(tuple(nodes[int(v)] for v in block[i:i+3]))
        if not faces:
            raise ValueError("STEP did not create a viewable surface tessellation")
        return Part(str(source), digest, bounds, tuple(sorted(top_faces)), tuple(faces), len(volumes))
    finally:
        gmsh.finalize()
