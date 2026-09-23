import {ServerRecognition,pcmWav} from './server-recognition.js';

export const realtimeSocketURL=location=>`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/asr/realtime`;
export async function joinRecording(chunks){
 const parts=await Promise.all(chunks.map(async blob=>new Uint8Array(await blob.arrayBuffer())));
 if(!parts.length)throw new Error('没有可识别的录音，请重新开始语音输入。');
 const length=parts.reduce((n,p)=>n+Math.max(0,p.length-44),0),data=new Uint8Array(44+length);
 data.set(parts[0].subarray(0,44));let offset=44;
 for(const p of parts){data.set(p.subarray(44),offset);offset+=p.length-44;}
 const view=new DataView(data.buffer);view.setUint32(4,36+length,true);view.setUint32(40,length,true);
 return new Blob([data],{type:'audio/wav'});
}
// Audio goes to our server; credentials and the provider connection stay there.
export class LiveRecognition extends ServerRecognition{
 constructor(){super();this.items=new Map();this.captureChunks=[];this.captureSamples=0;this.sendQueue=Promise.resolve();}
 async prepare({connect=false}={}){
  await super.prepare();if(connect&&!this.cancelled&&!this.started){this.warming=true;await this.ensureConnection();}
 }
 ensureConnection(){
  if(!this.connection)this.connection=this.connect().catch(error=>{this.connection=null;throw error;});
  return this.connection;
 }
 publish(){this.onresult?.({results:[...this.items.values()].map(value=>{const item=[{transcript:value.text}];item.isFinal=value.final;return item;})});}
 accept(event){
  if(this.cancelled||this.realtimeFailure)return;
  if(event.type==='transcript'){const prior=this.items.get(event.id);if(prior?.final&&!event.final)return;this.items.set(event.id,{text:event.text,final:event.final});this.publish();}
  else if(event.type==='done'){this.ended=true;this.resolveDone?.(true);this.publish();this.onend?.();}
  else if(event.type==='error')this.fail(event.message);
 }
 connect(){
  this.ended=false;this.donePromise=new Promise(resolve=>this.resolveDone=resolve);
  return new Promise((resolve,reject)=>{
   const socket=new WebSocket(realtimeSocketURL(globalThis.location));this.socket=socket;
   let ready=false;const timer=setTimeout(()=>{reject(new Error('实时识别连接超时'));this.fail('实时识别连接超时，请重试。');},15000);this.connectTimer=timer;
   socket.onmessage=e=>{if(this.socket!==socket||this.cancelled)return;let event;try{event=JSON.parse(e.data);}catch{return this.fail('实时识别返回格式异常。');}if(event.type==='ready'){clearTimeout(timer);ready=true;resolve();}else{if(event.type==='error'){clearTimeout(timer);reject(new Error(event.message));}this.accept(event);}};
   socket.onerror=()=>{clearTimeout(timer);reject(new Error('实时识别连接失败'));if(this.socket===socket&&!this.cancelled)this.fail('实时识别连接失败，录音已保留。');};
   socket.onclose=()=>{clearTimeout(timer);if(!ready)reject(new Error('实时识别连接已关闭'));if(this.socket===socket&&!this.cancelled&&!this.ended)this.fail('实时识别连接中断，录音已保留。');};
  });
 }
 async start(){
  this.started=true;this.warming=false;
  // Capture immediately while a cold connection opens. The queue retains the
  // first words and sends them only after the provider has acknowledged ready.
  try{await Promise.all([this.ensureConnection(),super.start()]);if(!this.audio||this.cancelled)this.socket?.close();}
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
  this.sendQueue=this.sendQueue.then(async()=>{const bytes=(await wav.arrayBuffer()).slice(44);if(this.cancelled||this.failure||this.realtimeFailure)return;await this.connection;if(this.cancelled||this.failure||this.realtimeFailure)return;if(this.socket?.readyState!==WebSocket.OPEN)throw new Error('实时识别连接中断');this.socket.send(bytes);}).catch(error=>this.fail(error.message));
 }
 async stop(){
  if(this.cancelled||this.stopPending)return;this.stopPending=true;this.finishing=true;
  if(!this.capture){this.abort();this.onend?.();return;}
  this.flush();super.release();await this.sendQueue;if(this.cancelled)return;
  if(this.realtimeFailure)return this.fallback();
  try{await this.connection;if(this.cancelled)return;this.socket.send(JSON.stringify({type:'finish'}));
   const timer=setTimeout(()=>this.fail('实时识别结束等待超时'),7000);
   await this.donePromise;clearTimeout(timer);if(!this.cancelled&&this.realtimeFailure)return this.fallback();
  }catch(error){if(!this.cancelled){this.fail(error.message);return this.fallback();}}
 }
 fail(message){
  if(this.warming&&!this.started){const socket=this.socket;this.socket=null;this.connection=null;socket?.close();return;}
  if(this.cancelled||this.realtimeFailure||this.ended)return;
  this.realtimeFailure=new Error(message);clearTimeout(this.connectTimer);this.resolveDone?.(false);
  const socket=this.socket;this.socket=null;socket?.close();
  this.onnotice?.(this.finishing?'正在自动切换备用识别，录音已保留。':'实时识别暂时中断，可以继续说；结束后会自动用备用识别整理文字。');
 }
 async fallback(){
  if(this.cancelled)return;
  if(this.fallbackPromise)return this.fallbackPromise;
  this.fallbackPromise=(async()=>{
   try{
    this.onnotice?.('正在使用备用识别整理完整录音，无需重说。');
    const blob=await joinRecording(this.saved);if(this.cancelled)return;
    const response=await fetch('/api/asr',{method:'POST',headers:{'Content-Type':'audio/wav','X-Tingjian-Request':'1'},body:blob,signal:AbortSignal.any([this.abortController.signal,AbortSignal.timeout(25000)])});
    const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||'备用识别暂时未完成');
    if(this.cancelled)return;
    // Replace the realtime hypothesis with one complete transcript, never append it.
    this.items.clear();this.items.set('fallback',{text:body.data.text||'',final:true});this.publish();this.ended=true;this.onend?.();
   }catch(error){if(!this.cancelled){this.failure=error;this.onerror?.({error:'network',message:'实时与备用识别暂时未完成，文字和录音已保留。',recordings:this.saved});}}
  })();return this.fallbackPromise;
 }
 async retry(){
  await this.sendQueue;
  this.cancelled=false;this.failure=null;this.ended=false;this.finishing=true;this.stopPending=true;this.abortController=new AbortController();this.fallbackPromise=null;
  return this.fallback();
 }
 abort(){super.abort();clearTimeout(this.connectTimer);this.resolveDone?.(false);this.socket?.close();}
}
