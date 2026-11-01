// Integer lattice geometry: all turns are exact signed coordinate permutations.
export const N = 4;
// DaYan factory arrangement: red -> blue -> purple counterclockwise around
// white. Opposites: white/yellow, red/orange, blue/green, purple/gray.
// Photo reference: https://speedcubeshop.com/products/dayan-fto-magnetic-ball-core
// Adjacency reference: https://note.com/wajimaji/n/nc06ea912d878
// Display shades approximate the stickerless plastic; IDs/normals stay stable
// so existing saved move histories replay without any migration.
export const COLORS=Object.freeze({
 white:'#fafafa',red:'#ff4040',blue:'#009ae6',purple:'#9b36cc',
 green:'#00c853',orange:'#ff8c00',gray:'#808080',yellow:'#ffdf00',
});
export const FACES = [
  {name:'U',normal:[1,1,1],color:COLORS.white},
  {name:'R',normal:[1,1,-1],color:COLORS.red},
  {name:'F',normal:[1,-1,1],color:COLORS.purple},
  {name:'BR',normal:[1,-1,-1],color:COLORS.green},
  {name:'L',normal:[-1,1,1],color:COLORS.blue},
  {name:'B',normal:[-1,1,-1],color:COLORS.gray},
  {name:'BL',normal:[-1,-1,1],color:COLORS.orange},
  {name:'D',normal:[-1,-1,-1],color:COLORS.yellow},
];
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
export const centroid = vertices => [0,1,2].map(i=>vertices.reduce((s,v)=>s+v[i],0)/3);
export const normalOf = sticker => centroid(sticker.vertices).map(Math.sign);
export function solvedState(size=N) {
  if(!Number.isInteger(size)||size<2||size>20)throw new RangeError("FTO size must be 2–20");
  const N=size;
  const stickers=[];
  for (const [face,f] of FACES.entries()) {
    const point=(i,j)=>[i,j,N-i-j].map((v,k)=>v*f.normal[k]);
    for(let i=0;i<N;i++) for(let j=0;j<N-i;j++) {
      stickers.push({id:stickers.length,color:face,vertices:[point(i,j),point(i+1,j),point(i,j+1)]});
      if(i+j<N-1) stickers.push({id:stickers.length,color:face,vertices:[point(i+1,j),point(i+1,j+1),point(i,j+1)]});
    }
  }
  return stickers;
}
export function selected(sticker,move) {
  const size=sticker.vertices[0].reduce((sum,v)=>sum+Math.abs(v),0);
  const level=sticker.vertices.reduce((sum,v)=>sum+dot(v,move.normal),0);
  const {depth,count}=moveRange(move,size);
  // The two end slices include the parallel face itself, not only its rim.
  return (depth+count-1===size || level>3*size-6*(depth+count-1)) && (depth===1 || level<3*size-6*(depth-1));
}
export function moveRange(move,size=N){
  const depth=move.layer==='slice'?move.depth:move.layer==='inner'?2:1;
  const count=move.layer==='slice'?(move.count??1):move.layer==='wide'?2:move.layer==='ultra'?3:1;
  return {depth:Math.min(size,Math.max(1,depth)),count:Math.min(count,size-Math.min(size,Math.max(1,depth))+1)};
}
export function rotatePoint(point,normal,dir=1) {
  const p=point.map((v,i)=>v*normal[i]);
  const clockwise=dir*normal[0]*normal[1]*normal[2]>0;
  const rotated=clockwise?[p[1],p[2],p[0]]:[p[2],p[0],p[1]];
  return rotated.map((v,i)=>v*normal[i]);
}
export function applyMove(state,move) {
  return state.map(s=>selected(s,move)?{...s,vertices:s.vertices.map(p=>rotatePoint(p,move.normal,move.dir))}:s);
}
export const inverse = move => ({...move,dir:-move.dir});
export function isSolved(state) {
  const colors=new Map();
  return state.every(s=>{const k=normalOf(s).join(',');if(!colors.has(k))colors.set(k,s.color);return colors.get(k)===s.color;});
}
export function signature(state) {
  return state.map(s=>`${s.color}:${s.vertices.map(v=>v.join(',')).sort().join(';')}`).sort().join('|');
}
export function scrambleMoves(length=50,random=Math.random,size=N) {
  const moves=[];let last=-1;
  for(let i=0;i<length;i++) {let face;do{face=Math.floor(random()*8);}while(face===last);last=face;
    moves.push({normal:[...FACES[face].normal],layer:'slice',depth:1+Math.floor(random()*(size-1)),count:1,dir:random()<.5?1:-1,name:FACES[face].name});}
  return moves;
}
