import {formatTime} from './solve-timer.js';
export function mountSubmissionNotifications({rpc,getProfile}){
 const section=document.getElementById('submission-notifications'),list=document.getElementById('submission-notifications-list'),message=document.getElementById('submission-notifications-message'),count=document.getElementById('submission-notifications-count'),mark=document.getElementById('submission-notifications-read'),refreshButton=document.getElementById('submission-notifications-refresh'),board=document.getElementById('leaderboard');
 if(!section)return {refresh:async()=>{}};let revision=0,owner=null,rows=[],busy=false;
 const baseLabel=board?.getAttribute('aria-label')??'Leaderboard';
 function render(){
  const unread=rows.filter(row=>!row.read_at).length;count.textContent=unread?`(${unread} unread)`:'';mark.disabled=!unread||busy;refreshButton.disabled=busy||!getProfile();list.replaceChildren();
  if(board){if(unread)board.dataset.unread=String(unread);else delete board.dataset.unread;board.setAttribute('aria-label',unread?`${baseLabel}, ${unread} unread notifications`:baseLabel);}
  for(const row of rows){const item=document.createElement('li'),heading=document.createElement('strong'),date=document.createElement('time');item.dataset.unread=String(!row.read_at);heading.textContent=`${row.decision==='approved'?'Verified':'Rejected'} · ${row.metric==='single'?'Single':row.metric} · ${formatTime(row.ms)}`;date.dateTime=row.created_at;date.textContent=new Date(row.created_at).toLocaleString();item.append(heading,date);if(row.note){const note=document.createElement('p');note.textContent=row.note;item.append(note);}list.append(item);}
 }
 async function refresh(){
  const profile=getProfile(),version=++revision;if(profile?.id!==owner){owner=profile?.id;rows=[];render();}
  if(!profile){message.textContent='Sign in to see submission decisions.';return;}
  if(busy)return;
  if(!navigator.onLine){message.textContent='Connect to refresh notifications.';return;}
  try{const data=await rpc('my_submission_notifications');if(version!==revision||profile.id!==getProfile()?.id)return;rows=Array.isArray(data)?data:[];message.textContent=rows.length?'':'No submission decisions yet.';render();}
  catch(error){if(version===revision){message.textContent=String(error.message).includes('my_submission_notifications')?'Notifications will be available after the backend update.':'Could not refresh notifications. Try again.';}}
 }
 refreshButton.onclick=refresh;
 mark.onclick=async()=>{const profile=getProfile(),ids=rows.filter(row=>!row.read_at).map(row=>row.id);if(!profile||!ids.length||busy)return;revision++;busy=true;render();try{await rpc('mark_submission_notifications_read',{ids});if(profile.id!==getProfile()?.id)return;const now=new Date().toISOString();rows=rows.map(row=>ids.includes(row.id)?{...row,read_at:now}:row);message.textContent='Notifications marked as read.';}catch{message.textContent='Could not mark notifications as read. Try again.';}finally{busy=false;render();if(profile.id!==getProfile()?.id)refresh();}};
 const dialog=document.getElementById('leaderboard-dialog');if(dialog)new MutationObserver(()=>{if(dialog.open)refresh();}).observe(dialog,{attributes:true,attributeFilter:['open']});document.addEventListener('ftoers-submission-reviewed',refresh);
 section.addEventListener('toggle',()=>{if(section.open)refresh();});window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
 const timer=setInterval(()=>{if(!document.hidden&&getProfile()&&navigator.onLine)refresh();},60000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 render();return {refresh};
}
