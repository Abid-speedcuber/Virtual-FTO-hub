import {solvedState,FACES} from './puzzle.js';
const paths={video:'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM2 6h20M2 18h20M7 2v4m5-4v4m5-4v4M7 18v4m5-4v4m5-4v4',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',album:'M5 4H3v17h16v-2M7 2h15v15H7zm2 12 4-5 3 3 2-2 3 4M17 5h1',share:'M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',split:'M6 21V3m0 1h12l-3 4 3 4H6',pause:'M8 5v14M16 5v14',resume:'m8 5 11 7-11 7Z',undo:'M9 6 4 11l5 5M4 11h9a7 7 0 0 1 7 7',redo:'m15 6 5 5-5 5m5-5h-9a7 7 0 0 0-7 7',reset:'M4 10a8 8 0 1 1 1 8M4 4v6h6',scramble:'M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 5-5m2-2c2-3 3-5 5-5h3m-4-4 4 4-4 4',history:'M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v6l4 2'};
export const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/>${name==='video'?'<path d="M10 8 16 12 10 16Z" fill="currentColor" stroke="none"/>':''}</svg>`;

// A slightly rotated, triangulated octahedron, with hidden edges omitted.
// This uses the same 2x2 geometry as the puzzle, in a small monochrome SVG.
export function puzzleIcon(){
 const rotate=([x,y,z])=>{
  const a=.28,b=-.35,c=.65;
  const yy=y*Math.cos(a)-z*Math.sin(a),zz=y*Math.sin(a)+z*Math.cos(a);
  const xx=x*Math.cos(b)+zz*Math.sin(b),z2=-x*Math.sin(b)+zz*Math.cos(b);
  return [xx*Math.cos(c)-yy*Math.sin(c),xx*Math.sin(c)+yy*Math.cos(c),z2];
 };
 const edges=new Map();
 for(const sticker of solvedState(2)){
  if(rotate(FACES[sticker.color].normal)[2]<=0)continue;
  const points=sticker.vertices.map(rotate).map(([x,y])=>[16+x*6,16-y*6]);
  for(let i=0;i<3;i++){
   const a=points[i].map(v=>v.toFixed(3)),b=points[(i+1)%3].map(v=>v.toFixed(3));
   edges.set([a.join(','),b.join(',')].sort().join('|'),`M${a.join(' ')}L${b.join(' ')}`);
  }
 }
 return `<svg class="puzzle-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="${[...edges.values()].join('')}"/></svg>`;
}
