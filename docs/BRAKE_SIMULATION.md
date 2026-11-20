# EZ CAM press-brake section simulator

The existing EZ CAM browser workbench has generic Bystronic and Accurpress machine-family selections and an **assumption-based press-brake cycle-time estimator**. The new [brake simulation lab](../web/brake-lab.html) extends the same codebase rather than starting another CAM project.

## Implemented in the new section lab

- Define a straight flat strip by length and thickness, with 1 to 12 parallel bend axes at known positions and signed bend angles.
- Apply each bend as a geometric hinge rotation to downstream strip segments, with sampled intermediate angles and pause/scrub playback.
- Detect nonadjacent strip-segment intersections and section proximity smaller than the supplied thickness.
- Optionally compare the bend section against **user-supplied, purely 2D rectangular obstructions in the coordinate system of the active bend**. These are intentionally not claimed to be Bystronic tools.
- Try alternate bend orders and rank by number of sampled 2D interference frames, then collision events. The finite deterministic search examines up to a configured candidate limit.
- Export the input, intermediate states, collision observations, ranking evidence and limitations as review-only JSON.

The v1 simulator does **not** import actual STEP sheet-metal bends, perform bending/unfolding compensation, resolve bend lines from arbitrary nesting polygons, select real machines/tools, calculate force, calculate backgauge fingers, account for curved bend zones, or detect full machine/part 3D swept collisions.

The 2D strip can be treated as a real kinematic geometric calculation for the stated simplified model, **not** as actual press-brake manufacturing verification. Zero sampled collisions does not establish feasibility. The browser has no connection to a BEAN reasoning model or approved controller post.

## Axiom and BySoft direction

Axiom AutoNest owns the laser flat-pattern layout. EZ CAM owns process simulation. A future controlled, local-first adapter can take approved part geometry and its revision from Axiom, generate a bend-plan candidate in EZ CAM, and return decision evidence to Axiom's job passport. No automatic production release or controller code is part of the public lab.

The long-term comparison target is Bystronic's BySoft CAM Bend workflow, but without pretending v1 is feature parity:

1. STEP B-rep topology and controlled material/thickness/bend-rule ingestion, detecting real bend axes, faces and formed geometry.
2. Bend allowance/deduction, bend radii, springback, and unbending with verified source/material/tool parameters.
3. 3D shape-preserving bend sequence simulation, continuous collision broad-phase/narrow-phase against real part, punch, die, ram, table, side frames, and backgauges.
4. Tool library and stations; backgauge poses, setup sheets, force/tonnage/reach checks with model-specific verified machine capability.
5. Evidence-backed multi-objective optimization including handling/regrip, flips, station changes, setup time, collision clearance, and remnant/nest impact.
6. BEAN Core proposals based on measured geometry and versioned evidence, with the geometric verifier independent of language-model output.
7. Axiom work-order/drawing-revision link, quote-to-actual comparison, operator approval, and only later a separately verified controller post.

Only generic synthetic geometry/configuration belongs in public GitHub. Private machine setup, proprietary drawings, actual customer parts, machine configuration, or production jobs remain off the public site.

## Verification

Run:

    node --test web/brake-sim.test.mjs
    node --check web/brake-lab.mjs

The Pages workflow includes these tests as a deployment gate. Python-facing milling and the existing estimator are unchanged in this first section simulation addition.
