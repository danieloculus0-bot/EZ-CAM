/* Public fictional equipment families. Brand names describe choices, not models.
 * No shop-specific capacities, tooling, controller posts or real machine data.
 */
export const MACHINE_FAMILIES=Object.freeze({
  mill:{label:"3-axis mill",operation:"Facing preview",details:"Tool inference + real synthetic facing toolpath geometry. No verified machine simulation."},
  laser:{label:"Sheet laser",operation:"Cut-time estimate",details:"Manual cut-length, assumed traverse, and piercing-time estimate. No nesting or laser program."},
  brake:{label:"Press brake",operation:"Bend-time estimate",details:"Manual number of bends, assumed stroke/handling time. No bend sequence or force validation."}
});
export const MACHINE_PROFILES=Object.freeze([
  {id:"hurco",brand:"Hurco",family:"mill"},
  {id:"fadal",brand:"Fadal",family:"mill"},
  {id:"doosan",brand:"Doosan",family:"mill"},
  {id:"hk",brand:"HK",family:"laser"},
  {id:"trumpf",brand:"TRUMPF",family:"laser"},
  {id:"bystronic",brand:"Bystronic",family:"brake"},
  {id:"accurpress",brand:"Accurpress",family:"brake"}
].map(p=>Object.freeze({...p,model:"NOT CONFIGURED",controller:"NOT CONFIGURED",capabilities_verified:false})));
export function machineById(id){
  const found=MACHINE_PROFILES.find(p=>p.id===id);
  if(!found)throw Error("Choose a listed generic machine family");
  return found;
}
function number(v,label,lo,hi){
  const n=Number(v);
  if(!Number.isFinite(n)||n<lo||n>hi)throw Error(label+" must be between "+lo+" and "+hi);
  return n;
}
function whole(v,label,lo,hi){
 const n=number(v,label,lo,hi);
 if(!Number.isInteger(n))throw Error(label+" must be a whole number");
 return n;
}
export function estimateProcess(machineId, inputs){
 const machine=machineById(machineId);
 const qty=whole(inputs.quantity, "Quantity",1,100000);
 const setup=number(inputs.setup_minutes,"Setup minutes",0,100000);
 const hourly=number(inputs.machine_rate_per_hour,"Illustrative hourly rate",0,100000);
 const overhead=number(inputs.overhead_percent,"Overhead percent",0,500);
 const margin=number(inputs.margin_percent,"Margin percent",0,95);
 let perPartMinutes, operation, technical;
 if(machine.family==="laser"){
  const distance=number(inputs.cut_length_mm,"Cut length mm",0,10000000);
  const speed=number(inputs.cut_speed_mm_min,"Assumed cutting speed",0.01,500000);
  const count=whole(inputs.pierce_count,"Pierce count",0,100000);
  const seconds=number(inputs.pierce_seconds,"Pierce seconds",0,300);
  // Explicitly assumes one average cut velocity; ignores corner slowdowns.
  perPartMinutes=distance/speed+count*seconds/60;
  operation="laser_cut_time_only";
  technical={cut_length_mm:distance,cut_speed_mm_min:speed,pierce_count:count,pierce_seconds:seconds};
 } else if(machine.family==="brake"){
  const bends=whole(inputs.bend_count,"Bend count",0,10000);
  const cycle=number(inputs.seconds_per_bend,"Assumed seconds per bend",0,600);
  const handling=number(inputs.handling_seconds,"Handling seconds per part",0,10000);
  perPartMinutes=(bends*cycle+handling)/60;
  operation="press_brake_cycle_time_only";
  technical={bend_count:bends,seconds_per_bend:cycle,handling_seconds:handling};
 }else{
  throw Error("Mill quotations require a generated facing plan");
 }
 const totalMinutes=setup+perPartMinutes*qty;
 const operationCost=totalMinutes/60*hourly*(1+overhead/100)/(1-margin/100);
 return {
  schema:"ezcam.estimate.v1", source:"fictional_browser_example",
  status:"UNVERIFIED_ESTIMATE", machine_verified:false,production_approved:false,
  generated_at:new Date().toISOString(),units:"mm",
  machine:{brand:machine.brand,family:machine.family,model:null,controller:null,capacity_verified:false},
  operation,description:"Illustrative single-operation estimate only, never a complete part quote.",
  metrics:{estimated_motion_min_per_part:perPartMinutes,assumed_inputs:technical},
  quote_basis:{quantity:qty,machine_rate_per_hour:hourly,setup_minutes:setup,
   overhead_percent:overhead,margin_percent:margin,
   estimated_operation_total:operationCost,estimated_operation_per_part:operationCost/qty,
   currency:"USD",material_cost_included:false},
  assumptions:{machine_specific_process_data:false,no_model_configuration:true,
    no_tooling_or_fixture_verification:true,no_actual_machine_or_inventory_link:true,
    operator_inputs_not_observed:true},
  warnings:[
   "Synthetic public illustration. Machine brand is a generic category, not a configured or validated equipment model.",
   "Input cycle speeds are user assumptions. No cutting-force, bending-force, nesting, acceleration or collision verification.",
   "No material, tooling, scrap, loading, inspection or other operations included.",
   "Not an approved customer quotation or production program."
  ]
 };
}
