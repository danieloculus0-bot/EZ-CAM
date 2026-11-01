import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {planFacing,estimateFacing,reviewOnlyListing} from "./engine.mjs";
import {inferFacingTool,MATERIALS,resolveMaterial} from "./tool-inference.mjs";
import {MACHINE_PROFILES, machineById,estimateProcess} from "./machines.mjs";
const base={
 width_mm:86,height_mm:56,facing_allowance_mm:1,origin:"front-left",
 diameter_mm:10,stepover_ratio:.6,stepdown_mm:.4,
 feed_mm_min:450,plunge_mm_min:100,clearance_mm:5,rapid_mm_min:3000
};
const quote={quantity:10,machine_rate_per_hour:85,setup_minutes:30,overhead_percent:10,margin_percent:20};
test("facing computes exact levels, begins and ends clear, never overcuts",()=>{
 const p=planFacing(base);
 assert.equal(p.passes,3);
 assert.equal(p.moves.at(0).z,5);
 assert.equal(p.moves.at(-1).z,5);
 assert.ok(Math.abs(Math.min(...p.moves.map(m=>m.z))+1)<1e-8);
 assert.ok(p.moves.every(m=>m.z>=-1-1e-8));
 assert.ok(p.metrics.motion_min>0);
 assert.equal(p.machine_verified,false);
});
test("each plunge occurs outside the left stock edge",()=>{
 const p=planFacing(base);
 for(let i=1;i<p.moves.length;i++){
  const a=p.moves[i-1],b=p.moves[i];
  if(b.mode==="feed"&&b.z<a.z)assert.ok(b.x<-base.diameter_mm/2);
 }
});
test("invalid input blocks plans rather than generating unsafe trajectories",()=>{
 for(const change of [{stepover_ratio:1},{width_mm:0},{facing_allowance_mm:-1},{stepdown_mm:0},{feed_mm_min:Infinity}])
 assert.throws(()=>planFacing({...base,...change}));
 assert.throws(()=>planFacing({...base,width_mm:10000,height_mm:10000,diameter_mm:.01,stepover_ratio:.001}));
});
test("review path never claims safe machine execution or starts spindle",()=>{
 const text=reviewOnlyListing(planFacing(base));
 assert.match(text,/NOT FOR MACHINE EXECUTION/);
 assert.doesNotMatch(text,/^M3\b|^M03\b|^M8\b|^M08\b/m);
 assert.match(text,/G54/);
});
test("facing quote is an unverified operation not full part cost",()=>{
 const q=estimateFacing(planFacing(base),quote);
 assert.equal(q.machine_verified,false);
 assert.equal(q.production_approved,false);
 assert.equal(q.quote_basis.material_cost_included,false);
 assert.ok(q.quote_basis.estimated_operation_total>0);
 assert.ok(q.quote_basis.estimated_operation_per_part>0);
});
test("seven generic manufacturer choices have no invented model capacities",()=>{
 assert.equal(MACHINE_PROFILES.length,7);
 const grouped=Object.groupBy(MACHINE_PROFILES,m=>m.family);
 assert.equal(grouped.mill.length,3);
 assert.equal(grouped.laser.length,2);
 assert.equal(grouped.brake.length,2);
 for(const m of MACHINE_PROFILES){
  assert.equal(m.capabilities_verified,false);
  assert.equal(m.model,"NOT CONFIGURED");
  assert.equal(m.controller,"NOT CONFIGURED");
  assert.equal(machineById(m.id).id,m.id);
 }
 assert.throws(()=>machineById("unrecognized"));
});
test("material/cutter inferences are transparent and RPM-capped",()=>{
 for(const material of Object.keys(MATERIALS)){
  const x=inferFacingTool({material,machine_max_rpm:5000});
  assert.ok(x.suggested.rpm<=5000);
  assert.ok(x.suggested.feed_mm_min>0);
  assert.ok(x.basis.formulas.includes("RPM"));
  assert.match(x.status,/NOT_BEAN_CONNECTED/);
 }
});
test("inference changes with material; never pretends to know a real machine",()=>{
 const a=inferFacingTool({material:"aluminum-6061"});
 const b=inferFacingTool({material:"stainless-304"});
 assert.notEqual(a.suggested.rpm,b.suggested.rpm);
 assert.ok(b.limitations.some(w=>w.includes("BEAN")));
 assert.throws(()=>inferFacingTool({material:"unlisted"}));
});
test("common HR, HRPO/P&O, CRS, 5052 and 6061 names map to the intended material",()=>{
 const cases=[
  ["6061","aluminum-6061"],["6061 aluminum","aluminum-6061"],
  ["5052","aluminum-5052"],["5052 aluminum","aluminum-5052"],
  ["hot rolled","steel-hot-rolled"],["HR","steel-hot-rolled"],
  ["P&O","steel-hrpo"],["HRPO","steel-hrpo"],["P&O/HRPO","steel-hrpo"],
  ["pickled & oiled","steel-hrpo"],["CRS","steel-crs"],["cold rolled steel","steel-crs"],
  ["304 stainless","stainless-304"],["SS304","stainless-304"],
  ["1018","steel-1018"]
 ];
 assert.equal(Object.keys(MATERIALS).length,8);
 for(const [name,id] of cases){
  assert.equal(resolveMaterial(name),id,name);
  assert.equal(inferFacingTool({material:name}).basis.material_id,id,name);
 }
 assert.throws(()=>resolveMaterial("A36"),/Unknown generic material/);
 assert.throws(()=>resolveMaterial(""),/Unknown generic material/);
 assert.throws(()=>resolveMaterial(null),/Unknown generic material/);
});
test("generic rolled-steel process names never invent an alloy grade",()=>{
 const mild=inferFacingTool({material:"1018"});
 for(const material of ["HR","HRPO","P&O","CRS"]){
  const x=inferFacingTool({material,machine_max_rpm:12000});
  assert.equal(x.basis.grade_unspecified,true);
  assert.equal(x.basis.assumed_cutting_speed_m_min,mild.basis.assumed_cutting_speed_m_min);
  assert.equal(x.basis.assumed_chip_load_mm_tooth,mild.basis.assumed_chip_load_mm_tooth);
  assert.ok(x.reasons.some(reason=>/grade|processing|surface/i.test(reason)));
 }
 assert.equal(inferFacingTool({material:"6061"}).basis.grade_unspecified,false);
 const aluminum6061=inferFacingTool({material:"6061"});
 const aluminum5052=inferFacingTool({material:"5052"});
 assert.notEqual(aluminum6061.suggested.rpm,aluminum5052.suggested.rpm);
 assert.notEqual(aluminum6061.suggested.feed_mm_min,aluminum5052.suggested.feed_mm_min);
 assert.equal(aluminum5052.basis.material_id,"aluminum-5052");
});
test("browser material selector exposes every inference material profile",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 for(const id of Object.keys(MATERIALS))
  assert.ok(html.includes('value="'+id+'"'),"Missing browser material option: "+id);
 assert.match(html,/HRPO \/ P&amp;O/);
});
test("laser estimate responds to cut distance, piercing time and quantity",()=>{
 const b={...quote,cut_length_mm:1500,cut_speed_mm_min:1000,pierce_count:4,pierce_seconds:3};
 const out=estimateProcess("hk",b);
 assert.equal(out.operation,"laser_cut_time_only");
 assert.equal(out.machine.brand,"HK");
 assert.ok(Math.abs(out.metrics.estimated_motion_min_per_part-1.7)<1e-8);
 assert.equal(out.quote_basis.quantity,10);
 assert.ok(estimateProcess("trumpf",{...b,cut_length_mm:3000}).quote_basis.estimated_operation_total>out.quote_basis.estimated_operation_total);
});
test("press brake estimate responds to bends, handling and quantity",()=>{
 const b={...quote,bend_count:4,seconds_per_bend:20,handling_seconds:10};
 const out=estimateProcess("bystronic",b);
 assert.equal(out.operation,"press_brake_cycle_time_only");
 assert.equal(out.machine.brand,"Bystronic");
 assert.ok(Math.abs(out.metrics.estimated_motion_min_per_part-1.5)<1e-8);
 assert.equal(estimateProcess("accurpress",b).machine.brand,"Accurpress");
});
test("all process estimates reject invalid counts and margin",()=>{
 const l={...quote,cut_length_mm:250,cut_speed_mm_min:1000,pierce_count:2,pierce_seconds:2};
 assert.throws(()=>estimateProcess("hk",{...l,pierce_count:2.5}));
 assert.throws(()=>estimateProcess("hk",{...l,margin_percent:97}));
 assert.throws(()=>estimateProcess("hk",{...l,quantity:0}));
 assert.throws(()=>estimateProcess("bystronic",{...quote,bend_count:-1,seconds_per_bend:15,handling_seconds:2}));
 assert.throws(()=>estimateProcess("hurco",quote));
});

test("black-neutral theme uses black surfaces in browser and desktop workbenches",()=>{
 const css=readFileSync(new URL("./style.css",import.meta.url),"utf8");
 const browser=readFileSync(new URL("./app.mjs",import.meta.url),"utf8");
 const desktop=readFileSync(new URL("../ezcam/desktop.py",import.meta.url),"utf8");
 assert.match(css,/:root\\{[^}]*background:#000000/);
 assert.match(css,/\\.panel,\\.stage\\{[^}]*background:#0a0a0a/);
 assert.match(css,/\\.stage-head\\{[^}]*background:#0d0d0d/);
 assert.match(css,/label input,label select\\{[^}]*background:#080808/);
 assert.match(css,/\\.metric strong\\{[^}]*color:#ededed/);
 assert.match(browser,/ctx\\.fillStyle="#050505";ctx\\.fillRect\\(0,0,w,h\\)/);
 assert.match(browser,/ctx\\.fillStyle="#303030";ctx\\.strokeStyle="#a8a8a8"/);
 assert.match(desktop,/BG, PANEL, CANVAS_BG = "#000000", "#0b0b0b", "#050505"/);
 assert.match(desktop,/style="EZDark.TCombobox"/);
 assert.doesNotMatch(css,/background:#(?:111a16|17231c|1a2820|203328|294537)/);
});
