import {encodeEvent,decodeMessage,joinAudio} from './volc-protocol.mjs';
const ENDPOINT='https://openspeech.bytedance.com/api/v3/tts/bidirection';
export class SpeechError extends Error{constructor(code,message,status=502){super(message);this.code=code;this.status=status;}}
export async function openSpeech(env,signal,fetcher=fetch){
 if(!env.VOLC_TTS_KEY)throw new SpeechError('not_configured','在线语音尚未配置，请使用本地演示音频。',503);
 const response=await fetcher(ENDPOINT,{headers:{Upgrade:'websocket','X-Api-Key':env.VOLC_TTS_KEY,'X-Api-Resource-Id':env.VOLC_TTS_RESOURCE_ID||'seed-tts-2.0','X-Api-Connect-Id':crypto.randomUUID()},signal});
 if(!response.webSocket){await response.body?.cancel();throw new SpeechError('upstream_auth','语音服务连接失败，请检查密钥、额度与服务授权。');}
 const ws=response.webSocket;ws.binaryType='arraybuffer';
 let pending=null,closed=false,terminalError=null;const queue=[];
 const fail=e=>{terminalError=e;if(pending){const p=pending;pending=null;p.reject(e);}};
 ws.addEventListener('message',e=>{try{const m=decodeMessage(e.data);if(m.compression!==0)throw new Error('Unexpected compressed frame');if(m.type===15||[51,153].includes(m.event)){fail(new SpeechError('upstream_rejected','语音服务没有完成合成，请稍后重试或使用本地音频。'));return;}if(pending){const p=pending;pending=null;p.resolve(m);}else queue.push(m);}catch{fail(new SpeechError('protocol_error','语音服务返回了无法读取的数据。'));}});
 ws.addEventListener('error',()=>fail(new SpeechError('connection_error','语音连接中断，请重试。')));
 ws.addEventListener('close',()=>{if(!closed)fail(new SpeechError('connection_closed','语音连接提前结束，请重试。'));});
 const abort=()=>{fail(new SpeechError('aborted','已取消语音合成。',499));try{ws.close(1000,'cancelled');}catch{}};
 signal?.addEventListener('abort',abort,{once:true});
 ws.accept();
 const receive=()=>{if(terminalError)return Promise.reject(terminalError);if(signal?.aborted)return Promise.reject(new SpeechError('aborted','已取消语音合成。',499));if(queue.length)return Promise.resolve(queue.shift());return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending=null;reject(new SpeechError('timeout','语音合成等待超时，请重试。',504));},18000);pending={resolve:x=>{clearTimeout(timeout);resolve(x);},reject:e=>{clearTimeout(timeout);reject(e);}};});};
 const wait=async(event,sessionId)=>{for(let i=0;i<1000;i++){const m=await receive();if(m.event===event&&(!sessionId||m.sessionId===sessionId))return m;}throw new SpeechError('protocol_error','语音服务事件过多。');};
 const close=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',abort);try{ws.send(encodeEvent(2));ws.close(1000,'done');}catch{}};
 try{ws.send(encodeEvent(1));await wait(50);}catch(e){close();throw e;}
 return {close,async synthesize(text,speed='normal'){
   const sessionId=crypto.randomUUID();const params={user:{uid:'tingjian-demo'},namespace:'BidirectionalTTS',req_params:{speaker:env.VOLC_TTS_SPEAKER||'zh_female_vv_uranus_bigtts',audio_params:{format:'pcm',sample_rate:24000,speech_rate:speed==='slow'?-20:0}}};
   ws.send(encodeEvent(100,params,sessionId));await wait(150,sessionId);
   ws.send(encodeEvent(200,{...params,event:200,req_params:{...params.req_params,text}},sessionId));ws.send(encodeEvent(102,{},sessionId));
   const chunks=[];let bytes=0;
   for(let i=0;i<5000;i++){const m=await receive();if(m.sessionId&&m.sessionId!==sessionId)continue;
     if(m.event===352||m.type===11){bytes+=m.payload.length;if(bytes>4_800_000)throw new SpeechError('audio_limit','这段语音过长，请减少文字。',422);chunks.push(m.payload.slice());}
     if(m.event===152){if(!bytes)throw new SpeechError('empty_audio','语音服务没有返回音频。');return joinAudio(chunks);}
   }
   throw new SpeechError('audio_limit','这段语音未正常结束。');
 }};
}
