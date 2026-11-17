import {test,expect} from '@playwright/test';
import {SolveRecorder} from '../../src/solve-recording.js';
import {defaultConfig} from '../../src/keyboard-engine.js';
test('replay flashes move notation above the keyboard and uses compact icon controls',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:900});
 let now=0;const recorder=new SolveRecorder({},()=>now),move={normal:[1,1,1],layer:'outer',dir:1,name:'U'};recorder.arm({size:3,scramble:[move],view:{rotation:[0,0,0,1],radius:10},keyboard:defaultConfig(3),colors:{}});recorder.event('start');now=100;recorder.event('key',{edge:'down',code:'KeyF'});recorder.event('accept',{id:1,action:'move'});now=120;recorder.event('key',{edge:'down',code:'ShiftLeft'});now=260;recorder.event('key',{edge:'up',code:'ShiftLeft'});now=300;recorder.event('key',{edge:'up',code:'KeyF'});now=1000;recorder.event('turn',{id:1,move:{...move,dir:-1}});const data=recorder.finish(1000,true);
 await page.addInitScript(()=>{localStorage.setItem('master-fto-settings-v1',JSON.stringify({showStatistics:true}));localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[],redo:[],timer:{status:'idle',times:[{ms:12340}],completed:1}}}}));});
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.locator('#album').click();await page.locator('#album-import-recording').click();await page.locator('#recording-paste').fill(JSON.stringify(data));await page.locator('#recording-paste-load').click();
 await expect(page.locator('#replay-input-panel')).toBeVisible();await expect(page.locator('#solve-summary .time-columns')).toBeHidden();await expect(page.locator('#solve-summary .timer-panel')).toBeHidden();await expect(page.locator('#replay-keyboard')).toBeVisible();
 await page.locator('#home-replay-start-marker').click();const intro=Number(await page.locator('#home-replay-progress').inputValue());
 const seek=at=>page.locator('#home-replay-progress').evaluate((el,at)=>{el.value=String(at);el.dispatchEvent(new Event('input',{bubbles:true}));},intro+at);
 await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));await seek(125);await expect(page.locator('#replay-move-flash')).toHaveText('U′');await expect(page.locator('#replay-move-flash')).toHaveAttribute('data-active','true');await expect(page.locator('#home-replay-splits')).toHaveCount(0);await expect(page.locator('#home-replay-play svg')).toHaveCount(1);await expect(page.locator('#home-replay-play')).toHaveAttribute('aria-label','Play recording');await expect(page.locator('#replay-display-time')).toHaveText('0.12');
 const colors=await page.evaluate(()=>({flash:getComputedStyle(document.getElementById('replay-move-flash')).color,background:getComputedStyle(document.getElementById('replay-move-flash')).backgroundColor,key:getComputedStyle(document.querySelector('#replay-keyboard [data-code="KeyF"] rect')).fill}));expect(colors.flash).toBe(colors.key);expect(colors.flash).not.toBe('rgba(0, 0, 0, 0)');expect(colors.background).toBe('rgba(0, 0, 0, 0)');
 await page.clock.runFor(300);await expect(page.locator('#replay-move-flash')).toHaveAttribute('data-active','false');await expect(page.locator('#replay-keyboard [data-code="KeyF"]')).not.toHaveClass(/replay-move-highlight/);
 await seek(125);
 const boardBox=await page.locator('#replay-keyboard').boundingBox(),flashBox=await page.locator('#replay-move-flash').boundingBox();expect(boardBox.y).toBeGreaterThan(180);expect(boardBox.y).toBeLessThan(400);expect(flashBox.x-boardBox.x).toBeLessThan(14);expect(flashBox.y+flashBox.height).toBeLessThan(boardBox.y);await page.addStyleTag({content:'canvas{visibility:hidden!important}'});await page.locator('#solve-panel').screenshot({path:'test-results/replay-input-panel.png',timeout:15000});
 await page.locator('#home-replay-dock').screenshot({path:'test-results/replay-toolbar.png',timeout:15000});await seek(350);await expect(page.locator('#replay-move-flash')).toHaveAttribute('data-active','false');await expect(page.locator('#replay-move-flash')).toHaveText('');await seek(110);await expect(page.locator('#replay-move-flash')).toHaveText('U′');
 await page.setViewportSize({width:320,height:844});await expect(page.locator('#replay-input-panel')).toBeHidden();await expect(page.locator('#home-replay-keys')).toBeVisible();await expect(page.locator('#home-replay-keys')).toHaveText('U′');await expect(page.locator('#home-replay-time')).toBeVisible();
 await page.locator('#home-replay-play').click();await expect(page.locator('#home-replay-play')).toHaveAttribute('aria-label','Pause recording');await page.locator('#home-replay-play').click();await expect(page.locator('#home-replay-play')).toHaveAttribute('aria-label','Play recording');await page.setViewportSize({width:1440,height:900});await page.locator('#home-replay-exit').click();await expect(page.locator('#replay-input-panel')).toBeHidden();await expect(page.locator('#solve-summary .time-columns')).toBeVisible();await expect(page.locator('#solve-times li')).toHaveCount(1);
});

test('undo plays a quieter, muffled typewriter keypress, and undo remains functional',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false}));localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[{normal:[1,1,1],layer:'outer',dir:1,name:'U'}],redo:[],undoFloor:1,timer:{status:'ready'}}}}));});
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);
 const recording=await page.evaluate(async()=>{
  const {PuzzleSounds}=await import('/src/sounds.js');const sound=new PuzzleSounds();await sound.ready;
  if(!sound.undoSample)throw Error('Typewriter recording did not load');
  const buffer=sound.undoSample,context=new OfflineAudioContext(buffer.numberOfChannels,buffer.length+4410,buffer.sampleRate);
  sound.playUndo(context);const played=await context.startRendering();let energy=0,originalEnergy=0,roughness=0,unfilteredRoughness=0,tail=0;
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
   const source=buffer.getChannelData(channel),actual=played.getChannelData(channel);
   for(let i=0;i<source.length;i++){
    energy+=actual[i]*actual[i];originalEnergy+=(source[i]*.65)**2;
    if(i){roughness+=(actual[i]-actual[i-1])**2;unfilteredRoughness+=((source[i]-source[i-1])*.32)**2;}
   }
   for(let i=actual.length-882;i<actual.length;i++)tail=Math.max(tail,Math.abs(actual[i]));
  }
  return {duration:buffer.duration,energy,energyRatio:energy/originalEnergy,roughnessRatio:roughness/unfilteredRoughness,tail};
 });
 expect(recording.duration).toBeGreaterThan(.1);expect(recording.duration).toBeLessThan(.6);expect(recording.energy).toBeGreaterThan(.01);expect(recording.energyRatio).toBeLessThan(.25);expect(recording.roughnessRatio).toBeLessThan(.4);expect(recording.tail).toBeLessThan(.000001);
 await page.keyboard.press('KeyJ');await page.keyboard.press('Backspace');await expect.poll(async()=>(await page.evaluate(()=>window.fto.snapshot())).redo.length).toBe(1);
});
