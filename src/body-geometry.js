import {FACES,moveRange} from './puzzle.js';

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const epsilon=1e-9;
function octahedron(radius){
 return FACES.map(({normal})=>{
  const points=normal.map((sign,axis)=>[0,1,2].map(i=>i===axis?sign*radius:0));
  if(dot(cross(subtract(points[1],points[0]),subtract(points[2],points[0])),normal)<0)points.reverse();
  return points;
 });
}

// Clip a convex solid and close the exposed cut with an outward-facing cap.
function clip(faces,normal,offset,above){
 const result=[],rim=[];
 const distance=p=>(dot(p,normal)-offset)*(above?1:-1);
 for(const face of faces){
  const polygon=[];
  for(let i=0;i<face.length;i++){
   const a=face[i],b=face[(i+1)%face.length],da=distance(a),db=distance(b);
   if(da>=-epsilon)polygon.push(a);
   if((da>epsilon&&db< -epsilon)||(da< -epsilon&&db>epsilon)){
    const point=a.map((v,k)=>v+(b[k]-v)*da/(da-db));polygon.push(point);rim.push(point);
   }
   if(Math.abs(da)<=epsilon)rim.push(a);
  }
  if(polygon.length>=3)result.push(polygon);
 }
 const unique=rim.filter((p,i)=>rim.findIndex(q=>p.every((v,k)=>Math.abs(v-q[k])<epsilon))===i);
 if(unique.length>=3){
  const center=[0,1,2].map(i=>unique.reduce((sum,p)=>sum+p[i],0)/unique.length);
  const outward=normal.map(v=>v*(above?-1:1));
  const u=subtract(unique[0],center),v=cross(outward,u);
  unique.sort((a,b)=>Math.atan2(dot(subtract(a,center),v),dot(subtract(a,center),u))-Math.atan2(dot(subtract(b,center),v),dot(subtract(b,center),u)));
  result.push(unique);
 }
 return result;
}
function triangles(faces){
 return faces.flatMap(face=>Array.from({length:face.length-2},(_,i)=>[...face[0],...face[i+1],...face[i+2]]).flat());
}

export function bodyGeometry(size,move=null){
 // Slightly inset the solid backing to keep sticker surfaces free of z-fighting.
 const inset=.998,faces=octahedron(2*inset);
 if(!move)return {stationary:triangles(faces),turning:[]};
 const {depth,count}=moveRange(move,size),normal=move.normal;
 const upper=(2-4*(depth-1)/size)*inset,lower=(2-4*(depth+count-1)/size)*inset;
 let band=faces;const fixed=[];
 if(depth>1){fixed.push(...clip(faces,normal,upper,true));band=clip(band,normal,upper,false);}
 if(depth+count-1<size){fixed.push(...clip(faces,normal,lower,false));band=clip(band,normal,lower,true);}
 return {stationary:triangles(fixed),turning:triangles(band)};
}
