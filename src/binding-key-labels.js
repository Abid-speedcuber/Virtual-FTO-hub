import {parseTrigger,displayCode} from './keyboard-engine.js';
const keyNames={BracketLeft:'[',BracketRight:']',Backquote:'`',Minus:'−',Equal:'=',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',AltLeft:'Left Alt',AltRight:'Right Alt'};
export function formatBindingTrigger(trigger,platform=''){
 const meta=/Mac|iPhone|iPad|iPod/i.test(platform)?'Cmd':/Win/i.test(platform)?'Win':'Super';
 const names={...keyNames,Meta:meta,MetaLeft:`Left ${meta}`,MetaRight:`Right ${meta}`};
 return parseTrigger(trigger).map(step=>step.sort((a,b)=>Number(/^(Control|Shift|Alt|Meta)/.test(b))-Number(/^(Control|Shift|Alt|Meta)/.test(a))).map(code=>names[code]??displayCode(code)).join('+')).join(' ');
}
