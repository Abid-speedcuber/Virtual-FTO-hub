export async function withSettings(page,action){
 await page.locator('#settings').click();
 try{return await action();}finally{await page.locator('#close-settings').click();}
}
export async function showMoveButtons(page){
 await withSettings(page,()=>page.getByRole('switch',{name:'Show move buttons',exact:true}).check());
}

export async function scramble(page){page.once('dialog',dialog=>dialog.accept());await page.locator('#scramble').click();}
