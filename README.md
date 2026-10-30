# EZ CAM

**The part is the interface.**

EZ CAM is an experimental, local-first CNC machining workbench built to make CAM setup as straightforward as EZ-FEA: **open STEP, confirm stock and datum, choose a cutter, build a path and see what it does**. Complex geometry and verification belong behind the screen, not in forty-seven dialogs.

**Status: v0.1, a working facing-path preview, NOT production CAM.** There is no claim of a fully autonomous machining engine, real material-removal simulation, safe controller postprocessor or connected BEAN assistant yet. Toolpath TXT export is intentionally marked review-only. Do not run it on any CNC controller.

## Run it on Windows

Use PowerShell in the cloned repository:

```powershell
py -m pip install -e ".[step]"
py -m ezcam
```

The GUI uses Python's included `tkinter`. STEP import requires the optional `gmsh` package; the fully fictional demo and path planner work without it. If you are experimenting without CAD import, `py -m ezcam` is sufficient on a Python installation with Tk.

## What works now

- **One-screen desktop:** dark workbench, `OPEN STEP MODEL`, fictional demo, stock dimensions, G54 origin (front-left or stock centre), raw-stock-top Z0 and basic tool settings.
- **Actual STEP inspection:** uses OpenCASCADE via Gmsh. Reads a *single closed 3D STEP solid*, identifies bounds and upper horizontal faces, retains source SHA-256 and projects CAD surface triangles. It is not a full 3D CAD viewer yet.
- **Real deterministic facing geometry:** selected flat end mill, adjustable stepover, stepdown, feeds and clearance. Plans depth levels and stock-covering serpentine cutter-centre passes with entry beyond the stock edge.
- **Interactive toolpath preview:** view the stock, projected part, cutter circle and all XY paths, scrub or replay the sequence.
- **Export:** structured preview JSON or generic G-code-like review TXT. This intentionally does not qualify as a machine-safe output and will not produce a `.nc` file.
- **Source freshness guard:** refuses to build/export if the imported STEP changes after it was opened.
- **Tests:** deterministic planning and G-code guards; native integration cases generate their own entirely fictional STEP files in Gmsh.

## Quick trial

Run the app and press **BUILD FACING PATH** using the fictional plate already loaded. Change cutter diameter or stock dimensions, build again and scrub the path. Then choose **OPEN STEP MODEL** to inspect your own local single-part STEP file. The part file stays local; the program does not upload it.

## Scope and safety

This initial facing operation assumes a 3-axis mill, flat raw stock in XY, one face-up solid and an externally defined safe setup. It does **not** verify fixtures, cutters, holders, controller dialect, feeds and speeds against the actual material, machine travels, remaining stock or tool collisions. Its 2D preview is not stock simulation. **Do not use it to execute a machining operation.**

The application's GUI, geometry adapter, planner and export are separated intentionally so a verified machining engine can replace individual pieces without redesigning the simple interface.

The next critical implementation is true CAD-face selection and swept-tool stock simulation, followed by pocket/profile/drilling operations and controller-specific posting. The longer-term goal is BEAN-powered evidence-backed machining advice and optional Axiom capacity/tooling integration. See [the build plan](docs/PLAN.md) for the implementation sequence and strict confidentiality rules.

## Tests

```powershell
py -m unittest discover -s tests -v
```

CI runs on Windows and Linux with the Gmsh extra to exercise the synthetic STEP round trip. No proprietary machining files or business data are shipped.

## Related codebases

- [EZ-FEA](https://github.com/danieloculus0-bot/EZ-FEA) for CAD/OCC interface patterns.
- [BEAN](https://github.com/danieloculus0-bot/BEAN) for future judgment and evidence-linked assistance.
- [Axiom](https://github.com/danieloculus0-bot/Axiom_Beta) for potential local-first manufacturing context.

Those systems are **not connected to this first commit**.
