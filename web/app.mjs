import {planFacing,estimateFacing,reviewOnlyListing} from "./engine.mjs";
import {UNIT_FIELDS,UNIT_LABELS,toMm,fromMm,convertDisplay,displayNumber} from "./units.mjs";
import {inferFacingTool} from "./tool-inference.mjs";
import {machineById,MACHINE_FAMILIES,estimateProcess} from "./machines.mjs";
import {buildBrakeOperation,DEFAULT_BRAKE_SECTION} from "./brake-workflow.mjs";
const $=id=>document.getElementById(id);
const val=id=>Number($(id).value);
const fmt=(n,d=2)=>Number(n).toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:d});
const money=n=>Number(n).toLocaleString("en-US",{style:"currency",currency:"USD"});
let activePlan=null,activeEstimate=null,activeInference=null,anim=null;
let activeBrakeSimulation=null,activeBrakeRanking=null,activeBrakeOptimization=false;
let currentUnits="mm"; // HTML starts from canonical-mm examples.
const metric=id=>toMm(val(id),currentUnits);
const shown=(mm,d=4)=>displayNumber(mm,currentUnits,d);
const suffix=()=>currentUnits==="in"?"in":"mm";
function chooseUnits(next){
 if(next!=="in"&&next!=="mm"||next===currentUnits)return;
 for(const id of Object.keys(UNIT_FIELDS)){
  const input=$(id);
  for(const attr of ["value","min","max","step"]){
   const raw=attr==="value"?input.value:input.getAttribute(attr);
   if(raw!==null&&raw!==""&&Number.isFinite(Number(raw))){
    const converted=convertDisplay(raw,currentUnits,next);
    if(attr==="value")input.value=String(converted);
    else input.setAttribute(attr,String(converted));
   }
  }
  const label=document.querySelector('[data-unit-for="'+id+'"]');
  if(label)label.textContent="("+UNIT_LABELS[UNIT_FIELDS[id]][next]+")";
 }
 currentUnits=next;$("units").value=next;
 try{localStorage.setItem("ezcam.display_units.v1",next);}catch{}
 activeInference=null;
 $("suggestion").textContent="Units changed. Re-run cutter inference to refresh suggestions.";
 clearResults();
 explain("Units set to "+(next==="in"?"inches":"millimeters")+". Dimensions converted; rebuild the estimate.");
}
const canvas=$("preview"),ctx=canvas.getContext("2d");
function selected(){return machineById($("machine").value);}
function explain(message,error=false){$("result").textContent=message;$("result").classList.toggle("error",error);}
function clearResults(){
 activePlan=null;activeEstimate=null;
 activeBrakeSimulation=null;activeBrakeRanking=null;activeBrakeOptimization=false;
 $("brake-evidence").textContent="A bend simulation has not been generated.";
 $("export").disabled=true;$("listing").disabled=true;
 $("motion").textContent="—";$("cost").textContent="—";$("unitcost").textContent="—";
 $("progress").value=100;
 if(anim!==null){cancelAnimationFrame(anim);anim=null;}
 draw();
}
function familyChange(){
 const m=selected(),family=m.family;
 $("mill-fields").hidden=family!=="mill";
 $("laser-fields").hidden=family!=="laser";
 $("brake-fields").hidden=family!=="brake";
 $("stage-title").textContent=family==="mill"?"TOP VIEW / FACING PATH":family==="laser"?"SHEET LASER / CYCLE ESTIMATE":"PRESS BRAKE / SECTION SIMULATION";
 $("calculate").textContent=family==="brake"?"SIMULATE + ESTIMATE":"BUILD ESTIMATE";
 $("export").textContent=family==="brake"?"Download estimate + bend evidence JSON":"Download estimate JSON (future Axiom adapter)";
 $("playbar-label").textContent=family==="brake"?"BEND PLAYBACK":"PATH PLAYBACK";
 $("brake-frame-info").hidden=family!=="brake";
 $("stage-note").textContent=MACHINE_FAMILIES[family].details;
 $("machine-note").textContent=m.brand+" profile: generic "+MACHINE_FAMILIES[family].label.toLowerCase()+". Model, controller, capacity and available tooling are unconfigured.";
 activeInference=null;
 clearResults();
 explain("Selected "+m.brand+" (generic "+family+"). Build an estimate to calculate a fictional single operation.");
}
function infer(){
 try{
  const inf=inferFacingTool({width_mm:metric("width"),height_mm:metric("height"),material:$("material").value,machine_max_rpm:val("maxrpm")});
  const s=inf.suggested;activeInference=inf;
  $("diameter").value=fromMm(s.diameter_mm,currentUnits);$("rpm").value=s.rpm;
  $("stepover").value=Number((s.stepover_ratio*100).toFixed(2));
  $("stepdown").value=fromMm(s.stepdown_mm,currentUnits);$("feed").value=fromMm(s.feed_mm_min,currentUnits);
  $("plunge").value=fromMm(s.plunge_mm_min,currentUnits);$("clearance").value=fromMm(s.clearance_mm,currentUnits);
  $("rapid").value=fromMm(s.rapid_mm_min,currentUnits);
  $("suggestion").textContent=
   "INFERENCE · "+s.cutter+"\n"+
   inf.basis.material+"\n"+
   "Ø"+shown(s.diameter_mm)+" "+suffix()+" · "+fmt(s.rpm,0)+" RPM · XY "+shown(s.feed_mm_min,2)+" "+suffix()+"/min · plunge "+shown(s.plunge_mm_min,2)+" "+suffix()+"/min · "+s.flutes+" flutes\n"+
   "Vc assumption "+(currentUnits==="in"?fmt(inf.basis.assumed_cutting_speed_m_min/0.3048,1)+" ft/min":inf.basis.assumed_cutting_speed_m_min+" m/min")+"; chip-load assumption "+shown(inf.basis.assumed_chip_load_mm_tooth,5)+" "+suffix()+"/tooth. "+
   (inf.basis.grade_unspecified?"PROCESS LABEL ONLY: material grade unknown; 1018-like mild steel assumed. ":"")+
   "Rule-based estimate, not live BEAN or machine-verified.";
  clearResults();explain("Suggested inputs populated. Change any field, then BUILD ESTIMATE. All inferred values require machinist review.");
 }catch(error){$("suggestion").textContent="Cannot infer: "+error.message;clearResults();}
}
function commonInputs(){
 return {quantity:val("quantity"), machine_rate_per_hour:val("rate"),setup_minutes:val("setuptime"),
 overhead_percent:val("overhead"),margin_percent:val("margin")};
}
function build(){
 try{
  const m=selected(),q=commonInputs();
  if(m.family==="mill"){
   const params={width_mm:metric("width"),height_mm:metric("height"),facing_allowance_mm:metric("allowance"),
     origin:$("origin").value,diameter_mm:metric("diameter"),stepover_ratio:val("stepover")/100,
     stepdown_mm:metric("stepdown"),feed_mm_min:metric("feed"),plunge_mm_min:metric("plunge"),
     clearance_mm:metric("clearance"),rapid_mm_min:metric("rapid")};
   activePlan=planFacing(params);
   activeEstimate=estimateFacing(activePlan,q);
   activeEstimate.machine={brand:m.brand,family:m.family,model:null,controller:null,capacity_verified:false};
   activeEstimate.inference=activeInference?{...activeInference,operator_review_required:true}:{status:"MANUAL_ENTRY",operator_review_required:true};
   activeEstimate.warnings.push("Machine brand is a generic unconfigured profile. Spindle RPM is reference-only; not emitted in any machine program.");
   activeEstimate.warnings.push("Public demo has NO imported CAD, stock-removal simulation or CNC-qualified toolpath.");
   $("listing").disabled=false;
   explain("FACING ONLY · "+activePlan.passes+" Z level(s) · "+activePlan.rows_per_pass+" rows/level · "+activePlan.moves.length+" path moves. "+
      "Feed path "+shown(activePlan.metrics.feed_length_mm,2)+" "+suffix()+". These are idealized motion-time and cost calculations.");
  }else if(m.family==="laser"){
   activePlan=null;
   activeEstimate=estimateProcess(m.id,{...q,
    cut_length_mm:metric("cutlength"),cut_speed_mm_min:metric("cutspeed"),pierce_count:val("pierces"),pierce_seconds:val("piercetime")});
   $("listing").disabled=true;
   explain("LASER ESTIMATE ONLY · Time = entered cut length / assumed cut speed + pierce allowance. "+
      "Not a nesting result, verified cutting recipe, or laser machine program.");
  }else{
   activePlan=null;
   const section=JSON.parse($("brake-geometry").value);
   const run=buildBrakeOperation(m.id,section,{
    ...q,seconds_per_bend:val("bendtime"),handling_seconds:val("handling")
   },{optimize:activeBrakeOptimization,candidate_limit:48});
   activeBrakeSimulation=run.simulation;
   activeBrakeRanking=run.ranking;
   activeEstimate=run.estimate;
   $("bends").value=String(run.simulation.config.bends.length);
   $("listing").disabled=true;
   const checked=run.simulation.metrics.collision_frames;
   $("brake-evidence").textContent=
    "Sequence: "+run.simulation.config.sequence.join(" / ")+"\n"+
    "Sampled frames: "+run.simulation.frames.length+" · Interference frames: "+checked+"\n"+
    "Collision scope: "+run.simulation.collision_scope+"\n"+
    (run.ranking?"Sequence candidates reviewed: "+run.ranking.candidates_tested+"\n":"")+
    "Bend count used for estimate: "+run.simulation.config.bends.length+"\n"+
    "Section geometry only; no actual machine, BEAN model, or controller program.";
   explain("PRESS BRAKE SECTION SIMULATED · "+run.simulation.config.bends.length+
    " actual section bends · "+run.simulation.frames.length+" sampled frames · "+
    checked+" interference frames. "+(run.ranking?"Ranked "+run.ranking.candidates_tested+
    " bend-order candidates. ":"")+"Cycle-time cost comes from the same bend count. "+
    "This is 2D geometric review, not validated tooling or 3D machine clearance.");
  }
  activeEstimate.display_units=currentUnits;
  activeEstimate.canonical_units="mm";
  $("motion").textContent=fmt(activeEstimate.metrics.estimated_motion_min_per_part)+" min";
  $("cost").textContent=money(activeEstimate.quote_basis.estimated_operation_total);
  $("unitcost").textContent=money(activeEstimate.quote_basis.estimated_operation_per_part);
  $("progress").value=100;
  $("export").disabled=false;
  draw();
 }catch(error){clearResults();explain("Estimate blocked: "+error.message,true);}
}
function download(name,text,type){
 const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),500);
}
function exportEstimate(){
 if(!activeEstimate)return;
 download("ezcam-unverified-operation-estimate.json",JSON.stringify(activeEstimate,null,2)+"\n","application/json");
}
function exportListing(){
 if(!activePlan||!activeEstimate)return;
 download("ezcam-facing-REVIEW-ONLY.txt",reviewOnlyListing(activePlan,{units:currentUnits}),"text/plain");
}
function replay(){
 if(!activePlan&&!activeBrakeSimulation)return;
 if(anim!==null){cancelAnimationFrame(anim);anim=null;}
 const start=performance.now(),duration=3500;
 function frame(now){
  const p=Math.min(100,(now-start)*100/duration);
  $("progress").value=p;draw();
  anim=p<100?requestAnimationFrame(frame):null;
 }
 $("progress").value=0;draw();anim=requestAnimationFrame(frame);
}
function drawBrake(){
 ctx.save();
 const sim=activeBrakeSimulation,w=canvas.width,h=canvas.height;
 ctx.textAlign="left";
 if(!sim){
  ctx.font="bold 24px Segoe UI,Arial";ctx.fillStyle="#dedede";
  ctx.fillText("PRESS BRAKE · SECTION SIMULATION",45,h/2-20);
  ctx.font="16px Segoe UI,Arial";ctx.fillStyle="#b8b8b8";
  ctx.fillText("Edit the section and choose SIMULATE + ESTIMATE.",45,h/2+17);
  ctx.fillText("Or search bend sequences in the left panel.",45,h/2+46);
  $("brake-frame-info").textContent="No bend simulation loaded.";
  ctx.restore();return;
 }
 const index=Math.min(sim.frames.length-1,Math.max(0,
  Math.round((sim.frames.length-1)*Number($("progress").value)/100)));
 const frame=sim.frames[index],points=frame.view_vertices;
 const obstructions=index?sim.config.obstacles:[];
 const xx=points.map(p=>p.x),yy=points.map(p=>p.y);
 for(const b of obstructions){xx.push(b.x_min_mm,b.x_max_mm);yy.push(b.y_min_mm,b.y_max_mm);}
 const minX=Math.min(...xx),maxX=Math.max(...xx),minY=Math.min(...yy),maxY=Math.max(...yy);
 const pad=Math.max(8,sim.config.thickness_mm*5);
 const spanX=Math.max(12,maxX-minX+pad*2),spanY=Math.max(12,maxY-minY+pad*2);
 const scale=Math.min((w-135)/spanX,(h-170)/spanY);
 const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
 const px=x=>w/2+(x-centerX)*scale,py=y=>h/2-(y-centerY)*scale;
 ctx.lineWidth=2;
 for(const b of obstructions){
  const left=px(b.x_min_mm),top=py(b.y_max_mm);
  const rw=(b.x_max_mm-b.x_min_mm)*scale,rh=(b.y_max_mm-b.y_min_mm)*scale;
  ctx.fillStyle="rgba(201,153,83,.13)";ctx.strokeStyle="#d1a65d";
  ctx.fillRect(left,top,rw,rh);ctx.strokeRect(left,top,rw,rh);
 }
 const collisionSegments=new Set();
 for(const hit of frame.collisions){
  if(hit.kind==="self")for(const i of hit.segments)collisionSegments.add(i);
  if(hit.kind==="obstacle")collisionSegments.add(hit.segment);
 }
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];
  ctx.beginPath();ctx.moveTo(px(a.x),py(a.y));ctx.lineTo(px(b.x),py(b.y));
  ctx.strokeStyle=collisionSegments.has(i)?"#fb8178":"#a6ca8d";
  ctx.lineWidth=Math.max(2,Math.min(14,sim.config.thickness_mm*scale));
  ctx.lineCap="round";ctx.stroke();
 }
 for(let i=1;i<points.length-1;i++){
  ctx.beginPath();ctx.arc(px(points[i].x),py(points[i].y),4,0,2*Math.PI);
  ctx.fillStyle="#e2e2e2";ctx.fill();
 }
 const hinge=sim.config.bends.findIndex(b=>b.id===frame.bend_id)+1;
 if(hinge>0){
  ctx.beginPath();ctx.arc(px(points[hinge].x),py(points[hinge].y),11,0,2*Math.PI);
  ctx.strokeStyle="#e2bf7c";ctx.lineWidth=2;ctx.stroke();
 }
 ctx.fillStyle="#e3e3e3";ctx.font="bold 16px Segoe UI,Arial";
 const stage=index===0?"FLAT SECTION":
  "BEND "+frame.step+" · "+frame.bend_id+" · "+Math.round(frame.progress*100)+"%";
 ctx.fillText(stage,25,33);
 ctx.font="13px Segoe UI,Arial";ctx.fillStyle="#bdbdbd";
 ctx.fillText("Frame "+index+" / "+(sim.frames.length-1)+
  " · "+frame.collisions.length+" sampled interference(s)",25,h-22);
 ctx.fillText("Geometry is millimeters · nominal sharp-hinge 2D section only",25,h-43);
 $("brake-frame-info").textContent=stage+" · "+frame.collisions.length+
  " sampled interference(s). Red indicates the flagged section segments.";
 ctx.restore();
}
function draw(){
 const w=canvas.width,h=canvas.height, m=selected();
 ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
 ctx.strokeStyle="rgba(170,170,170,.11)";ctx.lineWidth=1;
 for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 ctx.fillStyle="#b1b1b1";ctx.font="15px Segoe UI,Arial";
 if(m.family==="brake"){drawBrake();return;}
 if(m.family!=="mill"){
  ctx.textAlign="center";
  ctx.fillStyle="#e8e8e8";ctx.font="bold 23px Segoe UI,Arial";
  ctx.fillText(m.brand.toUpperCase()+" · "+MACHINE_FAMILIES[m.family].label.toUpperCase(),w/2,h/2-27);
  ctx.fillStyle="#b2b2b2";ctx.font="17px Segoe UI,Arial";
  ctx.fillText("No CAD, machine post or process simulation is loaded.",w/2,h/2+10);
  ctx.fillText("Only bounded user-assumption cycle-time calculations.",w/2,h/2+40);
  ctx.textAlign="left";return;
 }
 const sw=metric("width"),sh=metric("height");
 if(!Number.isFinite(sw)||!Number.isFinite(sh)||sw<=0||sh<=0){
  ctx.fillText("Enter valid stock dimensions to preview.",20,30);return;
 }
 const d=Math.max(1,metric("diameter")||10),pad=Math.max(d,6);
 const scale=Math.min((w-160)/(sw+2*pad),(h-160)/(sh+2*pad));
 if(scale<=0)return;
 const left=(w-sw*scale)/2,bot=(h+sh*scale)/2;
 const xy=(x,y)=>[left+x*scale,bot-y*scale];
 ctx.fillStyle="#303030";ctx.strokeStyle="#a8a8a8";ctx.lineWidth=2;
 ctx.fillRect(left,bot-sh*scale,sw*scale,sh*scale);
 ctx.strokeRect(left,bot-sh*scale,sw*scale,sh*scale);
 ctx.fillStyle="#484848";ctx.globalAlpha=.7;
 ctx.fillRect(left+sw*.12*scale,bot-sh*.88*scale,sw*.76*scale,sh*.76*scale);
 ctx.globalAlpha=1;
 const ox=$("origin").value==="center"?sw/2:0,oy=$("origin").value==="center"?sh/2:0;
 const [cx,cy]=xy(ox,oy);
 ctx.strokeStyle="#a6ca8d";ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(cx-9,cy);ctx.lineTo(cx+18,cy);ctx.moveTo(cx,cy+9);ctx.lineTo(cx,cy-18);ctx.stroke();
 ctx.font="bold 12px Segoe UI,Arial";ctx.fillStyle="#c6c6c6";ctx.fillText("G54",cx+9,cy+18);
 if(activePlan){
  const limit=Math.max(1,Math.floor(activePlan.moves.length*Number($("progress").value)/100));
  let previous=null,last=null;
  for(const move of activePlan.moves.slice(0,limit)){
   if(previous){
    const [a,b]=xy(previous.x,previous.y),[c,e]=xy(move.x,move.y);
    ctx.strokeStyle=move.mode==="feed"&&Math.abs(previous.z-move.z)<1e-8?"#a6ca8d":"#c3a17f";
    ctx.lineWidth=move.mode==="feed"?2:1;
    ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,e);ctx.stroke();
   }previous=move;last=move;
  }
  if(last){
   const [a,b]=xy(last.x,last.y),r=d*scale/2;
   ctx.beginPath();ctx.arc(a,b,Math.max(2,r),0,2*Math.PI);
   ctx.strokeStyle="#eee1b3";ctx.lineWidth=3;ctx.stroke();
   ctx.textAlign="right";ctx.fillStyle="#dedede";ctx.fillText("TOOL Z "+shown(last.z)+" "+suffix(),w-22,h-20);
   ctx.textAlign="left";
  }
 }
 ctx.fillStyle="#c7c7c7";ctx.font="14px Segoe UI,Arial";
 ctx.fillText("SYNTHETIC STOCK · "+shown(sw,3)+" × "+shown(sh,3)+" "+suffix(),20,29);
 ctx.fillText("Top view; NOT swept-stock removal or collision simulation",20,h-20);
}
$("machine").addEventListener("change",familyChange);
$("units").addEventListener("change",()=>chooseUnits($("units").value));
$("infer").addEventListener("click",infer);
$("calculate").addEventListener("click",()=>{activeBrakeOptimization=false;build();});
$("brake-optimize").addEventListener("click",()=>{activeBrakeOptimization=true;build();});
$("brake-reset").addEventListener("click",()=>{
 $("brake-geometry").value=JSON.stringify(DEFAULT_BRAKE_SECTION,null,2);
 $("bends").value=String(DEFAULT_BRAKE_SECTION.bends.length);
 clearResults();explain("Synthetic brake section restored. Re-run simulation.");
});
$("export").addEventListener("click",exportEstimate);
$("listing").addEventListener("click",exportListing);
$("progress").addEventListener("input",()=>{if(anim!==null){cancelAnimationFrame(anim);anim=null;}draw();});
$("replay").addEventListener("click",replay);
document.querySelectorAll(".sidebar input,.sidebar select,.sidebar textarea").forEach(el=>{
 if(el.id==="machine"||el.id==="units")return;
 el.addEventListener("change",()=>{
   if(!["infer","calculate"].includes(el.id)){
     const was=Boolean(activeEstimate);
     clearResults();
     if(was)explain("Inputs changed. Rebuild estimate to refresh results.");
   }
 });
});
$("brake-geometry").value=JSON.stringify(DEFAULT_BRAKE_SECTION,null,2);
let initialUnits="in";
try{if(localStorage.getItem("ezcam.display_units.v1")==="mm")initialUnits="mm";}catch{}
chooseUnits(initialUnits);
familyChange();
