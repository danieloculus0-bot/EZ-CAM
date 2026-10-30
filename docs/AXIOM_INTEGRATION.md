# EZ CAM estimate bridge for future Axiom integration

This is a **proposed** boundary, not an installed integration. EZ CAM is independently usable; Axiom remains the manufacturer-facing ERP. No public demo invokes a private ERP, BEAN service, or shop network.

## Design

1. **EZ CAM owns the geometry/process analysis.** Start from controlled local part file, confirmed revision, stock and setup; generate operation-specific tool and time proposals. Current browser v0.1 uses ONLY a fictional 2.5D facing example and manual-assumption laser/brake estimators.
2. **BEAN advises; it does not post CNC code.** Actual future BEAN integration should provide sourced tooling/speed/feed candidates and degree of confidence. Current `web/tool-inference.mjs` is a transparent rule-based placeholder, not a connected BEAN reasoning agent. Keep this free.
3. **Axiom owns quote records.** An optional local adapter receives a reviewed estimate and normalizes each single-operation basis into Axiom's own quote engine, independently calculating material, purchased tooling, handling, scrap, overhead, burden, margin and routing alternatives.
4. **Axiom owns production approvals.** A forecast may be reviewed or quoted without becoming the eventual machining program. Actual programs produced in Mastercam or any other CAM package can replace the inferred method, retaining estimate vs actual evidence.
5. **Premium path is distinct.** Machine-specific code saving/transmission requires validated controller post, configured machine limits, verified geometry, fixture/stock simulation, operator approval and an auditable release record. None exists in this browser demo.

## Browser estimate contract

The JSON export identifies itself as `ezcam.estimate.v1` and declares `status: UNVERIFIED_ESTIMATE`, `machine_verified: false`, `production_approved: false`, `source: fictional_browser_example`. It contains:
- `machine`: generic brand and process family, no configured model or controller
- `operation`: limited operation identity (`face`, `laser_cut_time_only`, or `press_brake_cycle_time_only`)
- `metrics`: estimated minutes per part, plus process-relevant assumptions
- `quote_basis`: quantity, hypothetical machine rate, setup, overhead, margin, estimated operation total and per-part amount
- `warnings` and `assumptions`: omitted machining factors and unverified boundaries

Until the consumer is explicitly implemented and tested, **Axiom does not import this file**. Future integration must enforce schema, source hash/revision, engineering units, positive/finite bounds, machine identity resolution, cross-checks and approval. **Never silently import this file as an accepted customer quotation or machine release.**

## Privacy and synthetic test data

No employer, customer, vendor or operator confidential records, drawings, actual routings, programs, machine settings or work-center capacities may be checked into either public repository or published site. Use wholly fictional fixtures and generated STEP models. Job-linked estimating or proprietary local profiles must remain local and require explicit opt-in.

## Generic manufacturer families for v0.2

| Family | Illustrative choices | What is genuinely implemented |
| --- | --- | --- |
| 3-axis mills | Hurco, Fadal, Doosan | Fictional facing cutter-center paths, editable tool suggestions and assumed motion/cost |
| Sheet lasers | HK, TRUMPF | Manual-length/cut-rate/piercing time and cost |
| Press brakes | Bystronic, Accurpress | Manual bends/stroke and handling time and cost |

Brands do not imply a specific model, validated controller dialect, power, RPM, axis range, tool magazine, stroke speed, bed size, laser wattage, tooling, or connected hardware. A machine-specific profile is a future local configuration, not a public fact inferred from brand alone.
