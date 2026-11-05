import {test,expect} from '@playwright/test';
import {readFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {SolveRecorder} from '../../src/solve-recording.js';
import {defaultConfig} from '../../src/keyboard-engine.js';
import {encodeRecording} from '../../src/recording-codec.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready),snap=page=>page.evaluate(()=>window.fto.snapshot());
const U={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'},R={normal:[1,1,-1],layer:'slice',depth:1,count:1,dir:1,name:'R'},view={rotation:[0,0,0,1],radius:10};
function recording(ms=800){let now=Date.parse('2026-11-05T12:34:56Z');const recorder=new SolveRecorder({},()=>now);recorder.arm({size:3,scramble:[U],view,keyboard:defaultConfig(3),colors:{U:'#ffffff'}});now+=20000;recorder.event('key',{edge:'down',code:'KeyF'});recorder.event('start');recorder.event('accept',{id:1,action:'move',elapsedMs:0});recorder.event('animate',{id:1,move:{...U,dir:-1},duration:100});recorder.event('sound',{kind:'move'});now+=ms;recorder.event('turn',{id:1,move:{...U,dir:-1}});recorder.finish(ms,true);return recorder.last;}
async function seed(page,data=recording()){
 await page.addInitScript(data=>{if(window.name.startsWith('album-seeded'))return;window.name='album-seeded';localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[],redo:[],undoFloor:0,recordings:{last:data,pbIsLast:true},view:{rotation:[0,0,0,1],radius:10},timer:{status:'finished',elapsedMs:data.solveMs,lastMs:data.solveMs,bestMs:data.solveMs,bestAt:data.completedAt,completed:1,times:[{ms:data.solveMs,at:data.completedAt}]}}}}));localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false}));},data);
}
async function range(page,value){await page.locator('#home-replay-progress').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function playback(page){await page.locator('#settings').click();await page.locator('#open-recordings').click();await page.locator('#watch-recording').click();}

test.beforeEach(async({page})=>{await page.route('**/worker.js*',route=>route.fulfill({contentType:'text/javascript',body:"self.onmessage=()=>self.postMessage({scramble:'U F'});"}));});

test('intro displays the full scramble through the pauses and slow reorientation, then hides it for solving',async({page})=>{
 test.setTimeout(60000);await seed(page);await page.goto('/');await ready(page);await playback(page);
 await expect(page.locator('#replay-scramble')).toBeVisible();await expect(page.locator('#replay-scramble .current')).toHaveCount(1);
 for(const [at,stage] of [[45,'Scramble complete'],[1044,'Scramble complete'],[1045,'Reorienting'],[2045,'Reorienting'],[3045,'Ready'],[4044,'Ready']]){await range(page,at);await expect(page.locator('#home-replay-stage')).toHaveText(stage);await expect(page.locator('#replay-scramble')).toBeVisible();await expect(page.locator('#home-replay-time')).toHaveText('0.00');}
 await page.locator('.solve-layout').screenshot({path:'test-results/replay-scramble-subtitle.png'});await range(page,4045);await expect(page.locator('#replay-scramble')).toBeHidden();await expect(page.locator('#home-replay-stage')).toHaveText('Solve');
});

test('sharing offers link, text, JSON and album; copied links open on a fresh browser without changing its PBs',async({page,browser,context})=>{
 test.setTimeout(90000);const data=recording();await context.grantPermissions(['clipboard-read','clipboard-write']);await seed(page,data);await page.goto('/');await ready(page);await page.locator('#share-current').click();await expect(page.locator('#share-dialog')).toBeVisible();await expect(page.locator('.share-options button')).toHaveText(['Copy as link','Copy as text','Download as JSON','Save to album']);
 await expect(page.locator('#share-link')).toBeEnabled();await page.locator('#share-link').click();await expect(page.locator('#share-message')).toHaveText('Link copied');const link=await page.evaluate(()=>navigator.clipboard.readText());expect(link).toMatch(/^https:\/\/ftoers\.web\.app\/virtual\/#replay=1\./);
 await page.locator('#share-text').click();const text=await page.evaluate(()=>navigator.clipboard.readText());expect(JSON.parse(text).solveMs).toBe(data.solveMs);
 const download=page.waitForEvent('download');await page.locator('#share-json').click();expect(JSON.parse(await readFile(await (await download).path(),'utf8')).solveMs).toBe(data.solveMs);
 await page.locator('#share-album').click();await expect(page.locator('#share-message')).toContainText('Saved');await page.locator('#share-dialog').screenshot({path:'test-results/share-recording.png'});await page.locator('#close-share').click();await page.locator('#album').click();await expect(page.locator('#album-list .album-entry')).toHaveCount(1);await expect(page.locator('.album-pb')).toHaveText('[PB]');await expect(page.locator('.album-entry time')).toHaveAttribute('datetime',data.completedAt);await page.locator('#album-dialog').screenshot({path:'test-results/recording-album.png'});
 const otherContext=await browser.newContext(),other=await otherContext.newPage();await other.route('**/worker.js*',route=>route.fulfill({contentType:'text/javascript',body:"self.onmessage=()=>self.postMessage({scramble:'U F'});"}));await other.goto('/'+new URL(link).hash);await ready(other);await expect(other.locator('#home-replay-view canvas')).toBeVisible();expect((await snap(other)).replay.size).toBe(3);expect((await snap(other)).timer.times).toHaveLength(0);await other.locator('#home-replay-exit').click();expect(new URL(other.url()).hash).toBe('');await otherContext.close();
});

test('historical PBs remain in the album after a new PB and the complete album moves in user backups',async({page,browser})=>{
 test.setTimeout(90000);const old=recording(60000);await seed(page,old);await page.goto('/');await ready(page);await page.locator('#album').click();await expect(page.locator('#album-list .album-entry')).toHaveCount(1);await page.locator('#close-album').click();
 const recorder=new SolveRecorder({last:old,pbIsLast:true});recorder.arm({size:3,scramble:[U,R],view,keyboard:defaultConfig(3),colors:{U:'#ffffff'}});
 await page.addInitScript(({recordings,U,R,view})=>{if(window.name==='album-seeded-second')return;window.name='album-seeded-second';const saved=JSON.parse(localStorage.getItem('master-fto-v1')),solve=saved.solves[3];Object.assign(solve,{history:[U,R],redo:[],undoFloor:2,recordings,view});Object.assign(solve.timer,{status:'ready',elapsedMs:0});localStorage.setItem('master-fto-v1',JSON.stringify(saved));},{recordings:recorder.serialize(),U,R,view});
 await page.reload();await ready(page);expect((await snap(page)).timer.status).toBe('ready');await page.keyboard.press('KeyK');await page.waitForTimeout(50);await page.keyboard.press('KeyF');await expect.poll(async()=>(await snap(page)).timer.status).toBe('finished');expect((await snap(page)).timer.newBest).toBe(true);
 await page.locator('#album').click();await expect(page.locator('#album-list .album-entry')).toHaveCount(2);await expect(page.locator('.album-pb')).toHaveCount(2);await page.locator('#close-album').click();await page.reload();await ready(page);await page.locator('#album').click();await expect(page.locator('#album-list .album-entry')).toHaveCount(2);await page.locator('#close-album').click();
 await page.locator('#settings').click();const downloaded=page.waitForEvent('download');await page.locator('#export-user-data').click();const buffer=await readFile(await (await downloaded).path()),backup=JSON.parse(buffer);expect(backup.album.entries).toHaveLength(2);expect(backup.album.entries.every(e=>e.pb)).toBe(true);
 const fresh=await browser.newContext(),other=await fresh.newPage();await other.goto('/');await ready(other);await other.locator('#settings').click();await other.locator('#import-user-data').setInputFiles({name:'backup.json',mimeType:'application/json',buffer});await expect(other.locator('#confirm-message')).toContainText('2 album recordings');await Promise.all([other.waitForEvent('framenavigated'),other.locator('#confirm-accept').click()]);await ready(other);await other.locator('#album').click();await expect(other.locator('#album-list .album-entry')).toHaveCount(2);await expect(other.locator('.album-pb')).toHaveCount(2);await fresh.close();
});

test('manual saves keep non-PB recordings and can be watched from the album after reload',async({page})=>{
 test.setTimeout(60000);const data=recording(1200);await page.goto('/');await ready(page);await page.locator('#settings').click();await page.locator('#open-recordings').click();await page.locator('#recording-paste-open').click();await page.locator('#recording-paste').fill(JSON.stringify(data));await page.locator('#recording-paste-load').click();await page.locator('#recording-export').click();await page.locator('#share-album').click();await expect(page.locator('#share-message')).toContainText('Saved');await page.reload();await ready(page);
 await page.locator('#album').click();await expect(page.locator('#album-list .album-entry')).toHaveCount(1);await expect(page.locator('.album-pb')).toHaveCount(0);await page.locator('.album-entry').getByRole('button',{name:/^Play /}).click();await expect(page.locator('#home-replay-view canvas')).toBeVisible();expect((await snap(page)).timer.times).toHaveLength(0);
});

test('invalid replay links report an error without replacing user data',async({page})=>{
 await seed(page);await page.goto('/#replay=1.not-a-recording');await ready(page);await expect(page.locator('#recording-message')).toContainText('Invalid');expect((await snap(page)).timer.times).toHaveLength(1);expect((await snap(page)).replay).toBe(null);
});

test('the production build opens compressed links when mounted at /virtual/',async({page})=>{
 test.setTimeout(60000);const root=path.resolve('dist');const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.mp3':'audio/mpeg','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith('/virtual/')){res.writeHead(404).end();return;}let file=path.resolve(root,decodeURIComponent(pathname.slice('/virtual/'.length))||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if((await stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await page.route('**/worker-*.js',route=>route.fulfill({contentType:'text/javascript',body:"self.onmessage=()=>self.postMessage({scramble:'U F'});"}));await page.goto(`http://127.0.0.1:${server.address().port}/virtual/#replay=${await encodeRecording(recording())}`);await ready(page);await expect(page.locator('#home-replay-view canvas')).toBeVisible();await expect(page.locator('#home-replay-progress')).toBeVisible();}finally{await new Promise(resolve=>server.close(resolve));}
});

test('a recording link also opens when navigating only the fragment of an already open app',async({page})=>{
 test.setTimeout(60000);await page.goto('/');await ready(page);const payload=await encodeRecording(recording());await page.evaluate(payload=>location.hash='replay='+payload,payload);await expect(page.locator('#home-replay-view canvas')).toBeVisible();expect((await snap(page)).replay.size).toBe(3);await page.evaluate(()=>location.hash='');await expect.poll(async()=>(await snap(page)).replay).toBe(null);
});

test('opening Share pauses active playback until the user resumes it',async({page})=>{
 test.setTimeout(60000);await seed(page);await page.goto('/');await ready(page);await playback(page);await page.locator('#home-replay-play').click();await expect.poll(async()=>(await snap(page)).replay.at).toBeGreaterThan(0);await page.locator('#home-replay-share').click();await expect(page.locator('#share-dialog')).toBeVisible();expect((await snap(page)).replay.playing).toBe(false);const at=(await snap(page)).replay.at;await page.waitForTimeout(200);expect((await snap(page)).replay.at).toBe(at);await expect(page.locator('#share-watch')).toBeVisible();await page.locator('#share-watch').click();await expect(page.locator('#share-dialog')).toBeHidden();await expect(page.locator('#home-replay-play')).toHaveText('Play');
});
