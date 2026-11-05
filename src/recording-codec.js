import {validateRecording,withoutInspection} from './solve-recording.js';
export const SHARE_BASE='https://ftoers.web.app/virtual/';
export const MAX_RECORDING_BYTES=16*1024*1024;
const encoder=new TextEncoder();
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
 return value;
}
export const recordingJSON=data=>JSON.stringify(canonical(withoutInspection(validateRecording(data))));
async function readLimited(stream,limit){
 const reader=stream.getReader(),parts=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw Error('Recording is too large');parts.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result;
}
function toBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64(text){
 if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length>Math.ceil(MAX_RECORDING_BYTES*1.4))throw Error('Invalid recording link');
 const binary=atob(text.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
export async function recordingID(data){const bytes=encoder.encode(recordingJSON(data)),digest=await crypto.subtle.digest('SHA-256',bytes);return 'r-'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function encodeRecording(data){
 const bytes=encoder.encode(recordingJSON(data));if(bytes.length>MAX_RECORDING_BYTES)throw Error('Recording is too large');
 if(typeof CompressionStream==='undefined')throw Error('This browser cannot create compressed recording links. Use JSON instead.');
 const compressed=await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),MAX_RECORDING_BYTES+1024);
 return '1.'+toBase64(compressed);
}
export async function decodeRecording(payload){
 if(typeof payload!=='string'||!payload.startsWith('1.'))throw Error('Unsupported recording link');
 if(typeof DecompressionStream==='undefined')throw Error('This browser cannot open compressed recording links. Import JSON instead.');
 try{
  const compressed=fromBase64(payload.slice(2)),bytes=await readLimited(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),MAX_RECORDING_BYTES);
  return withoutInspection(validateRecording(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))));
 }catch(error){if(error.message==='Recording is too large')throw error;throw Error('Invalid or damaged recording link');}
}
export async function recordingLink(data){return SHARE_BASE+'#replay='+await encodeRecording(data);}
export function recordingPayload(url=location.href){return new URLSearchParams(new URL(url).hash.slice(1)).get('replay');}
export function clearRecordingLink(){if(recordingPayload())history.replaceState(history.state,'',location.pathname+location.search);}
export async function parseRecordingText(text){
 const trimmed=text.trim();if(encoder.encode(trimmed).length>Math.ceil(MAX_RECORDING_BYTES*1.4))throw Error('Recording is too large');if(trimmed.startsWith('{')){if(encoder.encode(trimmed).length>MAX_RECORDING_BYTES)throw Error('Recording is too large');return withoutInspection(validateRecording(JSON.parse(trimmed)));}
 if(trimmed.startsWith('1.'))return decodeRecording(trimmed);
 let payload;try{payload=recordingPayload(trimmed);}catch{}if(!payload)throw Error('Paste an FTO recording link or recording JSON');return decodeRecording(payload);
}
