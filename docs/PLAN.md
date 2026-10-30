# EZ CAM engineering roadmap

The product rule is **the part is the interface**. Do not bury setup behind a forest of dialogs. Every automated choice must disclose its evidence and must remain editable.

## Evidence-backed current state (v0.1)

- A **local desktop Tk workbench** with an imported STEP top projection, fictional demo fallback, G54 XY corner/centre datum, stock width/height and raw-stock-top Z0.
- STEP/OCC inspection through optional **Gmsh**, including actual solids, mm units, CAD-face identities for highest horizontal faces, SHA-256 tracking, and bounded surface triangles. Does not yet do true 3D face-picking in the viewport.
- Deterministic **rectangular facing** path generator using selected end mill diameter, stepover, stepdown, XY feed, plunge feed and retract clearance, with edge-entry and serpentine passes.
- Motion preview with scrub/replay. Preview is **not** a swept-volume stock-removal simulation, gouge detector, spindle/tool/holder clearance test, or verified simulation.
- Review-only G-code-like TXT plus structured preview JSON. **No executable machine program is authorized or claimed.**
- Real STEP test fixture is generated from scratch by Gmsh in CI, never imported from customer drawings.

## Build order (no skipping verification)

1. **3D workplane and face selection**: pick true STEP planar faces using retained CAD topology, transform model orientation to G54, verify normals/axes, preview stock and fixtures in 3D.
2. **Recognize actual features**: planar faces, holes, pockets, bosses, slots and edge profiles; detect self-intersections, islands, through/open boundaries, concave curves and uncertainty. Only propose operations when geometry is sound.
3. **True stock removal**: swept cutter-volume simulation of each pass, remaining stock, gouge/collision detection for part, stock, holder, fixture and machine travels. Verify on canonical manufactured test geometries and analytic reference cases.
4. **2.5D milling suite**: facing, drilling/canned cycles, rectangular/irregular pockets, profiles, chamfers, rest machining and entry/exit strategies, with explicit geometry-aware tolerances and numerical checks.
5. **Controller posts**: machine/controller configuration, tool & length offsets, spindle and coolant, work envelope, axis limits, cutter compensation choices, fixtures, simulation and human sign-off before writing `.nc`.
6. **Higher-end CAM**: adaptive roughing, HSM corner behavior, 3-axis surfacing and rest paths; optional 4/5-axis only after verified kinematics and reachability.
7. **BEAN assistance**: attach the *actual* BEAN reasoning service as a source-linked adviser. Recommend order, cutter, tool engagement, and efficient alternatives, but never treat LLM text as a validated path or silently authorize a machine action. No BEAN runtime is wired in v0.1.
8. **Axiom integration**: optional local-first adapters for abstract work-center capabilities, tooling and machine capacity. Never pull real company data into public examples. No live connection exists in v0.1.

## Existing project research

- EZ-FEA provides a proven architecture pattern for STEP import, Gmsh/OpenCASCADE topology, CAD IDs, and direct geometry interaction. It does not supply CAM cutter physics.
- LAYR's established Android mesh/slicing/motion-planning work may inform motion and performance, but extrusion deposition is not subtractive machining and its source is not copied here.
- ColorPrint VVR's voxel/material-volume strategies may inform stock-removal simulation research, not presently imported or verified for CNC.
- Before any source reuse, review permissions, current implementation, tests and mathematical invariants. The first commit does **not** claim those codebases were integrated.

## Public data policy

This public repository, issues, documentation, test artifacts, CI and any website may contain **only generic algorithms and fully fictional examples**. Do not publish employer/customer/supplier data, genuine shop drawings, actual part files, routings, machining programs, machine configurations, records, brand-linked confidential workflows, customer names, credentials or private adaptation of internal manufacturing practices. Treat all future integration fixtures as synthetic.
