import test from "node:test";
import assert from "node:assert/strict";
import {evaluateBrakeDecision} from "./brake-challenge.mjs";
const section={length_mm:120,thickness_mm:1.5,bends:[
 {id:"B1",position_mm:40,angle_deg:90},
 {id:"B2",position_mm:80,angle_deg:-90}]};
test("synthetic candidate gets independently recomputed feedback",()=>{
 const a=evaluateBrakeDecision(section,{sequence:["B1","B2"]});
 assert.equal(a.schema,"ezcam.bean_brake_challenge.v1");
 assert.equal(a.machine_verified,false);
 assert.equal(a.bean_connected,false);
 assert.equal(a.reference.candidates_tested,2);
 assert.equal(a.reference.exhaustive,true);
 assert.deepEqual(a.candidate,{collision_frames:a.baseline.collision_frames,
  collision_events:a.baseline.collision_events});
 assert.equal(a.feedback.improves_baseline,false);
});
test("alternative order ignores agent-reported collision metrics",()=>{
 const a=evaluateBrakeDecision(section,{sequence:["B2","B1"],collision_frames:-999});
 const b=evaluateBrakeDecision(section,{sequence:["B2","B1"],collision_frames:999});
 assert.deepEqual(a,b);
 assert.deepEqual(a.decision.sequence,["B2","B1"]);
});
test("invalid or incomplete decisions fail closed",()=>{
 for(const decision of [null,{},[],{sequence:["B1"]},
  {sequence:["B1","B1"]},{sequence:["B1","missing"]}])
  assert.throws(()=>evaluateBrakeDecision(section,decision));
 assert.throws(()=>evaluateBrakeDecision(section,{sequence:["B1","B2"]},{candidate_limit:0}));
});
