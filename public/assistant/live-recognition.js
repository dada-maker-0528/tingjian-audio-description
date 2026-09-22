import {ServerRecognition,pcmWav} from './server-recognition.js';

export const realtimeSocketURL=location=>`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/asr/realtime`;
// Audio goes to our server; credentials and the provider connection stay there.
export class LiveRecognition extends ServerRecognition{
 constructor(){super();this.items=new Map();this.captureChunks=[];this.captureSamples=0;this.sendQueue=Promise.resolve();}
 publish(){this.onresult?.({results:[...this.items.values()].map(value=>{const item=[{transcript:value.text}];item.isFinal=value.final;return item;})});}
 accept(event){
  if(this.cancelled)return;
  if(event.type==='transcript'){const prior=this.items.get(event.id);if(prior?.final&&!event.final)return;this.items.set(event.id,{text:event.text,final:event.final});this.publish();}
  else if(event.type==='done'){this.ended=true;this.resolveDone?.(true);this.publish();this.onend?.();}
  else if(event.type==='error')this.fail(event.message);
 }
 connect(){
  this.ended=false;this.donePromise=new Promise(resolve=>this.resolveDone=resolve);
  return new Promise((resolve,reject)=>{
   const socket=new WebSocket(realtimeSocketURL(globalThis.location));this.socket=socket;
   let ready=false;const timer=setTimeout(()=>{reject(new Error('实时识别连接超时'));this.fail('实时识别连接超时，请重试。');},15000);
   socket.onmessage=e=>{if(this.socket!==socket||this.cancelled)return;let event;try{event=JSON.parse(e.data);}catch{return this.fail('实时识别返回格式异常。');}if(event.type==='ready'){clearTimeout(timer);ready=true;resolve();}else{if(event.type==='error'){clearTimeout(timer);reject(new Error(event.message));}this.accept(event);}};
   socket.onerror=()=>{clearTimeout(timer);reject(new Error('实时识别连接失败'));if(this.socket===socket&&!this.cancelled)this.fail('实时识别连接失败，录音已保留。');};
   socket.onclose=()=>{clearTimeout(timer);if(!ready)reject(new Error('实时识别连接已关闭'));if(this.socket===socket&&!this.cancelled&&!this.ended)this.fail('实时识别连接中断，录音已保留。');};
  });
 }
 async start(){
  try{await this.connect();if(this.cancelled)return;await super.start();if(!this.audio||this.cancelled)this.socket?.close();}
  catch(error){if(!this.cancelled)this.fail(error.message);}
 }
 receive(chunk){
  if(this.cancelled||this.finishing)return;
  this.captureChunks.push(chunk);this.captureSamples+=chunk.length;
  if(this.captureSamples>=this.audio.sampleRate*.1)this.flush();
 }
 flush(){
  if(!this.captureChunks.length)return;
  const wav=pcmWav(this.captureChunks,this.audio.sampleRate);this.saved.push(wav);this.captureChunks=[];this.captureSamples=0;
  this.sendQueue=this.sendQueue.then(async()=>{const bytes=(await wav.arrayBuffer()).slice(44);if(this.cancelled||this.failure)return;if(this.socket?.readyState!==WebSocket.OPEN)throw new Error('实时识别连接中断');this.socket.send(bytes);}).catch(error=>this.fail(error.message));
 }
 async stop(){
  if(this.cancelled||this.stopPending)return;this.stopPending=true;this.finishing=true;
  if(!this.audio){this.abort();this.onend?.();return;}
  this.flush();super.release();await this.sendQueue;if(this.cancelled||this.failure)return;
  this.socket.send(JSON.stringify({type:'finish'}));await this.donePromise;
 }
 fail(message){
  if(this.cancelled||this.failure||this.ended)return;
  this.failure=new Error(message);this.finishing=true;this.flush();super.release();this.resolveDone?.(false);
  this.onerror?.({error:'network',message,recordings:this.saved});this.socket?.close();
 }
 async retry(){
  await this.sendQueue;
  this.cancelled=false;this.failure=null;this.finishing=true;this.stopPending=true;this.items.clear();
  try{
   await this.connect();
   for(const wav of this.saved){if(this.cancelled)return;const pcm=(await wav.arrayBuffer()).slice(44);this.socket.send(pcm);await new Promise(resolve=>setTimeout(resolve,50));}
   if(!this.cancelled){this.socket.send(JSON.stringify({type:'finish'}));await this.donePromise;}
  }catch(error){if(!this.cancelled)this.fail(error.message);}
 }
 abort(){super.abort();this.resolveDone?.(false);this.socket?.close();}
}
