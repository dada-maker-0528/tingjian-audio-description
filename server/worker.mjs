import film from '../public/assets/film.json' with {type:'json'};
import {openSpeech,SpeechError} from './volc-client.mjs';
import {pcmToWav} from './volc-protocol.mjs';
import {serveDemoVideo} from './media.mjs';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const ranges=new Set(['8:7','8:45','81:7','0:200']);
const gaps={8:7,34:9,63:7,81:7,105:8,136:8,148:8,168:8,186:8};
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export function validateInput(body){
 if(!body||Array.isArray(body)||typeof body!=='object')throw new SpeechError('bad_input','请求格式不正确。',400);
 if(body.kind==='guide'){
  if(typeof body.text!=='string'||!body.text.trim()||body.text.length>400)throw new SpeechError('bad_text','语音文字需要在 1—400 字之间。',400);
  return {kind:'guide',text:body.text.trim()};
 }
 if(body.kind!=='narration'||!ranges.has(`${body.start}:${body.duration}`)||!['normal','slow'].includes(body.speed)||!['balanced','concise'].includes(body.density))throw new SpeechError('bad_input','这组旁白设置暂不支持。',400);
 return {kind:'narration',start:body.start,duration:body.duration,speed:body.speed,density:body.density};
}
export async function handleTTS(request,env,connector=openSpeech){
 if(request.method!=='POST')return json({code:'method_not_allowed',message:'请使用语音合成按钮。'},405);
 if(request.headers.get('X-Tingjian-Request')!=='1'||!request.headers.get('Content-Type')?.includes('application/json'))return json({code:'bad_request',message:'请求格式不正确。'},400);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({code:'origin_denied',message:'不支持跨网站调用。'},403);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),55000);const onAbort=()=>controller.abort();request.signal.addEventListener('abort',onAbort,{once:true});let connection;
 try{
  if(Number(request.headers.get('Content-Length')||0)>6000)throw new SpeechError('request_too_large','请求文字过长。',413);
  const raw=await request.text();if(raw.length>6000)throw new SpeechError('request_too_large','请求文字过长。',413);
  let parsed;try{parsed=JSON.parse(raw);}catch{throw new SpeechError('bad_json','请求格式不正确。',400);}
  const body=validateInput(parsed);connection=await connector(env,controller.signal);
  if(body.kind==='guide'){
   const pcm=await connection.synthesize(body.text);
   return new Response(pcmToWav(pcm),{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store','X-TTS-Provider':'volcengine'}});
  }
  const source=film.narration[`${body.speed}-${body.density}`].filter(c=>c.start>=body.start&&c.start<body.start+body.duration);const segments=[];
  for(const cue of source){let text=cue.text,pcm=await connection.synthesize(text,body.speed);const gap=gaps[cue.start];
    if(pcm.length/48000>gap){const concise=film.narration['normal-concise'].find(c=>c.start===cue.start)?.text;if(concise&&concise!==text){text=concise;pcm=await connection.synthesize(text,body.speed);}}
    if(pcm.length/48000>gap)throw new SpeechError('timing_overflow','当前旁白放不进原片空隙，请改为简洁描述或自然语速。',422);
    segments.push({start:cue.start,end:cue.start+pcm.length/48000,text,pcm:base64(pcm)});
  }
  return json({provider:'volcengine',sampleRate:24000,trackDuration:200,segments});
 }catch(e){return json({code:e instanceof SpeechError?e.code:'synthesis_failed',message:e instanceof SpeechError?e.message:'在线语音暂时不可用，请重试或切换本地演示音频。'},e instanceof SpeechError?e.status:502);}
 finally{clearTimeout(timeout);request.signal.removeEventListener('abort',onAbort);connection?.close();}
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/api/media/rain-before.mp4')return serveDemoVideo(request,env.ASSETS);
 if(url.pathname==='/api/tts/status')return json({configured:!!env.VOLC_TTS_KEY,provider:'volcengine',label:'豆包语音',model:'seed-tts-2.0'});
 if(url.pathname==='/api/tts')return handleTTS(request,env);
 if(url.pathname.startsWith('/api/'))return json({message:'未找到这个接口。'},404);
 return env.ASSETS.fetch(request);
}};
