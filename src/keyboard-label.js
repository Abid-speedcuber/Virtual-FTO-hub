const NS='http://www.w3.org/2000/svg';
// Both keyboards use the same SVG label layout. Only measure changed labels;
// keep the glyphs inside the key even for unusually wide custom mode names.
export function renderKeyLabel(label,text,width=1){
 const available=Math.max(.1,width-.16),signature=`${width}:${text}`;
 if(label.dataset.labelLayout!==signature){
  label.dataset.labelLayout=signature;label.dataset.fitted='';label.removeAttribute('textLength');label.removeAttribute('lengthAdjust');label.textContent=text;
  label.setAttribute('font-size',text.length>8?'.17':text.length>5?'.20':text.length>3?'.26':'.33');
  const words=text.split(' ');
  if(words.length===2&&words.every(word=>word.length<=6)){
   label.replaceChildren();for(const [i,line] of words.entries()){const span=document.createElementNS(NS,'tspan');span.setAttribute('x',label.getAttribute('x'));span.setAttribute('dy',i?'.29':'-.14');span.textContent=line+(i?'':' ');label.append(span);}label.setAttribute('font-size','.23');
  }
 }
 if(label.dataset.fitted==='yes'||!text)return;
 let visible=true;
 for(const line of label.children.length?[...label.children]:[label]){
  const length=line.getComputedTextLength();if(!length){visible=false;continue;}
  if(length>available){line.setAttribute('textLength',String(available));line.setAttribute('lengthAdjust','spacingAndGlyphs');}
 }
 if(visible)label.dataset.fitted='yes';
}
