/* EZ CAM browser estimator, synthetic demonstration only.
 * Port of ezcam/core.py facing geometry. No machining approval or CNC posting.
 */
const finite = (value, name, min = 0, max = 1e8) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= min || n > max) throw new Error(name + " must be greater than " + min + " and at most " + max);
  return n;
};
const bounded = (value, name, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(name + " must be between " + min + " and " + max);
  return n;
};
export function planFacing(input) {
  const s = {
    width_mm: finite(input.width_mm, "Stock width", 0, 10000),
    height_mm: finite(input.height_mm, "Stock height", 0, 10000),
    facing_allowance_mm: finite(input.facing_allowance_mm, "Facing allowance", 0, 250),
    origin: input.origin || "front-left"
  };
  if (!["front-left", "center"].includes(s.origin)) throw Error("Unsupported G54 origin");
  const t = {
    diameter_mm: finite(input.diameter_mm, "Tool diameter", 0, 250),
    stepover_ratio: bounded(input.stepover_ratio, "Stepover", 0.001, 0.8),
    stepdown_mm: finite(input.stepdown_mm, "Stepdown", 0, 100),
    feed_mm_min: finite(input.feed_mm_min, "Cut feed", 0, 100000),
    plunge_mm_min: finite(input.plunge_mm_min, "Plunge feed", 0, 100000),
    clearance_mm: finite(input.clearance_mm, "Clearance", 0, 10000),
    rapid_mm_min: finite(input.rapid_mm_min, "Assumed rapid", 0, 100000)
  };
  const radius = t.diameter_mm / 2, edge = radius + 1;
  const xleft = -edge, xright = s.width_mm + edge;
  const ystart = -radius / 2, yend = s.height_mm + radius / 2;
  const depthCount = Math.ceil(s.facing_allowance_mm / t.stepdown_mm);
  const rowCount = Math.ceil((yend - ystart) / (t.diameter_mm * t.stepover_ratio)) + 1;
  if (depthCount * rowCount > 50000 || rowCount > 50000) throw Error("Preview exceeds 50,000 passes. Increase stepover or stepdown.");
  const rows = Array.from({length: rowCount}, (_,i) => ystart + (yend - ystart) * i / (rowCount - 1));
  const moves = [];
  const add = (mode,x,y,z,feed=null) => moves.push({mode,x,y,z,feed});
  for (let level = 1; level <= depthCount; level++) {
    const z = -Math.min(s.facing_allowance_mm, level * t.stepdown_mm);
    add("rapid",xleft,rows[0],t.clearance_mm);
    add("feed",xleft,rows[0],z,t.plunge_mm_min);
    rows.forEach((y,i) => {
      const end = i % 2 === 0 ? xright : xleft;
      add("feed",end,y,z,t.feed_mm_min);
      if (i < rows.length - 1) add("feed",end,rows[i+1],z,t.feed_mm_min);
    });
    const last = moves[moves.length-1];
    add("rapid",last.x,last.y,t.clearance_mm);
  }
  let feedLength = 0, rapidLength = 0, motionMinutes = 0;
  for(let i = 1; i < moves.length; i++) {
    const a=moves[i-1], b=moves[i];
    const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    if(b.mode==="feed") feedLength+=d; else rapidLength+=d;
    motionMinutes += d/(b.mode==="feed" ? b.feed : t.rapid_mm_min);
  }
  return {schema:"ezcam.browser_facing.v1", setup:s, tool:t, moves,
    passes:depthCount, rows_per_pass:rowCount,
    metrics:{feed_length_mm:feedLength,rapid_length_mm:rapidLength,motion_min:motionMinutes},
    machine_verified:false};
}
export function estimateFacing(plan, inputs={}) {
  if(plan?.schema!=="ezcam.browser_facing.v1" || plan.machine_verified!==false) throw Error("Only unverified browser facing plans accepted");
  const quantity = Math.trunc(bounded(inputs.quantity ?? 10, "Quantity", 1, 100000));
  if(quantity !== Number(inputs.quantity ?? 10)) throw Error("Quantity must be an integer");
  const machine_rate_per_hour=bounded(inputs.machine_rate_per_hour ?? 85,"Illustrative machine rate",0,100000);
  const setup_minutes=bounded(inputs.setup_minutes ?? 30,"Illustrative setup minutes",0,100000);
  const overhead_percent=bounded(inputs.overhead_percent ?? 10,"Overhead",0,500);
  const margin_percent=bounded(inputs.margin_percent ?? 20,"Margin",0,95);
  const perPartMinutes = plan.metrics.motion_min;
  const runCost = perPartMinutes / 60 * machine_rate_per_hour * quantity;
  const setupCost = setup_minutes / 60 * machine_rate_per_hour;
  const costBefore = runCost + setupCost;
  const burdened = costBefore * (1 + overhead_percent / 100);
  const quoted = burdened / (1-margin_percent/100);
  return {
    schema:"ezcam.estimate.v1", source:"fictional_browser_example",
    status:"UNVERIFIED_ESTIMATE", machine_verified:false, production_approved:false,
    generated_at:new Date().toISOString(),
    description:"Illustrative FACING operation cost only, not a whole-part quote.",
    units:"mm", operation:"face", setup:plan.setup, tool:plan.tool,
    assumptions:{
      rapid_rate_is_illustrative:true,
      no_tool_changes:true, no_fixture_collision_simulation:true,
      no_material_cost:true, no_cutting_force_model:true,
      no_controller_postprocessor:true,
      no_actual_machine_or_inventory_link:true
    },
    metrics:{
      levels:plan.passes,rows_per_level:plan.rows_per_pass,
      feed_length_mm:plan.metrics.feed_length_mm,
      rapid_length_mm:plan.metrics.rapid_length_mm,
      estimated_motion_min_per_part:perPartMinutes
    },
    quote_basis:{
      quantity, machine_rate_per_hour, setup_minutes,
      overhead_percent,margin_percent,
      estimated_operation_total:quoted,estimated_operation_per_part:quoted/quantity,
      currency:"USD", material_cost_included:false
    },
    warnings:[
      "Synthetic preview only; no actual STEP file is processed in this browser.",
      "Only a single facing operation is estimated, not full part machining.",
      "Motion time ignores acceleration, tool changes, spindle ramp, loading, inspection and unexpected machining conditions.",
      "Machine rate, setup time, overhead, margin and feeds are user-adjustable assumptions, not verified rates.",
      "Not approved for manufacturing, quoting customers, or CNC execution without independent validation."
    ]
  };
}
const fmt=n=>(Math.abs(n)<0.0005?0:n).toFixed(3);
export function reviewOnlyListing(plan) {
  if(plan?.schema!=="ezcam.browser_facing.v1" || plan.machine_verified!==false) throw Error("Unverified browser plan required");
  const dx=plan.setup.origin==="center"?-plan.setup.width_mm/2:0;
  const dy=plan.setup.origin==="center"?-plan.setup.height_mm/2:0;
  return [
    "(EZ CAM BROWSER - FICTIONAL FACING - REVIEW ONLY)",
    "(NOT FOR MACHINE EXECUTION - NO VERIFIED POSTPROCESSOR)",
    "(NO MACHINE / FIXTURE / COLLISION VALIDATION)",
    "(G54 Z0 IS RAW STOCK TOP)",
    "G21 G17 G90 G94 G40 G49 G80","G54",
    ...plan.moves.map(m=>(m.mode==="rapid"?"G0":"G1")+
      " X"+fmt(m.x+dx)+" Y"+fmt(m.y+dy)+" Z"+fmt(m.z)+
      (m.feed!==null?" F"+fmt(m.feed):"")),
    "(REVIEW ENDS - NOT FOR MACHINE EXECUTION)","M30",""
  ].join("\n");
}
