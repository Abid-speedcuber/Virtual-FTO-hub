// Keycap dimensions in standard 19.05 mm keyboard units. Rows are physically
// staggered; ANSI/ISO enter, shifts, modifiers, navigation and numpad retain
// their actual footprints instead of being laid out as a uniform button grid.
export function keyboardLayout({layout='ansi',numpad=false}={}){
 const keys=[],gap=.08,add=(code,x,y,w=1,h=1,shape=null)=>keys.push({code,x,y,w:w-gap,h:h-gap,shape});
 const row=(codes,y,start=0)=>{let x=start;for(const item of codes){const [code,w]=Array.isArray(item)?item:[item,1];add(code,x,y,w);x+=w;}};
 add('Escape',0,0);
 for(let i=0;i<12;i++)add(`F${i+1}`,2+i+Math.floor(i/4)*.5,0);
 ['PrintScreen','ScrollLock','Pause'].forEach((code,i)=>add(code,15.5+i,0));
 row(['Backquote',...Array.from({length:10},(_,i)=>`Digit${(i+1)%10}`),'Minus','Equal',['Backspace',2]],1.5);
 row([['Tab',1.5],...'QWERTYUIOP'.split('').map(k=>`Key${k}`),'BracketLeft','BracketRight',...(layout==='iso'?[]:[['Backslash',1.5]])],2.5);
 row([['CapsLock',1.75],...'ASDFGHJKL'.split('').map(k=>`Key${k}`),'Semicolon','Quote',...(layout==='iso'?['Backslash']:[['Enter',2.25]])],3.5);
 if(layout==='iso'){
  // ISO's tall, backwards-L Return occupies the end of two different rows.
  add('Enter',13.5,2.5,1.5,2,'iso-enter');
  row([['ShiftLeft',1.25],'IntlBackslash',...'ZXCVBNM'.split('').map(k=>`Key${k}`),'Comma','Period','Slash',['ShiftRight',2.75]],4.5);
 }else row([['ShiftLeft',2.25],...'ZXCVBNM'.split('').map(k=>`Key${k}`),'Comma','Period','Slash',['ShiftRight',2.75]],4.5);
 row([['ControlLeft',1.25],['MetaLeft',1.25],['AltLeft',1.25],['Space',6.25],['AltRight',1.25],['MetaRight',1.25],['ContextMenu',1.25],['ControlRight',1.25]],5.5);
 for(const [y,codes] of [[1.5,['Insert','Home','PageUp']],[2.5,['Delete','End','PageDown']]])codes.forEach((code,i)=>add(code,15.5+i,y));
 add('ArrowUp',16.5,4.5);['ArrowLeft','ArrowDown','ArrowRight'].forEach((code,i)=>add(code,15.5+i,5.5));
 if(numpad){
  row(['NumLock','NumpadDivide','NumpadMultiply','NumpadSubtract'],1.5,19);
  row(['Numpad7','Numpad8','Numpad9'],2.5,19);add('NumpadAdd',22,2.5,1,2);
  row(['Numpad4','Numpad5','Numpad6'],3.5,19);
  row(['Numpad1','Numpad2','Numpad3'],4.5,19);add('NumpadEnter',22,4.5,1,2);
  row([['Numpad0',2],'NumpadDecimal'],5.5,19);
 }
 if(layout==='60'){const compact=keys.filter(k=>k.y>=1.5&&k.x<15).map(k=>({...k,code:k.code==='Backquote'?'Escape':k.code,y:k.y-1.5}));return {keys:compact,width:15,height:5};}
 return {keys,width:numpad?23:18.5,height:6.5};
}
