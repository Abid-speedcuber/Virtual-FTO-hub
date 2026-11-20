import {formatTime} from './solve-timer.js';
export function mountOnlineNotices(network){
 const list=document.getElementById('online-pb-list');if(!list||list.dataset.mounted)return;list.dataset.mounted='true';
 document.addEventListener('ftoers-online-pbs',event=>{
  list.replaceChildren();for(const metric of ['single','ao5','ao12']){const row=event.detail.find(row=>row.metric===metric);if(!row)continue;const item=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button');const title=document.createElement('strong'),comparison=document.createElement('small');title.textContent=`${row.metric==='single'?'Single':row.metric} · ${formatTime(row.ms)}`;comparison.textContent=row.leaderboard_ms==null?'No leaderboard result yet':`Faster than your leaderboard result · ${formatTime(row.leaderboard_ms)}`;text.append(title,comparison);if(row.pending_ms!=null){const pending=document.createElement('small');pending.className='pending-replacement';pending.textContent=`Replaces your pending ${formatTime(row.pending_ms)} submission`;text.append(pending);}button.textContent=row.busy?'Submitting…':'Submit to leaderboard';button.disabled=row.busy;button.onclick=()=>network.submit(row.id);item.append(text,button);list.append(item);}
 });
}
