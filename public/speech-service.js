import {defaultFilm} from './catalog-config.js';
import {assetURL} from './asset-url.js';
import {DEFAULT_VOICE} from './voices.js';
import {normalizePrompt,UI_PROMPTS} from './ui-speech.js';
const SAMPLE_RATE=24000,IDENTITY='volc-voices-2.0-v3';
function wavFromSegments(segments,duration){
 const bytes=new Uint8Array(44+Math.ceil(duration*SAMPLE_RATE)*2),v=new DataView(bytes.buffer),enc=new TextEncoder();
 const word=(text,at)=>bytes.set(enc.encode(text),at);
 word('RIFF',0);v.setUint32(4,bytes.length-8,true);word('WAVE',8);word('fmt ',12);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,SAMPLE_RATE,true);v.setUint32(28,SAMPLE_RATE*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word('data',36);v.setUint32(40,bytes.length-44,true);
 for(const part of segments){const pcm=atob(part.pcm),offset=44+Math.round(part.start*SAMPLE_RATE)*2;if(offset<44||offset+pcm.length>bytes.length)throw new Error('旁白音频超出视频范围。');for(let i=0;i<pcm.length;i++)bytes[offset+i]=pcm.charCodeAt(i);}
 return new Blob([bytes],{type:'audio/wav'});
}
function database(){return new Promise(resolve=>{try{const request=indexedDB.open('tingjian-voice-cache',1);request.onupgradeneeded=()=>request.result.createObjectStore('audio');request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);}catch{resolve(null);}});}
async function readCache(key){const db=await database();if(!db)return null;return new Promise(resolve=>{const request=db.transaction('audio').objectStore('audio').get(key);request.onsuccess=()=>{db.close();resolve(request.result||null);};request.onerror=()=>{db.close();resolve(null);};});}
async function saveCache(key,value){const db=await database();if(!db)return;await new Promise(resolve=>{const transaction=db.transaction('audio','readwrite');transaction.objectStore('audio').put(value,key);transaction.oncomplete=transaction.onerror=transaction.onabort=()=>{db.close();resolve();};});}
function aborted(signal){if(signal?.aborted)throw new DOMException('已取消','AbortError');}
export async function trimPromptStart(blob){
 // Only generated UI WAVs; never touch film narration timing or the original sound.
 const buffer=await blob.arrayBuffer();if(buffer.byteLength<44)return blob;
 const view=new DataView(buffer),bytes=new Uint8Array(buffer);
 if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(36,40))!=='data'||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint16(34,true)!==16)return blob;
 const rate=view.getUint32(24,true),frames=Math.floor((buffer.byteLength-44)/2),step=Math.max(1,Math.floor(rate*.01));let onset=0;
 for(let i=0;i<Math.min(frames,rate);i+=step){let energy=0,n=Math.min(step,frames-i);for(let j=0;j<n;j++)energy+=view.getInt16(44+(i+j)*2,true)**2;if(Math.sqrt(energy/n)>130){onset=i;break;}}
 const cut=Math.max(0,onset-Math.round(rate*.04));if(!cut)return blob;
 const next=new Uint8Array(buffer.byteLength-cut*2);next.set(bytes.subarray(0,44));next.set(bytes.subarray(44+cut*2),44);
 const header=new DataView(next.buffer);header.setUint32(4,next.length-8,true);header.setUint32(40,next.length-44,true);return new Blob([next],{type:'audio/wav'});
}
export class SpeechService{
 constructor(){this.available=false;this.cache=new Map();this.queue=Promise.resolve();this.guideFlights=new Map();this.warmPending=new Set();this.warmQueue=[];this.warmActive=0;}
 async discover(){if(location.protocol==='file:'||window.__TINGJIAN_ASSETS__)return false;try{const response=await fetch('/api/tts/status',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(response.ok){const data=await response.json();this.available=data.configured===true;}}catch{}return this.available;}
 enqueue(job){const result=this.queue.catch(()=>{}).then(job);this.queue=result.catch(()=>{});return result;}
 async request(body,signal){aborted(signal);const response=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Tingjian-Request':'1'},body:JSON.stringify(body),signal});if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.message||data.error||'在线语音暂时不可用。');}return response;}
 async guide(text,signal,voice=DEFAULT_VOICE,cachedOnly=false){
  text=normalizePrompt(text);const key=[IDENTITY,'doubao-ui-v1',voice,text].join(':');aborted(signal);if(this.cache.has(key))return this.cache.get(key);
  if(this.guideFlights.has(key)){
   const result=await this.guideFlights.get(key);aborted(signal);if(result||cachedOnly)return result;
   return this.guide(text,signal,voice,false);
  }
  const pending=this.loadGuide(text,voice,key,cachedOnly);this.guideFlights.set(key,pending);
  try{const result=await pending;aborted(signal);return result;}finally{if(this.guideFlights.get(key)===pending)this.guideFlights.delete(key);}
 }
 async loadGuide(text,voice,key,cachedOnly){
  // A focus cancellation must not abort a shared preload. Callers still discard stale playback.
  const signal=AbortSignal.timeout(20000);
  // UI speech must not wait behind a whole-film synthesis job.
  let blob=await readCache(key);aborted(signal);
  if(!blob){
   let response;try{response=await fetch('/api/tts/ui-audio?'+new URLSearchParams({text,voice}),{signal});}catch(e){if(e.name==='AbortError')throw e;}
   if(!response?.ok){if(cachedOnly)return null;if(!this.available)throw new Error('豆包语音尚未连接，这段提示还没有缓存。');response=await this.request({kind:'guide',text,voice},signal);}
   blob=await response.blob();aborted(signal);if(blob.size<=44||!blob.type.startsWith('audio/'))throw new Error('语音服务未返回音频。');await saveCache(key,blob);
  }
  aborted(signal);const ready=await trimPromptStart(blob);const url=URL.createObjectURL(ready);this.cache.set(key,url);return url;
 }
 warmGuides(texts,voice=DEFAULT_VOICE){
  const fixed=new Set(UI_PROMPTS);
  for(const text of texts){const words=normalizePrompt(text),key=voice+':'+words;if(!fixed.has(words)||this.warmPending.has(key))continue;this.warmPending.add(key);this.warmQueue.push({words,voice,key});}
  const drain=()=>{while(this.warmActive<6&&this.warmQueue.length){const item=this.warmQueue.shift();this.warmActive++;this.guide(item.words,undefined,item.voice,true).catch(()=>{}).finally(()=>{this.warmActive--;drain();});}};drain();
 }
 async uiStatus(voice=DEFAULT_VOICE){const response=await fetch('/api/tts/ui-status?'+new URLSearchParams({voice}),{cache:'no-store'});if(!response.ok)return null;return (await response.json()).data;}
 async prepareUI(voice=DEFAULT_VOICE){if(!this.available)return null;const response=await fetch('/api/tts/prepare-ui',{method:'POST',headers:{'Content-Type':'application/json','X-Tingjian-Request':'1'},body:JSON.stringify({voice})});if(!response.ok)return null;return (await response.json()).data;}
 async narration(start,duration,settings,signal,film=defaultFilm){
  const voice=settings.voice||DEFAULT_VOICE;const key=[IDENTITY,film.id,'narration',voice,start,duration,settings.speed,settings.density].join(':');
  if(this.cache.has(key))return this.cache.get(key);
  return this.enqueue(async()=>{aborted(signal);if(this.cache.has(key))return this.cache.get(key);let stored=await readCache(key);aborted(signal);
   if(!stored){const ready=voice===DEFAULT_VOICE&&start===0&&duration===film.duration?film.prebuiltOnline?.[settings.speed+'-'+settings.density]:null;
    if(ready){const response=await fetch(assetURL(ready.file),{signal});if(!response.ok)throw new Error('已准备的旁白读取失败。');stored={blob:await response.blob(),cues:ready.cues};}
    else{if(!this.available)throw new Error('这版豆包旁白尚未准备，请连接语音服务后重试。');const response=await this.request({kind:'narration',filmId:film.id,voice,start,duration,speed:settings.speed,density:settings.density},signal);const data=await response.json();aborted(signal);if(data.filmId!==film.id||data.voice!==voice||data.provider!=='volcengine'||data.sampleRate!==SAMPLE_RATE||!Array.isArray(data.segments)||!data.segments.length)throw new Error('旁白音色或视频数据不匹配。');const blob=wavFromSegments(data.segments,data.trackDuration);stored={blob,cues:data.segments.map(({start,end,text})=>({start,end,text,kind:'narration'}))};}
    aborted(signal);await saveCache(key,stored);
   }
   aborted(signal);const result={url:URL.createObjectURL(stored.blob),cues:stored.cues,provider:'volcengine',voice};this.cache.set(key,result);return result;
  });
 }
}
