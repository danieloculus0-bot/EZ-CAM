import test from "node:test";
import assert from "node:assert/strict";
import {simulateBrakeSection,rankBendSequences} from "./brake-sim.mjs";

const section={
 length_mm:120,thickness_mm:1.5,
 bends:[{id:"B1",position_mm:40,angle_deg:90},
        {id:"B2",position_mm:80,angle_deg:-90}]
};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,
  "Expected "+expected+", got "+actual);

test("parallel-axis fold transforms actual downstream vertices",()=>{
 const result=simulateBrakeSection(section);
 assert.equal(result.schema,"ezcam.brake_section_sim.v1");
 assert.equal(result.configured_obstacle_envelopes,0);
 assert.equal(result.collision_scope,"SELF_ONLY");
 assert.equal(result.machine_verified,false);
 assert.equal(result.production_approved,false);
 assert.equal(result.controller_output,false);
 const v=result.final_vertices;
 assert.equal(v.length,4);
 near(v[0].x,0);near(v[0].y,0);
 near(v[1].x,40);near(v[1].y,0);
 near(v[2].x,40);near(v[2].y,40);
 near(v[3].x,80);near(v[3].y,40);
 assert.equal(result.frames.length,19);
});
test("bend order can change intermediate poses but not the ideal final section",()=>{
 const a=simulateBrakeSection(section);
 const b=simulateBrakeSection({...section,sequence:["B2","B1"]});
 for(let i=0;i<a.final_vertices.length;i++){
  near(a.final_vertices[i].x,b.final_vertices[i].x);
  near(a.final_vertices[i].y,b.final_vertices[i].y);
 }
 assert.notDeepEqual(a.frames[1].vertices,b.frames[1].vertices);
 assert.equal(b.trace[0].bend_id,"B2");
});
test("continuous sampled bend catches geometry collisions with supplied 2D envelope",()=>{
 const one={length_mm:100,thickness_mm:1,
  bends:[{id:"B1",position_mm:40,angle_deg:90}]};
 const clear=simulateBrakeSection(one);
 assert.equal(clear.metrics.collision_frames,0);
 const blocked=simulateBrakeSection({...one,obstacles:[
  {id:"punch-proxy",x_min_mm:-3,x_max_mm:3,y_min_mm:25,y_max_mm:40}
 ]},{increment_deg:5});
 assert.equal(blocked.collision_scope,"SELF_AND_SUPPLIED_2D_OBSTACLES");
 assert.ok(blocked.metrics.collision_frames>0);
 assert.ok(blocked.frames.some(f=>f.collisions.some(c=>
  c.kind==="obstacle"&&c.obstacle_id==="punch-proxy")));
 assert.equal(blocked.machine_verified,false);
});
test("non-neighbor folded flanges cannot pass through each other unnoticed",()=>{
 const loop={length_mm:80,thickness_mm:1,
  bends:[{position_mm:20,angle_deg:90},{position_mm:40,angle_deg:90},
         {position_mm:60,angle_deg:90}]};
 const r=simulateBrakeSection(loop);
 assert.ok(r.metrics.collision_frames>0);
 assert.ok(r.frames.some(f=>f.collisions.some(c=>c.kind==="self")));
});
test("invalid positions, orders and envelopes fail closed",()=>{
 for(const x of [
  {...section,length_mm:NaN},
  {...section,bends:[{position_mm:40,angle_deg:0}]},
  {...section,bends:[{position_mm:40,angle_deg:90},{position_mm:40.5,angle_deg:90}]},
  {...section,sequence:["B1","B1"]},
  {...section,sequence:["B1","NOPE"]},
  {...section,obstacles:[{x_min_mm:3,x_max_mm:2,y_min_mm:2,y_max_mm:8}]},
  {...section,thickness_mm:-1},
  {...section,bends:[]}
 ])assert.throws(()=>simulateBrakeSection(x));
 assert.throws(()=>simulateBrakeSection(section,{increment_deg:0}));
});
test("bounded sequence search reports evidence and never claims a machine program",()=>{
 const input={length_mm:80,thickness_mm:1,
  bends:[{position_mm:20,angle_deg:90},{position_mm:40,angle_deg:90},
         {position_mm:60,angle_deg:90}]};
 const ranked=rankBendSequences(input);
 assert.equal(ranked.candidates_tested,6);
 assert.deepEqual(ranked.simulation.config.sequence,ranked.best.sequence);
 assert.equal(ranked.bean_connected,false);
 assert.equal(ranked.machine_verified,false);
 assert.equal(ranked.top_candidates[0].collision_frames,ranked.best.collision_frames);
 assert.ok(ranked.top_candidates.every(x=>!Object.hasOwn(x,"simulation")));
 assert.throws(()=>rankBendSequences(input,{candidate_limit:0}));
});
test("larger candidate search is finite and deterministic",()=>{
 const input={length_mm:180,thickness_mm:1,
  bends:Array.from({length:7},(_,i)=>({
   id:"F"+i,position_mm:20+i*20,angle_deg:(i%2? -1:1)*45
  }))};
 const a=rankBendSequences(input,{candidate_limit:12});
 const b=rankBendSequences(input,{candidate_limit:12});
 assert.ok(a.candidates_tested>=2&&a.candidates_tested<=12);
 assert.deepEqual(a.best,b.best);
});
