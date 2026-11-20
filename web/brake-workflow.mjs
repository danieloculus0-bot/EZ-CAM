/* EZ CAM browser press-brake workflow adapter.
 * Uses one shared geometric solver for the main CAM workbench and stand-alone lab.
 * A geometry-derived bend count feeds the existing assumption-based cost engine.
 * No live BEAN, imported CAD, controller post, or machine qualification.
 */
import {machineById,estimateProcess} from "./machines.mjs";
import {simulateBrakeSection,rankBendSequences} from "./brake-sim.mjs";

export const DEFAULT_BRAKE_SECTION=Object.freeze({
 length_mm:180,
 thickness_mm:2,
 bends:Object.freeze([
  Object.freeze({id:"B1",position_mm:40,angle_deg:90}),
  Object.freeze({id:"B2",position_mm:110,angle_deg:-90})
 ]),
 obstacles:Object.freeze([])
});

export function buildBrakeOperation(machineId,section,quote,{optimize=false,candidate_limit=48}={}){
 const machine=machineById(machineId);
 if(machine.family!=="brake")throw Error("Choose a press-brake family before simulating bends");
 const ranking=optimize?rankBendSequences(section,{candidate_limit}):null;
 const simulation=ranking?ranking.simulation:simulateBrakeSection(section);
 // The cycle estimate must be tied to the exact geometry being simulated.
 const bends=simulation.config.bends.length;
 const estimate=estimateProcess(machineId,{...quote,bend_count:bends});
 estimate.brake_review={
  schema:"ezcam.brake_review_evidence.v1",
  status:"GEOMETRY_REVIEW_ONLY",
  machine_verified:false,
  bean_connected:false,
  production_approved:false,
  source:"editable_synthetic_section",
  collision_scope:simulation.collision_scope,
  simulation,
  sequence_search:ranking?{
   candidates_tested:ranking.candidates_tested,
   selection_basis:ranking.selection_basis,
   best:ranking.best,
   top_candidates:ranking.top_candidates
  }:null
 };
 estimate.warnings.push(
  "The bend count comes from the simulated section, not an independently-entered cycle-time guess.",
  "Section contact and optional user-defined 2D obstacles are not real 3D tooling or machine-collision verification.",
  "The sequence is a geometric review candidate, not an approved brake-press program."
 );
 return {simulation,ranking,estimate};
}
