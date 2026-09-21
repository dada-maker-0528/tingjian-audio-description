import {defaultFilm} from './catalog-config.js';
import {assetURL} from './asset-url.js';
import {DEFAULT_VOICE} from './voices.js';
const SAMPLE_RATE=24000,IDENTITY='volc-voices-2.0-v2';
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
export class SpeechService{
 constructor(){this.available=false;this.cache=new Map();this.queue=Promise.resolve();}
 async discover(){if(location.protocol==='file:'||window.__TINGJIAN_ASSETS__)return false;try{const response=await fetch('/api/tts/status',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(response.ok){const data=await response.json();this.available=data.configured===true;}}catch{}return this.available;}
 enqueue(job){const result=this.queue.catch(()=>{}).then(job);this.queue=result.catch(()=>{});return result;}
 async request(body,signal){aborted(signal);const response=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Tingjian-Request':'1'},body:JSON.stringify(body),signal});if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.message||'在线语音暂时不可用。');}return response;}
 async guide(text,signal,voice=DEFAULT_VOICE){const key=[IDENTITY,'guide',voice,text].join(':');if(this.cache.has(key))return this.cache.get(key);return this.enqueue(async()=>{aborted(signal);if(this.cache.has(key))return this.cache.get(key);const response=await this.request({kind:'guide',text,voice},signal);const blob=await response.blob();aborted(signal);if(blob.size<=44)throw new Error('语音服务未返回音频。');const url=URL.createObjectURL(blob);this.cache.set(key,url);return url;});}
 async narration(start,duration,settings,signal,film=defaultFilm){
  const voice=settings.voice||DEFAULT_VOICE;const key=[IDENTITY,film.id,'narration',voice,start,duration,settings.speed,settings.density].join(':');
  if(this.cache.has(key))return this.cache.get(key);
  return this.enqueue(async()=>{aborted(signal);if(this.cache.has(key))return this.cache.get(key);let stored=await readCache(key);aborted(signal);
   if(!stored){const ready=voice===DEFAULT_VOICE&&start===0&&duration===film.duration?film.prebuiltOnline?.[settings.speed+'-'+settings.density]:null;
    if(ready){const response=await fetch(assetURL(ready.file),{signal});if(!response.ok)throw new Error('已准备的旁白读取失败。');stored={blob:await response.blob(),cues:ready.cues};}
    else{const response=await this.request({kind:'narration',filmId:film.id,voice,start,duration,speed:settings.speed,density:settings.density},signal);const data=await response.json();aborted(signal);if(data.filmId!==film.id||data.voice!==voice||data.provider!=='volcengine'||data.sampleRate!==SAMPLE_RATE||!Array.isArray(data.segments)||!data.segments.length)throw new Error('旁白音色或视频数据不匹配。');const blob=wavFromSegments(data.segments,data.trackDuration);stored={blob,cues:data.segments.map(({start,end,text})=>({start,end,text,kind:'narration'}))};}
    aborted(signal);await saveCache(key,stored);
   }
   aborted(signal);const result={url:URL.createObjectURL(stored.blob),cues:stored.cues,provider:'volcengine',voice};this.cache.set(key,result);return result;
  });
 }
}
