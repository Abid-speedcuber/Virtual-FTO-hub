import {formatTime} from './solve-timer.js';
export function mountOnlineNotices(network){
 const list=document.getElementById('online-pb-list');if(!list||list.dataset.mounted)return;list.dataset.mounted='true';
 let rows=[],selectedMetric='single',index=0;
 function render(){
  const focused=list.contains(document.activeElement)?document.activeElement.dataset.noticeAction:null;
  list.replaceChildren();
  const history=document.getElementById('mobile-history');if(history){if(rows.length)history.dataset.results=String(rows.length);else delete history.dataset.results;}
  if(!rows.length)return;
  index=Math.max(0,Math.min(index,rows.length-1));const row=rows[index];selectedMetric=row.metric;
  const item=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button'),actions=document.createElement('div');
  const title=document.createElement('strong'),comparison=document.createElement('small');
  title.textContent=`${row.metric==='single'?'Single':row.metric} · ${formatTime(row.ms)}`;
  comparison.textContent=row.leaderboard_ms==null?'No leaderboard result yet':`Faster than your leaderboard result · ${formatTime(row.leaderboard_ms)}`;
  text.append(title,comparison);
  if(row.pending_ms!=null){const pending=document.createElement('small');pending.className='pending-replacement';pending.textContent=`Replaces your pending ${formatTime(row.pending_ms)} submission`;text.append(pending);}
  actions.className='online-result-actions';button.dataset.noticeAction='submit';button.textContent=row.busy?'Submitting…':'Submit to leaderboard';button.disabled=row.busy;button.onclick=()=>network.submit(row.id);actions.append(button);
  if(rows.length>1){
   const pager=document.createElement('nav'),count=document.createElement('span');pager.className='online-result-pager';pager.setAttribute('aria-label','Submission results');
   count.textContent=`${index+1} / ${rows.length}`;count.setAttribute('aria-label',`Result ${index+1} of ${rows.length}`);
   function control(label,step){const b=document.createElement('button');b.type='button';b.dataset.noticeAction=step<0?'previous':'next';b.setAttribute('aria-label',label);b.textContent=step<0?'‹':'›';b.onclick=()=>{index=(index+step+rows.length)%rows.length;render();};return b;}
   pager.append(control('Previous result',-1),count,control('Next result',1));actions.append(pager);
  }
  item.append(text,actions);list.append(item);
  if(focused)list.querySelector(`[data-notice-action="${focused}"]`)?.focus({preventScroll:true});
 }
 document.addEventListener('ftoers-online-pbs',event=>{
  rows=['single','ao5','ao12'].map(metric=>event.detail.find(row=>row.metric===metric)).filter(Boolean);
  const previous=rows.findIndex(row=>row.metric===selectedMetric);if(previous>=0)index=previous;
  render();
 });
}
