/* Generic shop-learning illustration, not a live BEAN agent or machining database.
 * Bounded assumptions, transparent formulas, and editable results.
 * All stock/material examples are fictional and non-proprietary.
 */
// All figures are clearly fictional starting assumptions, NOT shop cutting data.
const MILD_STEEL_REFERENCE=Object.freeze({
  vc_m_min:70,chip_mm_tooth:0.035,flutes:4,stepdown_factor:0.04,stepover_ratio:0.52
});
export const MATERIALS=Object.freeze({
  "aluminum-6061":{label:"6061 aluminum (illustrative)",vc_m_min:120,chip_mm_tooth:0.045,flutes:3,stepdown_factor:0.065,stepover_ratio:0.58,notes:"Assumes a generic carbide end mill and stable coolant/chip evacuation."},
  "aluminum-5052":{label:"5052 aluminum (illustrative)",vc_m_min:100,chip_mm_tooth:0.04,flutes:3,stepdown_factor:0.055,stepover_ratio:0.55,notes:"Generic editable 5052 starting assumptions; gummy chip behavior, tooling and lubricant need operator verification."},
  "steel-1018":{label:"1018 mild steel (illustrative)",...MILD_STEEL_REFERENCE,notes:"Assumes generic carbide tooling in a sufficiently rigid machine."},
  "steel-hot-rolled":{label:"Hot rolled steel / HR (grade unspecified)",...MILD_STEEL_REFERENCE,grade_unspecified:true,notes:"Hot rolled describes processing, not a grade. Uses the same illustrative 1018-like mild-steel starting assumptions; scale and actual grade may change the choice."},
  "steel-hrpo":{label:"HRPO / pickled and oiled steel (grade unspecified)",...MILD_STEEL_REFERENCE,grade_unspecified:true,notes:"Pickled and oiled describes surface processing, not an alloy. Assumes an illustrative 1018-like mild steel pending actual grade confirmation."},
  "steel-crs":{label:"Cold rolled steel / CRS (grade unspecified)",...MILD_STEEL_REFERENCE,grade_unspecified:true,notes:"Cold rolled describes processing, not an alloy. Assumes an illustrative 1018-like mild steel pending actual grade confirmation."},
  "stainless-304":{label:"304 stainless (illustrative)",vc_m_min:45,chip_mm_tooth:0.026,flutes:4,stepdown_factor:0.025,stepover_ratio:0.45,notes:"Work hardening, heat and tool engagement require specialist verification."},
  "acetal":{label:"Acetal plastic (illustrative)",vc_m_min:140,chip_mm_tooth:0.055,flutes:2,stepdown_factor:0.09,stepover_ratio:0.6,notes:"Assumes material-compatible cutting geometry and chip control."}
});
// Public shorthand normalization only. No drawing/ERP material extraction is implemented.
const MATERIAL_ALIASES=Object.freeze({
  "6061":"aluminum-6061","al6061":"aluminum-6061","6061aluminum":"aluminum-6061","aluminum6061":"aluminum-6061",
  "5052":"aluminum-5052","al5052":"aluminum-5052","5052aluminum":"aluminum-5052","aluminum5052":"aluminum-5052",
  "1018":"steel-1018","1018steel":"steel-1018","mildsteel1018":"steel-1018",
  "hr":"steel-hot-rolled","hotroll":"steel-hot-rolled","hotrolled":"steel-hot-rolled","hotrolledsteel":"steel-hot-rolled","hrsteel":"steel-hot-rolled",
  "hrpo":"steel-hrpo","po":"steel-hrpo","pohrpo":"steel-hrpo","hrpando":"steel-hrpo","pickledoiled":"steel-hrpo","pickledandoiled":"steel-hrpo","pickledandoiledsteel":"steel-hrpo","hotrolledpickledandoiled":"steel-hrpo",
  "crs":"steel-crs","coldroll":"steel-crs","coldrolled":"steel-crs","coldrolledsteel":"steel-crs","crsteel":"steel-crs",
  "304":"stainless-304","ss304":"stainless-304","304ss":"stainless-304","304stainless":"stainless-304","304stainlesssteel":"stainless-304","stainless304":"stainless-304","stainlesssteel304":"stainless-304",
  "acetalplastic":"acetal","pom":"acetal"
});
export function resolveMaterial(material){
  if(typeof material!=="string")throw Error("Unknown generic material profile");
  const direct=material.trim().toLowerCase();
  if(Object.hasOwn(MATERIALS,direct))return direct;
  const normalized=direct.replace(/[^a-z0-9]+/g,"");
  const id=MATERIAL_ALIASES[normalized];
  if(!id)throw Error("Unknown generic material profile; select a grade or clearly labeled process category");
  return id;
}
const DIAMETERS=[6,8,10,12,16,20,25];
const num=(v,name,lo,hi)=>{
  const n=Number(v);
  if(!Number.isFinite(n)||n<=lo||n>hi)throw Error(name+" out of supported range");
  return n;
};
export function inferFacingTool({
  width_mm=86,height_mm=56,material="aluminum-6061",machine_max_rpm=12000
}={}){
  const width=num(width_mm,"Stock width",0,10000);
  const height=num(height_mm,"Stock height",0,10000);
  const maxrpm=num(machine_max_rpm,"Machine RPM limit",100,40000);
  const materialId=resolveMaterial(material);
  const profile=MATERIALS[materialId];
  // Stock-limited proposal only. Not a loaded inventory or tool-library lookup.
  const maxDia=Math.max(6,Math.min(20,Math.min(width,height)*0.35));
  const diameter=DIAMETERS.filter(d=>d<=maxDia).at(-1)||6;
  const theoreticalRpm=1000*profile.vc_m_min/(Math.PI*diameter);
  const rpm=Math.max(1,Math.floor(Math.min(maxrpm,theoreticalRpm)));
  const feed=Math.max(1,Math.round(rpm*profile.flutes*profile.chip_mm_tooth));
  const stepover=profile.stepover_ratio;
  const stepdown=Math.max(0.15,Math.round(diameter*profile.stepdown_factor*100)/100);
  const plunge=Math.max(1,Math.round(feed*0.22));
  return {
    schema:"ezcam.tool_inference.v1",status:"ILLUSTRATIVE_NOT_BEAN_CONNECTED",
    suggested:{
      cutter:"Flat carbide end mill (generic, not inventory-verified)",
      diameter_mm:diameter,flutes:profile.flutes,rpm,
      feed_mm_min:feed,plunge_mm_min:plunge,
      stepover_ratio:stepover,stepdown_mm:stepdown,
      clearance_mm:5,rapid_mm_min:3000
    },
    basis:{
      material:profile.label,
      material_id:materialId,
      grade_unspecified:profile.grade_unspecified===true,
      assumed_cutting_speed_m_min:profile.vc_m_min,
      assumed_chip_load_mm_tooth:profile.chip_mm_tooth,
      machine_max_rpm:maxrpm,
      theoretical_rpm:theoreticalRpm,
      formulas:"RPM = 1000 × cutting speed (m/min) / (pi × diameter mm); XY feed = RPM × flutes × chip load",
      stock_tool_diameter_limit_mm:maxDia
    },
    reasons:[
      "Tool diameter chosen from a fictional generic selection based on stock footprint.",
      "RPM and feed inferred from editable, illustrative material/tool assumptions, then RPM-limited.",
      profile.notes
    ],
    limitations:[
      "Rule-based estimate only. The BEAN inference service is not connected.",
      "Tool existence, geometry, flute length, holder, rigidity, horsepower, fixturing and coolant are unverified.",
      "No chip thinning, cutting-force calculation, acceleration, collision or machine-specific safety validation.",
      "Do not use this recommendation to run a CNC machine or to issue an approved customer quote."
    ]
  };
}
