import {defaultConfig,FACE_NAMES} from '../../src/keyboard-engine.js';
// Regression scenarios use an explicit editable map, independent of shipped defaults.
export function regressionKeyboard(){
 const config=defaultConfig(4),bindings=[];let id=0;const add=(trigger,action)=>bindings.push({id:`regression-${++id}`,trigger,action});
 ['U','R','F','J','L','B','K','D'].forEach((key,i)=>add(key,{type:'move',face:FACE_NAMES[i],dir:1,kind:'default',depth:1}));
 for(let n=0;n<=9;n++){add(String(n),{type:'depth',depth:n||10});add(`Shift+${n}`,{type:'depth',depth:n?n+10:20});}
 add('NumpadMultiply',{type:'depth',depth:18});add('Shift',{type:'hold-slice'});add('Ctrl',{type:'hold-wide'});add('Alt',{type:'hold-reverse'});add('M',{type:'next-mode'});
 for(const [trigger,command] of [['Ctrl+Z','undo'],['Meta+Z','undo'],['Backspace','undo'],['Ctrl+Shift+Z','redo'],['Meta+Shift+Z','redo'],['Ctrl+Y','redo'],['Home','home'],['Escape','cancel']])add(trigger,{type:'command',command});
 config.modes=[{id:'default',name:'Reg Keys',bindings}];config.activeMode='default';return config;
}
export async function installKeyboard(page,config=regressionKeyboard()){
 await page.addInitScript(config=>{
  if(sessionStorage.getItem('regression-keyboard-seeded'))return;
  if(!localStorage.getItem('master-fto-keyboard-v2'))localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:Object.fromEntries(Array.from({length:19},(_,i)=>[i+2,config])),display:config.display}));
  sessionStorage.setItem('regression-keyboard-seeded','yes');
 },config);
}
