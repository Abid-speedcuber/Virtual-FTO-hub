export async function withSettings(page,action){
 await page.locator('#settings').click();
 try{return await action();}finally{await page.locator('#close-settings').click();}
}
export async function confirmAction(page,action,accept=true){await action();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator(accept?'#confirm-accept':'#confirm-cancel').click();await page.locator('#confirm-dialog[data-pending]').waitFor({state:'detached'});}
export async function scramble(page){await confirmAction(page,()=>page.locator('#mobile-scramble').click());await page.waitForFunction(()=>!window.fto.snapshot().generatingScramble);}
export async function assignBinding(page,action,trigger){
 const row=page.locator(`tr[data-action="${action}"]`);
 await row.locator('.add-key').click();
 if(trigger)await page.locator('#bind-key-trigger').fill(trigger);
 await page.locator('#bind-key-save').click();
}
