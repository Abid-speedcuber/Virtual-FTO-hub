import {formatTime} from './solve-timer.js';
export const AVERAGE_SIZES=[5,12,25,100,300,1000];
export const resultValue=entry=>entry.dnf?Infinity:entry.ms;
export const resultText=entry=>entry.dnf?'DNF':formatTime(entry.ms);
// csTimer's default: trim ceil(5%) from each end; DNFs sort last.
// https://github.com/cs0x7f/cstimer/blob/master/src/js/stats/timestat.js
export function averageWindow(times,count,end=times.length){
 if(end<count||count<3)return null;
 const start=end-count,trim=Math.ceil(count*.05),ranked=times.slice(start,end).map((entry,i)=>({index:start+i,value:resultValue(entry)})).sort((a,b)=>a.value-b.value||a.index-b.index);
 const kept=ranked.slice(trim,count-trim),value=kept.some(t=>!Number.isFinite(t.value))?Infinity:kept.reduce((sum,t)=>sum+t.value,0)/kept.length;
 return {value,start,end,trim,excluded:[...ranked.slice(0,trim),...ranked.slice(count-trim)].map(t=>t.index)};
}
export function statistics(times){
 const rows=[],last=times.length-1;let bestIndex=-1;
 times.forEach((entry,i)=>{if(bestIndex<0||resultValue(entry)<resultValue(times[bestIndex]))bestIndex=i;});
 rows.push({label:'Single',count:1,current:last<0?null:{value:resultValue(times[last]),start:last,end:last+1,excluded:[]},best:bestIndex<0?null:{value:resultValue(times[bestIndex]),start:bestIndex,end:bestIndex+1,excluded:[]}});
 for(const count of AVERAGE_SIZES){
  let best=null,current=null;
  // Keep the window sorted rather than sorting every average from scratch.
  const sorted=[],trim=Math.ceil(count*.05),values=times.map(resultValue);
  const compare=(a,b)=>values[a]-values[b]||a-b;
  for(let i=0;i<times.length;i++){
   if(i>=count)sorted.splice(sorted.indexOf(i-count),1);
   let low=0,high=sorted.length;while(low<high){const mid=(low+high)>>1;if(compare(sorted[mid],i)<0)low=mid+1;else high=mid;}sorted.splice(low,0,i);
   if(i+1<count)continue;
   let total=0;for(let k=trim;k<count-trim;k++)total+=values[sorted[k]];
   const value=total/(count-2*trim);current={value,start:i+1-count,end:i+1};
   if(!best||value<best.value)best=current;
  }
  rows.push({label:`ao${count}`,count,current,best});
 }
 return rows;
}
export function statisticsReport(times,window,{scrambles=true,date=new Date()}={}){
 const {start,end}=window,count=end-start,details=count===1?{...window,excluded:[]}:averageWindow(times,count,end),excluded=new Set(details.excluded);
 const label=count===1?'single':`avg of ${count}`;
 const entries=times.slice(start,end).map((entry,i)=>{
  const time=resultText(entry),value=excluded.has(start+i)?`(${time})`:time;
  return {entry,value,number:i+1};
 });
 const list=scrambles?entries.map(({entry,value,number})=>`${number}. ${value}${entry.comment?`  [${entry.comment}]`:''}   ${entry.scramble||'Scramble not recorded'}`):[entries.map(({entry,value})=>`${value}${entry.comment?` [${entry.comment}]`:''}`).join(', ')];
 return [`FTOers FTO Simulator | ${date.toISOString().slice(0,10)}`,`${label}: ${formatTime(details.value)}`,'','Time List:',...list].join('\n');
}
export function statisticsCSV(times,window,{scrambles=true}={}){
 const quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
 const rows=[['No.','Time','DNF','Date','Comment',...(scrambles?['Scramble']:[])],...times.slice(window.start,window.end).map((entry,i)=>[i+1,resultText(entry),entry.dnf?'true':'false',entry.at??'',entry.comment??'',...(scrambles?[entry.scramble??'']:[])])];
 return rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
export function scrambleText(moves){return moves.map(move=>{
 const depth=move.depth??(move.layer==='inner'?2:1),count=move.count??({wide:2,ultra:3}[move.layer]??1);
 return `${count>1?(count>2?count:''):depth>1?depth:''}${move.name}${count>1?'w':''}${move.dir<0?"'":''}`;
}).join(' ');}
