// Offline browser integration: fulfill local assets without a listening socket.
import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('../ftoers/public'),dist=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg'};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir('/tmp/ftoers-qa',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:1080}});
 const errors=[];
 await context.route('https://ftoers.test/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/shared/config.js')){await route.fulfill({contentType:'text/javascript',body:"export const backendConfig={url:'',key:''};"});return;}let target=url.pathname.startsWith('/virtual/')?path.join(dist,url.pathname.slice(9)):path.join(root,url.pathname);if(url.pathname.endsWith('/'))target=path.join(target,'index.html');try{const body=await readFile(target);await route.fulfill({contentType:types[path.extname(target)]||'application/octet-stream',body});}catch{await route.fulfill({status:404,body:'Not found'});}});
 const home=await context.newPage();home.on('pageerror',e=>errors.push(e.message));
 await home.goto('https://ftoers.test/');await home.locator('#ft-account-trigger').waitFor();
 assert.equal(await home.locator('#leaderboard').count(),0,'Homepage has no leaderboard');assert.equal(await home.getByRole('link',{name:'Leaderboard',exact:true}).count(),0);
 await home.screenshot({path:'/tmp/ftoers-qa/home-desktop.png',fullPage:true});
 await home.locator('#ft-account-trigger').click();await home.getByRole('menuitem',{name:'Sign in',exact:true}).click();await home.locator('.ft-dialog[open]').waitFor();
 assert.match(await home.locator('.ft-dialog [role=status]').textContent(),/not configured/);
 await home.getByRole('button',{name:'Create an account',exact:true}).click();assert.equal(await home.locator('.ft-dialog[open] h2').textContent(),'Create account');assert.equal(await home.locator('[data-name]').isVisible(),true);
 await home.getByRole('button',{name:'Close account'}).click();
 await home.setViewportSize({width:390,height:844});await home.screenshot({path:'/tmp/ftoers-qa/home-mobile.png',fullPage:true});
 assert.equal(await home.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile homepage must not overflow');
 const simulator=await context.newPage();simulator.on('pageerror',e=>errors.push(e.message));await simulator.goto('https://ftoers.test/virtual/');await simulator.waitForFunction(()=>window.fto?.snapshot().ready);await simulator.locator('#ft-account-trigger').waitFor();
 await simulator.locator('#leaderboard').click();await simulator.locator('#leaderboard-dialog[open]').waitFor();await simulator.locator('#board-message').filter({hasText:'backend is connected'}).waitFor();await simulator.getByRole('button',{name:'ao12',exact:true}).click();assert.equal(await simulator.getByRole('button',{name:'ao12',exact:true}).getAttribute('aria-pressed'),'true');await simulator.screenshot({path:'/tmp/ftoers-qa/leaderboard.png'});await simulator.locator('#close-leaderboard').click();
 await simulator.locator('#ft-account-trigger').click();await simulator.getByRole('menuitem',{name:'Sign in',exact:true}).click();await simulator.locator('.ft-dialog[open]').waitFor();await simulator.getByRole('button',{name:'Close account'}).click();
 // Use an actual local recording to exercise the production sharing controls.
 const {SolveRecorder}=await import('../src/solve-recording.js');const {defaultConfig}=await import('../src/keyboard-engine.js');let now=0;const recorder=new SolveRecorder({},()=>now),U={normal:[1,1,1],layer:'outer',dir:1,name:'U'};
 async function replay(size,username){now=0;recorder.arm({size,scramble:[U],view:{rotation:[0,0,0,1],radius:10},keyboard:defaultConfig(size),colors:{}});recorder.begin({rotation:[0,0,0,1],radius:10},defaultConfig(size));if(username)recorder.attempt.solver={username};now=1000;return recorder.finish(1000,true);}
 for(const size of [3,4]){
  const data=await replay(size,size===3?'TestSolver':null);
  await simulator.locator('#album').click();await simulator.locator('#album-import-recording').click();await simulator.locator('#recording-paste').fill(JSON.stringify(data));await simulator.locator('#recording-paste-load').click();await simulator.locator('#home-replay-view canvas').waitFor();
  if(size===3)assert.match(await simulator.locator('.keyboard-readout').last().textContent(),/TestSolver’s keyboard/);
  await simulator.locator('#home-replay-share').click();await simulator.locator('#share-dialog').waitFor();
  assert.equal(await simulator.locator('#share-link').isVisible(),size===3);assert.equal(await simulator.locator('#share-short').isVisible(),size===3);
  await simulator.screenshot({path:`/tmp/ftoers-qa/share-${size}.png`});await simulator.locator('#close-share').click();await simulator.locator('#home-replay-exit').click();
 }
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log('Offline browser checks passed: desktop/mobile homepage, signup controls, shared account module, solver attribution, 3x3 and 4x4 sharing.');
 await context.close();
}finally{await browser.close();}
