// Recognition-compatible adapter: actual ASR results feed the upstream composer.
// Silence boundaries trigger transcription without an extra user click.
export async function acquireMicrophone(mediaDevices=globalThis.navigator?.mediaDevices){
 if(!mediaDevices?.getUserMedia)throw new DOMException('当前浏览器无法使用麦克风，请使用 HTTPS 地址和新版 Chrome 或 Edge。','NotFoundError');
 try{return await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}
 catch(error){if(!['OverconstrainedError','NotReadableError','AbortError'].includes(error.name))throw error;return mediaDevices.getUserMedia({audio:true});}
}
export function pcmWav(chunks,sampleRate){
 const size=chunks.reduce((n,c)=>n+c.length,0),pcm=new Float32Array(size);let at=0;
 for(const chunk of chunks){pcm.set(chunk,at);at+=chunk.length;}
 const rate=16000,length=Math.floor(size*rate/sampleRate),bytes=new ArrayBuffer(44+length*2),v=new DataView(bytes);
 const tag=(at,text)=>{for(let i=0;i<text.length;i++)v.setUint8(at+i,text.charCodeAt(i));};
 tag(0,'RIFF');v.setUint32(4,36+length*2,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,length*2,true);
 for(let i=0;i<length;i++){const from=Math.floor(i*sampleRate/rate),to=Math.max(from+1,Math.floor((i+1)*sampleRate/rate));let sum=0;for(let j=from;j<to&&j<size;j++)sum+=pcm[j];v.setInt16(44+i*2,Math.max(-1,Math.min(1,sum/(to-from)))*32767,true);}
 return new Blob([bytes],{type:'audio/wav'});
}
export class ServerRecognition{
 constructor(){this.results=[];this.jobs=[];this.saved=[];this.cancelled=false;this.chunks=[];this.preRoll=[];this.samples=0;this.silent=0;this.voiced=false;this.failure=null;this.finishing=false;}
 prepare(){
  if(this.preparation)return this.preparation;
  this.abortController=new AbortController();
  this.preparation=(async()=>{
   const status=fetch('/api/asr/status',{signal:AbortSignal.any([this.abortController.signal,AbortSignal.timeout(5000)])}).then(r=>r.json()).then(s=>{if(!s.data?.configured)throw new Error('语音识别服务尚未配置，请联系维护者连接 ASR。');});
   const audio=(async()=>{this.audio=new AudioContext();if(this.audio.state==='running')await this.audio.suspend();await this.audio.audioWorklet.addModule('/assistant/pcm-capture.js');})();
   await Promise.all([status,audio]);if(this.cancelled)throw new DOMException('已取消','AbortError');
  })().catch(error=>{this.preparation=null;this.audio?.close().catch(()=>{});this.audio=null;throw error;});
  return this.preparation;
 }
 async start(){
  try{
   this.captureRequested=true;
   const microphone=acquireMicrophone().then(stream=>{
    if(this.cancelled||!this.captureRequested){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;
   });
   await Promise.all([this.prepare(),microphone]);
   if(this.cancelled){this.release();return;}
   this.input=this.audio.createMediaStreamSource(this.stream);this.capture=new AudioWorkletNode(this.audio,'tingjian-pcm');
   this.capture.port.onmessage=e=>this.receive(e.data);this.input.connect(this.capture);
   const mute=this.audio.createGain();mute.gain.value=0;this.capture.connect(mute);mute.connect(this.audio.destination);await this.audio.resume();
   if(this.finishing){this.stop();return;}this.onstart?.();
  }catch(e){if(!this.cancelled)this.onerror?.({error:e.name==='NotAllowedError'?'not-allowed':['NotFoundError','OverconstrainedError'].includes(e.name)?'audio-capture':e.name==='NotReadableError'?'device-busy':'network',message:e.message});this.release();}
 }
 receive(chunk){
  if(this.cancelled||this.finishing)return;
  const seconds=chunk.length/this.audio.sampleRate,rms=Math.sqrt(chunk.reduce((n,x)=>n+x*x,0)/chunk.length);
  if(!this.voiced){this.preRoll.push(chunk);if(this.preRoll.length>5)this.preRoll.shift();if(rms<.008)return;this.chunks=this.preRoll.splice(0);this.samples=this.chunks.reduce((n,c)=>n+c.length,0);this.voiced=true;}
  else{this.chunks.push(chunk);this.samples+=chunk.length;}
  this.silent=rms<.008?this.silent+seconds:0;
  if((this.silent>.65&&this.samples/this.audio.sampleRate>.5)||this.samples/this.audio.sampleRate>=12)this.flush();
 }
 flush(){
  if(!this.voiced||!this.chunks.length)return;
  const blob=pcmWav(this.chunks,this.audio.sampleRate),index=this.saved.length;this.saved.push(blob);this.results[index]=null;
  this.chunks=[];this.preRoll=[];this.samples=0;this.silent=0;this.voiced=false;
  this.jobs.push(this.recognize(blob,index));
 }
 async recognize(blob,index){
  const controller=this.abortController;
  try{
   const response=await fetch('/api/asr',{method:'POST',headers:{'Content-Type':'audio/wav','X-Tingjian-Request':'1'},body:blob,signal:controller.signal});
   const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||'语音识别未完成');
   if(this.cancelled||controller!==this.abortController)return;this.results[index]=body.data.text;this.emit();
  }catch(e){if(!this.cancelled&&controller===this.abortController){this.failure=e;if(!this.finishing)queueMicrotask(()=>this.stop());}}
 }
 emit(){
  // Publish only the contiguous recognized prefix so responses cannot reorder speech.
  const result=[];for(const text of this.results){if(text===null)break;const item=[{transcript:text}];item.isFinal=true;result.push(item);}
  this.onresult?.({results:result});
 }
 async stop(){
  if(this.cancelled||this.stopPending)return;this.stopPending=true;this.finishing=true;
  if(!this.audio){this.cancelled=true;this.abortController?.abort();this.release();this.onend?.();return;}
  this.flush();this.release();await Promise.allSettled(this.jobs);
  if(this.cancelled)return;
  if(this.failure){this.onerror?.({error:'network',message:this.failure.message,recordings:this.saved});return;}
  this.emit();
  this.onend?.();
 }
 async retry(){
  this.cancelled=false;this.failure=null;this.abortController=new AbortController();
  this.jobs=this.saved.map((blob,i)=>this.results[i]===null?this.recognize(blob,i):Promise.resolve());
  await Promise.allSettled(this.jobs);if(this.cancelled)return;this.emit();
  if(this.failure)this.onerror?.({error:'network',message:this.failure.message,recordings:this.saved});else this.onend?.();
 }
 abort(){this.cancelled=true;this.abortController?.abort();this.release();}
 release(){this.captureRequested=false;this.stream?.getTracks().forEach(t=>t.stop());this.input?.disconnect();this.capture?.disconnect();this.audio?.close().catch(()=>{});}
}
