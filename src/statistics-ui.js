import {statistics,statisticsReport,statisticsCSV,resultText} from './solve-statistics.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
export class StatisticsUI{
 constructor({getSession,save,settings,pause}){
  Object.assign(this,{getSession,save,settings,pause});this.key='';
  $('close-statistics').onclick=()=>$('statistics-dialog').close();
  $('statistics-scrambles').onchange=()=>{$('print-stat-scrambles').checked=$('statistics-scrambles').checked;settings();this.report();};
  $('statistics-comment-save').onclick=()=>{const entry=this.getSession().times[this.window.start];if(!entry)return;entry.comment=$('statistics-comment').value.slice(0,2000);save();this.report();$('statistics-message').textContent='Comment saved';};
  $('statistics-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('statistics-report').textContent);$('statistics-message').textContent='Copied';}catch{const report=$('statistics-report');report.hidden=false;report.focus();const range=document.createRange();range.selectNodeContents(report);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('statistics-message').textContent='Select and copy the report above.';}};
  $('statistics-csv').onclick=()=>{const csv=statisticsCSV(this.getSession().times,this.window,{scrambles:$('statistics-scrambles').checked}),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='fto-statistics.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('timer-ao5').onclick=()=>this.openAverage(5);
  $('timer-pb').onclick=()=>this.openBest();
 }
 render(key){
  const enabled=$('show-statistics').checked;
  $('statistics-panel').hidden=!enabled;
  if(enabled){document.querySelector('.splits-panel').hidden=true;document.querySelector('.time-columns').classList.remove('without-splits');$('solve-summary').setAttribute('aria-label','Timer, statistics and past times');}
  if(this.key===key)return;this.key=key;const times=this.getSession().times;this.rows=statistics(times);
  $('statistics-count').textContent=`${times.filter(t=>!t.dnf).length} / ${times.length} solved`;
  $('statistics-rows').replaceChildren();
  for(const row of this.rows){const tr=document.createElement('tr'),name=document.createElement('th');name.scope='row';name.textContent=row.label;tr.append(name);
   for(const kind of ['current','best']){const cell=document.createElement('td'),button=document.createElement('button'),window=row[kind];button.className='stat-link';button.textContent=formatTime(window?.value??null);button.disabled=!window;button.setAttribute('aria-label',`${kind==='best'?'PB':'Current'} ${row.label}`);button.onclick=()=>this.open(window,`${kind==='best'?'PB':'Current'} ${row.label}`);cell.append(button);tr.append(cell);}
   $('statistics-rows').append(tr);
  }
 }
 openSingle(index){const entry=this.getSession().times[index];if(entry)this.open({start:index,end:index+1,value:entry.dnf?Infinity:entry.ms},`Solve ${index+1}`);}
 openAverage(count){const row=this.rows?.find(row=>row.count===count);if(row?.current)this.open(row.current,`Current ao${count}`);}
 openBest(){if(this.rows?.[0].best)this.open(this.rows[0].best,'PB single');}
 open(window,title){if(!window)return;this.pause();this.window=window;$('statistics-title').textContent=title;$('statistics-message').textContent='';$('statistics-scrambles').checked=$('print-stat-scrambles').checked;const single=window.end-window.start===1;const entry=this.getSession().times[window.start];$('statistics-dialog').dataset.kind=single?'single':'average';$('statistics-single').hidden=!single;$('statistics-report').hidden=single;if(single){$('statistics-single-time').textContent=resultText(entry);$('statistics-single-date').textContent=entry.at?new Date(entry.at).toLocaleString():'';$('statistics-single-scramble').textContent=entry.scramble||'Scramble not recorded';}$('statistics-comment-label').hidden=!single;$('statistics-comment-save').hidden=!single;$('statistics-comment').value=single?this.getSession().times[window.start]?.comment??'':'';this.report();$('statistics-dialog').showModal();}
 report(){if(!this.window)return;const report=$('statistics-report');report.textContent=statisticsReport(this.getSession().times,this.window,{scrambles:$('statistics-scrambles').checked});report.dataset.scrambles=String($('statistics-scrambles').checked);}
}
