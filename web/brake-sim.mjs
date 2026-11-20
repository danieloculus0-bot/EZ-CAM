/* EZ-CAM brake section geometry. Synthetic, two-dimensional, parallel bend axes.
 * Kinematic flat-strip hinges only. Not bend allowances, 3D CAD, full tooling,
 * backgauge, force, controller, Bystronic/Accurpress machine configuration,
 * real machine clearance, or a production program.
 */
const EPS=1e-8;
const finite=(v,name,min,max)=>{
 if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max)
  throw Error(name+" must be a finite number from "+min+" to "+max);
 return v;
};
const point=(x,y)=>({x,y});
const rotate=(p,origin,rad)=>{
 const dx=p.x-origin.x,dy=p.y-origin.y,c=Math.cos(rad),s=Math.sin(rad);
 return point(origin.x+dx*c-dy*s,origin.y+dx*s+dy*c);
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const between=(a,b,c)=>c>=Math.min(a,b)-EPS&&c<=Math.max(a,b)+EPS;
function intersects(a,b,c,d){
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 if(((abC>EPS&&abD<-EPS)||(abC<-EPS&&abD>EPS))&&
    ((cdA>EPS&&cdB<-EPS)||(cdA<-EPS&&cdB>EPS)))return true;
 for(const [v,o,p,q] of [[abC,c,a,b],[abD,d,a,b],[cdA,a,c,d],[cdB,b,c,d]])
  if(Math.abs(v)<=EPS&&between(p.x,q.x,o.x)&&between(p.y,q.y,o.y))return true;
 return false;
}
function pointSegmentDistance(p,a,b){
 const vx=b.x-a.x,vy=b.y-a.y,l=vx*vx+vy*vy;
 const t=l<=EPS?0:Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/l));
 return distance(p,point(a.x+t*vx,a.y+t*vy));
}
function segmentDistance(a,b,c,d){
 if(intersects(a,b,c,d))return 0;
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),
  pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function segmentHitsRectangle(a,b,r,halfThickness){
 const x0=r.x_min_mm-halfThickness,x1=r.x_max_mm+halfThickness;
 const y0=r.y_min_mm-halfThickness,y1=r.y_max_mm+halfThickness;
 let low=0,high=1;
 const dx=b.x-a.x,dy=b.y-a.y;
 for(const [p,q] of [[-dx,a.x-x0],[dx,x1-a.x],[-dy,a.y-y0],[dy,y1-a.y]]){
  if(Math.abs(p)<EPS){if(q<0)return false;}
  else{
   const t=q/p;
   if(p<0)low=Math.max(low,t);else high=Math.min(high,t);
   if(low>high+EPS)return false;
  }
 }
 return true;
}
function normalized(input){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("A brake section object is required");
 const length=finite(input.length_mm,"Flat length mm",1,100000);
 const thickness=finite(input.thickness_mm,"Thickness mm",0.05,100);
 if(!Array.isArray(input.bends)||input.bends.length<1||input.bends.length>12)
  throw Error("Provide one to twelve parallel-axis bends");
 const ids=new Set();
 const bends=input.bends.map((b,i)=>{
  if(!b||typeof b!=="object")throw Error("Bend "+(i+1)+" is invalid");
  const id=b.id===undefined?"B"+(i+1):b.id;
  if(typeof id!=="string"||! /^[A-Za-z0-9_-]{1,40}$/.test(id)||ids.has(id))
   throw Error("Bend IDs must be unique letters/numbers");
  ids.add(id);
  return {id,position_mm:finite(b.position_mm,"Bend position",0,length),
   angle_deg:finite(b.angle_deg,"Bend angle degrees",-179,179)};
 });
 bends.sort((a,b)=>a.position_mm-b.position_mm);
 for(let i=0;i<bends.length;i++){
  if(Math.abs(bends[i].angle_deg)<EPS)throw Error("Zero-degree bends are not operations");
  const left=i?bends[i-1].position_mm:0;
  if(bends[i].position_mm-left<=thickness+EPS)throw Error("Panel is shorter than sheet thickness");
 }
 if(length-bends.at(-1).position_mm<=thickness+EPS)throw Error("End flange shorter than sheet thickness");
 const sequence=input.sequence===undefined?bends.map(b=>b.id):input.sequence;
 if(!Array.isArray(sequence)||sequence.length!==bends.length||
    new Set(sequence).size!==bends.length||!sequence.every(id=>ids.has(id)))
  throw Error("Sequence must contain every bend exactly once");
 const obstacles=input.obstacles??[];
 if(!Array.isArray(obstacles)||obstacles.length>12)throw Error("Maximum twelve section obstacles");
 const obstacleIds=new Set();
 const blocks=obstacles.map((o,i)=>{
  if(!o||typeof o!=="object")throw Error("Invalid obstacle");
  const id=o.id??("tool"+(i+1));
  if(typeof id!=="string"||! /^[A-Za-z0-9_-]{1,40}$/.test(id)||obstacleIds.has(id))
   throw Error("Obstacle IDs must be unique");
  obstacleIds.add(id);
  const x_min_mm=finite(o.x_min_mm,"Obstacle x minimum",-100000,100000);
  const x_max_mm=finite(o.x_max_mm,"Obstacle x maximum",-100000,100000);
  const y_min_mm=finite(o.y_min_mm,"Obstacle y minimum",-100000,100000);
  const y_max_mm=finite(o.y_max_mm,"Obstacle y maximum",-100000,100000);
  if(x_min_mm>=x_max_mm||y_min_mm>=y_max_mm)throw Error("Obstacle rectangle is invalid");
  return {id,x_min_mm,x_max_mm,y_min_mm,y_max_mm};
 });
 return {length_mm:length,thickness_mm:thickness,bends,sequence:[...sequence],obstacles:blocks};
}
function hingeView(vertices,hingeIndex){
 if(hingeIndex<1)return vertices.map(p=>({...p}));
 const origin=vertices[hingeIndex],a=vertices[hingeIndex-1];
 const theta=Math.atan2(origin.y-a.y,origin.x-a.x);
 const c=Math.cos(theta),s=Math.sin(theta);
 return vertices.map(p=>{
  const x=p.x-origin.x,y=p.y-origin.y;
  return point(x*c+y*s,-x*s+y*c);
 });
}
function collisionsFor(vertices,hingeIndex,config){
 const found=[],view=hingeView(vertices,hingeIndex),half=config.thickness_mm/2;
 for(let i=0;i<vertices.length-1;i++){
  for(let j=i+2;j<vertices.length-1;j++){
   const d=segmentDistance(vertices[i],vertices[i+1],vertices[j],vertices[j+1]);
   if(d<config.thickness_mm-EPS)
    found.push({kind:"self",segments:[i,j],clearance_mm:d});
  }
  for(const block of config.obstacles){
   if(segmentHitsRectangle(view[i],view[i+1],block,half))
    found.push({kind:"obstacle",obstacle_id:block.id,segment:i});
  }
 }
 return {found,view};
}
export function simulateBrakeSection(input,{increment_deg=10}={}){
 const c=normalized(input),increment=finite(increment_deg,"Angular increment",1,30);
 const vertices=[0,...c.bends.map(b=>b.position_mm),c.length_mm].map(x=>point(x,0));
 const frames=[{step:0,bend_id:null,progress:0,
  vertices:vertices.map(p=>({...p})),view_vertices:vertices.map(p=>({...p})),
  collisions:[]}];
 let collisionFrames=0,collisionEvents=0;
 const trace=[];
 for(let step=0;step<c.sequence.length;step++){
  const id=c.sequence[step],index=c.bends.findIndex(b=>b.id===id),target=c.bends[index].angle_deg;
  const pivotIndex=index+1,passes=Math.ceil(Math.abs(target)/increment);
  const start=vertices.map(p=>({...p}));
  for(let k=1;k<=passes;k++){
   const angle=target*Math.min(1,k/passes)*Math.PI/180;
   const hinge=start[pivotIndex];
   for(let n=pivotIndex+1;n<vertices.length;n++)vertices[n]=rotate(start[n],hinge,angle);
   const checks=collisionsFor(vertices,pivotIndex,c);
   const frame={step:step+1,bend_id:id,progress:k/passes,
    vertices:vertices.map(p=>({...p})),view_vertices:checks.view,
    collisions:checks.found};
   frames.push(frame);
   if(checks.found.length){collisionFrames++;collisionEvents+=checks.found.length;}
  }
  trace.push({step:step+1,bend_id:id,angle_deg:target,frames:passes,
   collisions:frames.slice(-passes).filter(f=>f.collisions.length).length});
 }
 return {schema:"ezcam.brake_section_sim.v1",status:"SECTION_GEOMETRY_ONLY",
  machine_verified:false,production_approved:false,controller_output:false,
  source:"manual_flat_section",configured_obstacle_envelopes:c.obstacles.length,
  collision_scope:c.obstacles.length?"SELF_AND_SUPPLIED_2D_OBSTACLES":"SELF_ONLY",
  config:c,frames,trace,final_vertices:frames.at(-1).vertices,
  metrics:{frames:frames.length,collision_frames:collisionFrames,collision_events:collisionEvents},
  limitations:["Only parallel bend axes and an idealized flat strip with sharp hinges.",
   "No radius, bend deduction, K-factor, springback, force, tooling or backgauge calculation.",
   "Obstacles are user-defined 2D rectangles, not validated punches/dies/machine solids.",
   "Only sampled section collisions are checked, not actual swept 3D volumes.",
   "Sequence is a review proposal and does not create a controller program."]};
}
export function rankBendSequences(input,{candidate_limit=48}={}){
 const c=normalized(input);
 if(!Number.isInteger(candidate_limit)||candidate_limit<1||candidate_limit>256)
  throw Error("Candidate limit must be 1 to 256");
 const ids=c.bends.map(b=>b.id),results=[],seen=new Set();
 const evaluate=order=>{
  const key=order.join("|");
  if(seen.has(key)||results.length>=candidate_limit)return;
  seen.add(key);
  const run=simulateBrakeSection({...c,sequence:order});
  results.push({sequence:[...order],collision_frames:run.metrics.collision_frames,
    collision_events:run.metrics.collision_events,simulation:run});
 };
 if(ids.length<=6){
  function walk(prefix,remaining){
   if(results.length>=candidate_limit)return;
   if(!remaining.length){evaluate(prefix);return;}
   for(let i=0;i<remaining.length;i++)walk([...prefix,remaining[i]],remaining.filter((_,j)=>j!==i));
  }
  walk([],ids);
 }else{
  evaluate(c.sequence);evaluate([...ids].reverse());evaluate(ids);
  const flanges=c.bends.map((b,i)=>({
   id:b.id,size:Math.min(b.position_mm-(i?c.bends[i-1].position_mm:0),
    (i+1<c.bends.length?c.bends[i+1].position_mm:c.length_mm)-b.position_mm)
  }));
  evaluate(flanges.toSorted((a,b)=>a.size-b.size).map(x=>x.id));
  evaluate(flanges.toSorted((a,b)=>b.size-a.size).map(x=>x.id));
  let seed=0x7c0f2d1;
  while(results.length<candidate_limit){
   const order=[...ids];
   for(let i=order.length-1;i>0;i--){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const j=seed%(i+1);[order[i],order[j]]=[order[j],order[i]];
   }
   const before=results.length;
   evaluate(order);
   if(seen.size>1000||seen.size===before&&results.length>=candidate_limit)break;
  }
 }
 results.sort((a,b)=>a.collision_frames-b.collision_frames||
  a.collision_events-b.collision_events||
  a.sequence.join("|").localeCompare(b.sequence.join("|")));
 const best=results[0];
 return {schema:"ezcam.brake_sequence_review.v1",status:"GEOMETRIC_REVIEW",
  machine_verified:false,bean_connected:false,candidates_tested:results.length,
  candidate_limit,selection_basis:"Fewest sampled 2D collision frames, then events; no machine feasibility inference",
  best:{sequence:best.sequence,collision_frames:best.collision_frames,
    collision_events:best.collision_events},simulation:best.simulation,
  top_candidates:results.slice(0,6).map(({simulation,...rest})=>rest)};
}
