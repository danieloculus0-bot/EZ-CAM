/* Synthetic decision environment for external reasoning agents, including BEAN.
 * EZ-CAM's solver independently evaluates proposed sequences.
 * No machine verification, hardware access, or live Core connection.
 */
import {simulateBrakeSection,rankBendSequences} from "./brake-sim.mjs";

export function evaluateBrakeDecision(section,proposal,{candidate_limit=48}={}){
 if(!proposal||typeof proposal!=="object"||Array.isArray(proposal))
  throw Error("A proposed decision object is required");
 if(!Array.isArray(proposal.sequence))throw Error("Proposed sequence is required");
 const baseline=simulateBrakeSection(section);
 const candidate=simulateBrakeSection({...section,sequence:proposal.sequence});
 const search=rankBendSequences(section,{candidate_limit});
 const score=run=>({collision_frames:run.metrics.collision_frames,
  collision_events:run.metrics.collision_events});
 const base=score(baseline),actual=score(candidate);
 const reference={collision_frames:search.best.collision_frames,
  collision_events:search.best.collision_events};
 const compare=(a,b)=>a.collision_frames-b.collision_frames||a.collision_events-b.collision_events;
 let permutations=1;
 for(let i=2;i<=candidate.config.bends.length;i++)permutations*=i;
 return {
  schema:"ezcam.bean_brake_challenge.v1",
  status:"SYNTHETIC_GEOMETRY_EVALUATION",
  machine_verified:false,bean_connected:false,production_approved:false,
  decision:{sequence:[...candidate.config.sequence]},
  baseline:{sequence:[...baseline.config.sequence],...base},
  candidate:actual,
  reference:{...reference,candidates_tested:search.candidates_tested,
   exhaustive:search.candidates_tested===permutations},
  feedback:{improves_baseline:compare(actual,base)<0,
   matches_search_best:compare(actual,reference)===0,
   collision_free_in_sample:actual.collision_frames===0},
  limitations:"2D sampled section collisions only; bounded reference search may not be globally optimal"
 };
}
