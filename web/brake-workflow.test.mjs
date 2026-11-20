import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildBrakeOperation,DEFAULT_BRAKE_SECTION} from "./brake-workflow.mjs";

const quote={quantity:10,machine_rate_per_hour:85,setup_minutes:30,
 overhead_percent:10,margin_percent:20,seconds_per_bend:18,handling_seconds:20};

test("the EZ CAM brake workflow performs actual sectional geometry and derives estimate bend count",()=>{
 const r=buildBrakeOperation("bystronic",DEFAULT_BRAKE_SECTION,quote);
 assert.equal(r.simulation.schema,"ezcam.brake_section_sim.v1");
 assert.equal(r.simulation.trace.length,2);
 assert.equal(r.estimate.machine.brand,"Bystronic");
 assert.equal(r.estimate.metrics.assumed_inputs.bend_count,2);
 assert.equal(r.estimate.metrics.estimated_motion_min_per_part,(2*18+20)/60);
 assert.equal(r.estimate.brake_review.simulation.frames.length,r.simulation.frames.length);
 assert.equal(r.estimate.brake_review.schema,"ezcam.brake_review_evidence.v1");
 assert.equal(r.estimate.brake_review.production_approved,false);
 assert.equal(r.estimate.brake_review.bean_connected,false);
 assert.equal(r.estimate.production_approved,false);
 assert.equal(r.estimate.machine_verified,false);
 assert.equal(r.ranking,null);
});

test("optimizing a brake sequence also returns review evidence and same geometry-driven quote basis",()=>{
 const plain=buildBrakeOperation("accurpress",DEFAULT_BRAKE_SECTION,quote);
 const optimized=buildBrakeOperation("accurpress",DEFAULT_BRAKE_SECTION,quote,{optimize:true});
 assert.ok(optimized.ranking.candidates_tested>=2);
 assert.deepEqual(optimized.estimate.brake_review.sequence_search.best.sequence,
  optimized.simulation.config.sequence);
 assert.equal(plain.estimate.quote_basis.estimated_operation_total,
  optimized.estimate.quote_basis.estimated_operation_total);
 assert.equal(optimized.estimate.metrics.assumed_inputs.bend_count,
  optimized.simulation.config.bends.length);
});

test("invalid geometry cannot silently produce an approved or standalone estimate",()=>{
 assert.throws(()=>buildBrakeOperation("hurco",DEFAULT_BRAKE_SECTION,quote),/press-brake/);
 assert.throws(()=>buildBrakeOperation("bystronic",{...DEFAULT_BRAKE_SECTION,
  bends:[{id:"B1",position_mm:10,angle_deg:0}]},quote),/Zero-degree/);
 assert.throws(()=>buildBrakeOperation("bystronic",DEFAULT_BRAKE_SECTION,
  {...quote,quantity:0}),/Quantity/);
});

test("main EZ CAM provides embedded bend simulation, a shared preview, export and ecosystem navigation",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const app=readFileSync(new URL("./app.mjs",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("./brake-workflow.mjs",import.meta.url),"utf8");
 assert.match(html,/id="brake-geometry"/);
 assert.match(html,/id="brake-optimize"/);
 assert.match(html,/id="brake-reset"/);
 assert.match(html,/id="brake-evidence"/);
 assert.match(html,/id="preview"/);
 assert.match(html,/BEAN\/portfolio\//);
 assert.match(html,/Axiom_Beta\/erp\//);
 assert.doesNotMatch(html,/<iframe[^>]*brake-lab/);
 assert.match(app,/import\s+\{buildBrakeOperation,DEFAULT_BRAKE_SECTION\}/);
 assert.match(app,/function drawBrake\(/);
 assert.match(app,/activeBrakeSimulation=/);
 assert.match(workflow,/brake_review/);
 assert.match(app,/activeBrakeOptimization/);
 assert.match(app,/brake-optimize/);
 assert.match(app,/brake-geometry/);
});
