import {regressionKeyboard} from './keyboard-fixture.js';
import {test,expect} from '@playwright/test';
import {withSettings,scramble} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const size=async(page,n)=>withSettings(page,()=>page.locator('#size').selectOption(String(n)));
const key=async(page,code)=>page.keyboard.press(code);
const binding=async(page,trigger,type,face='U',kind='outer',depth=1)=>{
 await page.locator('#binding-new').click();await page.locator('#binding-trigger').fill(trigger);await page.locator('#binding-type').selectOption(type);
 if(['move','rotate'].includes(type)){await page.locator('#binding-face').selectOption(face);if(type==='move')await page.locator('#binding-kind').selectOption(kind);}
 if(await page.locator('#binding-depth').isVisible())await page.locator('#binding-depth').fill(String(depth));await page.locator('#binding-save').click();await expect(page.locator('#binding-message')).toHaveText('Binding saved.');
};
async function edit(page,action){await page.locator('#settings').click();await page.locator('#edit-keyboard').click();await action();await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();}
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);await withSettings(page,async()=>{await page.locator('#animate').uncheck();await page.locator('#show-keyboard').check();});});
test('3x3 CIF, EIF-R, EIF-L, and E-Center expose the requested moves and switch back',async({page})=>{
 await size(page,3);await expect(page.locator('[data-code="KeyF"] text')).toHaveText('U′');await expect(page.locator('[data-code="KeyJ"] text')).toHaveText('U');await expect(page.locator('[data-code="AltLeft"] text')).toBeEmpty();await expect(page.locator('[data-code="ControlLeft"] text')).not.toHaveText('Wide');
 await key(page,'KeyF');expect((await snap(page)).history.at(-1)).toMatchObject({name:'U',dir:-1});await key(page,'Tab');expect((await snap(page)).keyboard.modeName).toBe('EIF-R');await expect(page.locator('[data-code="KeyI"] text')).toHaveText('BR');await expect(page.locator('[data-code="KeyH"] text')).toHaveText('R');await key(page,'Tab');expect((await snap(page)).keyboard.modeName).toBe('CIF');
 await key(page,'KeyC');expect((await snap(page)).keyboard.modeName).toBe('EIF-L');await expect(page.locator('[data-code="KeyI"] text')).toHaveText('F');await key(page,'KeyC');await key(page,'KeyM');expect((await snap(page)).keyboard.modeName).toBe('E– cntr');await expect(page.locator('[data-code="KeyJ"] text')).toHaveText('2R′');await key(page,'KeyJ');expect((await snap(page)).history.at(-1)).toMatchObject({name:'R',depth:2,count:1,dir:-1});await key(page,'KeyM');expect((await snap(page)).keyboard.modeName).toBe('CIF');
 await key(page,'Space');await key(page,'KeyF');expect((await snap(page)).history.at(-1)).toMatchObject({name:'U',count:2,dir:-1});expect((await snap(page)).keyboard.pending).toBe(null);
});
test('full-width suffix rotates the view without turns or timer; dedicated rotation is bindable',async({page})=>{
 await size(page,2);await expect(page.locator('[data-code="Digit2"] text')).toHaveText('Rot');await expect(page.locator('[data-code="Digit1"] text')).toBeEmpty();const before=await snap(page);await key(page,'Digit2');await key(page,'KeyJ');const after=await snap(page);expect(after.history).toHaveLength(0);expect(after.state).toEqual(before.state);expect(after.orbit).not.toEqual(before.orbit);expect(after.keyboard.stats.total).toBe(0);expect(after.timer.status).toBe('idle');expect(after.keyboard.pending).toBe(null);
 await edit(page,()=>binding(page,'Q','rotate','R'));const orbit=(await snap(page)).orbit;await key(page,'KeyQ');expect((await snap(page)).orbit).not.toEqual(orbit);expect((await snap(page)).history).toHaveLength(0);
});
test('size-specific custom slice suffix and exact moves persist independently across reload',async({page})=>{
 await size(page,10);await edit(page,async()=>{await binding(page,"'",'suffix-slice');await binding(page,'Q','move','R','slice',8);await binding(page,'Z','move','U','wide',8);});
 await key(page,'Digit8');await key(page,'Quote');await expect(page.locator('[data-code="Quote"]')).toHaveClass(/selected/);await key(page,'KeyF');expect((await snap(page)).history.at(-1)).toMatchObject({name:'U',depth:8,count:1,dir:-1});expect((await snap(page)).keyboard.slicePending).toBe(false);expect((await snap(page)).keyboard.pending).toBe(null);
 await key(page,'KeyQ');expect((await snap(page)).history.at(-1)).toMatchObject({name:'R',depth:8,count:1});await key(page,'KeyZ');expect((await snap(page)).history.at(-1)).toMatchObject({name:'U',depth:1,count:8});
 await size(page,3);expect((await snap(page)).keyboard.config.modes).toHaveLength(4);await expect(page.locator('[data-code="KeyQ"] text')).toBeEmpty();await page.reload();await ready(page);await size(page,10);expect((await snap(page)).keyboard.config.modes).toHaveLength(3);await expect(page.locator('[data-code="KeyQ"] text')).toHaveText('8R');await expect(page.locator('[data-code="Quote"] text')).toHaveText('Slice next');
});
test('sounds setting persists; clicking the settings backdrop closes it',async({page})=>{
 await page.locator('#settings').click();await page.locator('#disable-sounds').check();await page.mouse.click(2,2);await expect(page.locator('#settings-dialog')).not.toBeVisible();await page.reload();await ready(page);await page.locator('#settings').click();await expect(page.locator('#disable-sounds')).toBeChecked();
});
test('reset confirmation pauses and grays the puzzle even if its dialog is cancelled',async({page})=>{
 await scramble(page);await key(page,'KeyF');await page.locator('#freeplay-reset').click();await expect(page.locator('#confirm-dialog')).toBeVisible();const paused=await snap(page);expect(paused.timer.status).toBe('paused');expect(paused.stickerColors).toEqual(Array(8).fill('888888'));await page.screenshot({path:'test-results/confirm-gray.png'});await page.locator('#confirm-cancel').click();await expect.poll(async()=>(await snap(page)).timer.status).toBe('running');expect(new Set((await snap(page)).stickerColors).size).toBe(8);
});

test('suffixes play tones, accepted moves play clicks, and mute suppresses both',async({page})=>{
 await page.evaluate(()=>{
  const Native=window.AudioContext;window.soundTrace={contexts:0,clicks:0,tones:0};
  window.AudioContext=class extends Native{constructor(...args){super(...args);window.soundTrace.contexts++;}createBufferSource(){window.soundTrace.clicks++;return super.createBufferSource();}createOscillator(){window.soundTrace.tones++;return super.createOscillator();}};
 });
 await key(page,'Digit2');let audio=await page.evaluate(()=>window.soundTrace);expect(audio.contexts).toBe(1);expect(audio.clicks).toBe(0);expect(audio.tones).toBe(1);
 await key(page,'KeyF');audio=await page.evaluate(()=>window.soundTrace);expect(audio.clicks).toBe(1);const before=audio;
 await withSettings(page,()=>page.locator('#disable-sounds').check());await key(page,'Digit2');await key(page,'KeyF');expect(await page.evaluate(()=>window.soundTrace)).toEqual(before);
});

test('untouched legacy defaults upgrade to the active size without losing overlay preferences',async({page})=>{
 await size(page,3);const legacy=regressionKeyboard();legacy.modes[0].name='Default';legacy.display.show=true;legacy.display.width=760;
 await page.evaluate(config=>{localStorage.removeItem('master-fto-keyboard-v2');localStorage.setItem('master-fto-keyboard-v1',JSON.stringify(config));},legacy);
 await page.reload();await ready(page);const config=(await snap(page)).keyboard.config;expect(config.modes.map(m=>m.name)).toEqual(['CIF','EIF-R','EIF-L','E– cntr']);expect(config.display.width).toBe(760);await expect(page.locator('[data-code="KeyF"] text')).toHaveText('U′');
});

test('free play stays colored through breaks, printing, and confirmation dialogs',async({page})=>{
 const colors=(await snap(page)).stickerColors;
 for(const event of ['blur','beforeprint']){await page.evaluate(event=>window.dispatchEvent(new Event(event)),event);expect((await snap(page)).stickerColors).toEqual(colors);}
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await key(page,'KeyF');await page.locator('#freeplay-reset').click();expect((await snap(page)).stickerColors).toEqual(colors);await page.locator('#confirm-cancel').click();await expect.poll(async()=>(await snap(page)).stickerColors).toEqual(colors);
});
