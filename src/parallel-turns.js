import {moveRange} from './puzzle.js';

export const TURN_ANIMATION_MS=145;
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
export const parallelMoves=(a,b)=>Math.abs(dot(a.normal,b.normal))===3;

// Split only at move boundaries. Opposite faces use the same physical axis,
// but measure depth from the other end of the puzzle.
export function parallelBands(size,moves){
 if(!moves.length)return [];
 const normal=moves[0].normal;
 const ranges=moves.map(move=>{
  if(!parallelMoves(moves[0],move))throw Error('Animated layers must be parallel.');
  const {depth,count}=moveRange(move,size),sign=dot(normal,move.normal)>0?1:-1;
  const start=sign>0?depth:size-depth-count+2;
  return {start,end:start+count,sign};
 });
 const cuts=[...new Set([1,size+1,...ranges.flatMap(range=>[range.start,range.end])])].sort((a,b)=>a-b);
 return cuts.slice(0,-1).map((start,i)=>({
  move:{normal,layer:'slice',depth:start,count:cuts[i+1]-start},
  turns:ranges.flatMap((range,index)=>start>=range.start&&start<range.end?[{index,sign:range.sign}]:[]),
 }));
}

export function bandAngle(band,turns,now){
 return band.turns.reduce((angle,{index,sign})=>{
  const turn=turns[index],progress=Math.min(1,Math.max(0,(now-turn.started)/turn.duration));
  const eased=progress*progress*(3-2*progress);
  return angle-sign*turn.move.dir*2*Math.PI/3*eased;
 },0);
}
