import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MM_PER_INCH,UNIT_FIELDS,toMm,fromMm,convertDisplay,displayNumber} from "./units.mjs";
import {planFacing,estimateFacing,reviewOnlyListing} from "./engine.mjs";
import {inferFacingTool} from "./tool-inference.mjs";
import {estimateProcess} from "./machines.mjs";
const inputs={
 width_mm:86,height_mm:56,facing_allowance_mm:1,origin:"front-left",
 diameter_mm:16,stepover_ratio:.55,stepdown_mm:.8,
 feed_mm_min:540,plunge_mm_min:120,clearance_mm:5,rapid_mm_min:3000
};
test("US customary input preserves exact reference lengths and speeds",()=>{
 assert.equal(MM_PER_INCH,25.4);
 assert.equal(toMm(1,"in"),25.4);
 assert.equal(toMm(10,"mm"),10);
 assert.equal(fromMm(25.4,"in"),1);
 assert.equal(toMm(10,"in"),254);
 assert.equal(fromMm(254,"in"),10);
 for(const field of Object.keys(UNIT_FIELDS)){
  const original=field==="feed"||field==="rapid"?3000:25.4;
  const converted=convertDisplay(original,"mm","in");
  assert.ok(Math.abs(convertDisplay(converted,"in","mm")-original)<0.000001,field);
 }
 assert.throws(()=>toMm(1,"cm"),/Unknown/);
 assert.equal(displayNumber(25.4,"in"),"1");
});
test("inch and metric entries yield identical canonical facing path and quote",()=>{
 const inches=Object.fromEntries(Object.entries(inputs).map(([key,value])=>[
  key,key.endsWith("_mm")||key.endsWith("_mm_min")?toMm(fromMm(value,"in"),"in"):value
 ]));
 assert.deepEqual(planFacing(inches),planFacing(inputs));
 assert.equal(estimateFacing(planFacing(inches),{quantity:10}).quote_basis.estimated_operation_per_part,
  estimateFacing(planFacing(inputs),{quantity:10}).quote_basis.estimated_operation_per_part);
});
test("inches preserve laser time and inference speeds on re-entry",()=>{
 const cut=2200,speed=2500;
 const a=estimateProcess("hk",{quantity:10,setup_minutes:30,machine_rate_per_hour:85,
 overhead_percent:10,margin_percent:20,cut_length_mm:cut,cut_speed_mm_min:speed,pierce_count:6,pierce_seconds:1.5});
 const b=estimateProcess("hk",{quantity:10,setup_minutes:30,machine_rate_per_hour:85,
 overhead_percent:10,margin_percent:20,cut_length_mm:toMm(fromMm(cut,"in"),"in"),
 cut_speed_mm_min:toMm(fromMm(speed,"in"),"in"),pierce_count:6,pierce_seconds:1.5});
 assert.equal(a.metrics.estimated_motion_min_per_part,b.metrics.estimated_motion_min_per_part);
 const guess=inferFacingTool({width_mm:86,height_mm:56,material:"aluminum-6061"});
 assert.ok(Math.abs(toMm(fromMm(guess.suggested.feed_mm_min,"in"),"in")-guess.suggested.feed_mm_min)<1e-9);
});
test("review-only G20 listing converts coordinates and feed, G21 retains metric",()=>{
 const plan=planFacing(inputs);
 const inch=reviewOnlyListing(plan,{units:"in"});
 const mm=reviewOnlyListing(plan,{units:"mm"});
 assert.match(inch,/G20 G17 G90/);
 assert.match(mm,/G21 G17 G90/);
 assert.match(inch,/INCHES/);
 assert.match(inch,/F4\.72441/); // 120 mm/min plunge = 4.72441 in/min
 assert.match(mm,/F120\.000/);
 assert.match(inch,/NOT FOR MACHINE EXECUTION/);
 assert.doesNotMatch(inch,/^M0?3\b/m);
 assert.throws(()=>reviewOnlyListing(plan,{units:"ft"}),/Unknown/);
});
test("visible browser defaults to inch entry and labels stay dynamic",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const app=readFileSync(new URL("./app.mjs",import.meta.url),"utf8");
 assert.match(html,/<select id="units"/);
 assert.match(html,/<option value="in" selected>/);
 for(const id of Object.keys(UNIT_FIELDS)){
  assert.match(html,new RegExp('data-unit-for="'+id+'"'));
 }
 assert.match(app,/initialUnits="in"/);
 assert.match(app,/localStorage\.setItem\("ezcam\.display_units\.v1",next\)/);
 assert.match(app,/activeEstimate\.canonical_units="mm"/);
 assert.match(app,/reviewOnlyListing\(activePlan,\{units:currentUnits\}\)/);
});
