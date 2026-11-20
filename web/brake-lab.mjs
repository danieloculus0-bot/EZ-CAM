import {simulateBrakeSection,rankBendSequences} from "./brake-sim.mjs";
const $=id=>document.getElementById(id);
const NS="http://www.w3.org/2000/svg";
const sample={
 length_mm:180,thickness_mm:2,
 bends:[{id:"B1",position_mm:40,angle_deg:90},
        {id:"B2",position_mm:110,angle_deg:-90}],
 obstacles:[{id:"synthetic-clearance-block",x_min_mm:-8,x_max_mm:8,
  y_min_mm:48,y_max_mm:90}]
};
let simulation=null,ranking=null;
function el(tag,attributes={},value){
 const n=document.createElementNS(NS,tag);
 for(const [key,val] of Object.entries(attributes))n.setAttribute(key,String(val));
 if(value!==undefined)n.textContent=value;
 return n;
}
function draw(){
 const svg=$("section-preview");
 svg.replaceChildren();
 if(!simulation){
  svg.append(el("text",{x:30,y:45,fill:"#bcbcbc"},"No simulated geometry"));
  return;
 }
 const index=Number($("brake-frame").value),frame=simulation.frames[index];
 const points=frame.view_vertices.map(p=>({x:p.x,y:-p.y}));
 const obstacles=index?simulation.config.obstacles:[];
 const coordinates=[...points];
 for(const b of obstacles){
  coordinates.push({x:b.x_min_mm,y:-b.y_min_mm},{x:b.x_max_mm,y:-b.y_max_mm});
 }
 const xs=coordinates.map(p=>p.x),ys=coordinates.map(p=>p.y);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const sizeX=Math.max(10,maxX-minX),sizeY=Math.max(10,maxY-minY);
 const pad=Math.max(8,Math.max(sizeX,sizeY)*.12);
 const x0=minX-pad,y0=minY-pad,wd=sizeX+2*pad,ht=sizeY+2*pad;
 svg.setAttribute("viewBox",[x0,y0,wd,ht].join(" "));
 svg.append(el("rect",{x:x0,y:y0,width:wd,height:ht,fill:"#050505"}));
 const sw=Math.max(.4,Math.min(wd,ht)*.005);
 for(const b of obstacles){
  svg.append(el("rect",{
   x:b.x_min_mm,y:-b.y_max_mm,
   width:b.x_max_mm-b.x_min_mm,height:b.y_max_mm-b.y_min_mm,
   fill:"#b78b2b", "fill-opacity":".2",stroke:"#e8b45c","stroke-width":sw
  }));
 }
 const colliding=new Set(frame.collisions.filter(c=>c.kind==="self")
  .flatMap(c=>c.segments));
 for(const c of frame.collisions.filter(c=>c.kind==="obstacle"))colliding.add(c.segment);
 for(let i=0;i<points.length-1;i++){
  svg.append(el("line",{x1:points[i].x,y1:points[i].y,x2:points[i+1].x,y2:points[i+1].y,
   stroke:colliding.has(i)?"#fb7676":"#a7e58b",
   "stroke-width":Math.max(sw*2,simulation.config.thickness_mm),
   "stroke-linecap":"round"}));
 }
 for(let i=1;i<points.length-1;i++){
  svg.append(el("circle",{cx:points[i].x,cy:points[i].y,r:Math.max(1.5,sw*2),
   fill:"#dde6e1",stroke:"#212121","stroke-width":sw*.5}));
 }
 const active=simulation.config.bends.findIndex(b=>b.id===frame.bend_id)+1;
 if(active>0){
  svg.append(el("circle",{cx:points[active].x,cy:points[active].y,
   r:Math.max(2.2,sw*4),fill:"none",stroke:"#e1c484","stroke-width":sw*1.5}));
 }
 const fontSize=Math.max(3,Math.min(wd,ht)*.032);
 svg.append(el("text",{x:x0+pad*.3,y:y0+pad*.7,fill:"#d4d4d4","font-size":fontSize},
  index===0?"FLAT STOCK":("STEP "+frame.step+" · "+frame.bend_id+
  " · "+Math.round(frame.progress*100)+"%")));
 $("brake-frame-label").textContent=index===0?"Flat stock":
  "Bend "+frame.step+" / "+frame.bend_id+" / "+Math.round(frame.progress*100)+"%";
 $("brake-frame-index").textContent=index+" / "+(simulation.frames.length-1);
 $("brake-result").textContent=frame.collisions.length
  ?frame.collisions.length+" section collision(s) in this sampled frame. Red segments identify geometric interference."
  :"No sectional interference found in this sampled frame. Full machine clearance remains unknown.";
 $("brake-result").classList.toggle("error",Boolean(frame.collisions.length));
}
function display(){
 const frames=simulation.frames;
 const slider=$("brake-frame");
 slider.disabled=false;slider.min="0";slider.max=String(frames.length-1);
 slider.value=String(frames.length-1);
 const m=simulation.metrics;
 $("brake-stats").replaceChildren();
 for(const [label,value] of [
  ["Bends",simulation.config.bends.length],
  ["Sampled frames",m.frames],
  ["Interference frames",m.collision_frames],
  ["Configured envelopes",simulation.configured_obstacle_envelopes]
 ]){
  const span=document.createElement("span");
  const strong=document.createElement("strong");strong.textContent=String(value);
  span.append(label+": ",strong);
  $("brake-stats").append(span);
 }
 $("brake-evidence").textContent=
  "Sequence: "+simulation.config.sequence.join(" / ")+"\n"+
  (ranking?"Sequence candidates searched: "+ranking.candidates_tested+"\n":"")+
  "Collision scope: "+simulation.collision_scope+"\n"+
  "Status: "+simulation.status+"\n"+
  "Machine verified: NO. BEAN connection: NO.\n"+
  "No actual tooling, gauge, tonnage, 3D machine solids or CNC export.";
 $("brake-export").disabled=false;
 draw();
}
function run(optimize=false){
 try{
  const input=JSON.parse($("brake-input").value);
  if(optimize){
   ranking=rankBendSequences(input,{candidate_limit:48});
   simulation=ranking.simulation;
  }else{
   ranking=null;
   simulation=simulateBrakeSection(input);
  }
  display();
 }catch(error){
  simulation=null;ranking=null;
  $("brake-export").disabled=true;$("brake-frame").disabled=true;
  $("brake-result").textContent="Geometry rejected: "+error.message;
  $("brake-result").classList.add("error");
  $("brake-evidence").textContent="";$("brake-stats").textContent="No valid simulation";
  draw();
 }
}
function reset(){
 $("brake-input").value=JSON.stringify(sample,null,2);
 $("brake-machine").value="bystronic";
 run();
}
$("brake-sim").addEventListener("click",()=>run());
$("brake-opt").addEventListener("click",()=>run(true));
$("brake-reset").addEventListener("click",reset);
$("brake-frame").addEventListener("input",draw);
$("brake-export").addEventListener("click",()=>{
 if(!simulation)return;
 const evidence={schema:"ezcam.brake_review_evidence.v1",status:"GEOMETRY_ONLY",
  machine_brand_reference:$("brake-machine").value,
  machine_model:null,tooling_validated:false,bean_connected:false,
  simulation,sequence_search:ranking?{
   candidates_tested:ranking.candidates_tested,
   selection_basis:ranking.selection_basis,top_candidates:ranking.top_candidates
  }:null};
 const blob=new Blob([JSON.stringify(evidence,null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;
 a.download="ezcam-brake-section-review.json";document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("brake-input").addEventListener("change",()=>{
 $("brake-export").disabled=true;simulation=null;ranking=null;
 $("brake-frame").disabled=true;
 $("brake-result").textContent="Inputs changed. Re-run simulation.";
 $("brake-evidence").textContent="";
 draw();
});
reset();