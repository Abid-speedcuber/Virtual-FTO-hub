export async function withSettings(page,action){
 await page.locator('#settings').click();
 try{return await action();}finally{await page.locator('#close-settings').click();}
}
export async function confirmAction(page,action,accept=true){await action();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator(accept?'#confirm-accept':'#confirm-cancel').click();await page.locator('#confirm-dialog[data-pending]').waitFor({state:'detached'});}
export async function scramble(page){await confirmAction(page,()=>page.locator('#scramble').click());}
export async function chooseMove(page,face,dir=1){
 await page.locator('#binding-move-choice').click();
 await page.locator('#binding-move-options').getByRole('option',{name:`${face}${Number(dir)<0?'′':''}`,exact:true}).click();
}
