import test from 'node:test';
import assert from 'node:assert/strict';
import {SpeechService} from '../public/speech-service.js';
import {VoiceInput} from '../public/assistant/voice-input.js';
import {ServerRecognition} from '../public/assistant/server-recognition.js';
import {LiveRecognition} from '../public/assistant/live-recognition.js';

test('prompt fetch bypasses a blocked film queue and shares a cancelled focus download',async t=>{
 let finish,calls=0;const service=new SpeechService();service.queue=new Promise(()=>{});
 t.mock.method(globalThis,'fetch',async()=>{calls++;await new Promise(r=>finish=r);return new Response(new Blob([new Uint8Array(80)],{type:'audio/wav'}));});
 const controller=new AbortController();const first=service.guide('创建新视频',controller.signal);const rejected=assert.rejects(first,{name:'AbortError'});
 const second=service.guide('创建新视频。');await new Promise(r=>setImmediate(r));assert.equal(calls,1);
 controller.abort();await rejected;finish();const url=await second;assert.match(url,/^blob:/);
 assert.equal(await service.guide('创建新视频'),url);assert.equal(calls,1);URL.revokeObjectURL(url);
});

test('background requests are bounded and a failed preload can be retried on demand',async t=>{
 let active=0,peak=0,calls=0;const service=new SpeechService();
 t.mock.method(globalThis,'fetch',async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;if(calls<=2)throw new Error('temporary');return new Response(new Blob([new Uint8Array(80)]));});
 service.warmGuides(['甲','乙','丙','甲']);while(service.warmActive||service.warmQueue.length)await new Promise(r=>setImmediate(r));
 assert.equal(peak,2);assert.equal(calls,3);const url=await service.guide('甲');assert.match(url,/^blob:/);assert.equal(calls,4);
 for(const value of service.cache.values())URL.revokeObjectURL(value);
});

test('preparing voice input never starts capture, start consumes preparation, disposal closes unused resources',()=>{
 let created=0,prepared=0,started=0,aborted=0;
 const voice=new VoiceInput({factory:()=>{created++;return {prepare:()=>prepared++,start:()=>started++,abort:()=>aborted++};}});
 try{voice.prepare();voice.prepare({connect:true});assert.equal(started,0);assert.equal(created,1);assert.equal(prepared,2);
  voice.start('');assert.equal(created,1);assert.equal(started,1);voice.cancel();voice.prepare();voice.discardPrepared();assert.equal(aborted,2);
 }finally{voice.cancel();voice.discardPrepared();}
});

test('audio worklet and service status prepare once without asking for microphone',async t=>{
 let contexts=0,modules=0,requests=0;
 t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json({data:{configured:true}});});
 class Audio{constructor(){contexts++;this.state='suspended';this.audioWorklet={addModule:async()=>modules++};}close(){return Promise.resolve();}}
 const prior=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Object.defineProperty(globalThis,'AudioContext',{value:Audio,configurable:true});
 try{const r=new ServerRecognition();await Promise.all([r.prepare(),r.prepare()]);assert.deepEqual([contexts,modules,requests],[1,1,1]);assert.equal(r.stream,undefined);r.abort();}
 finally{if(prior)Object.defineProperty(globalThis,'AudioContext',prior);else delete globalThis.AudioContext;}
});

test('cold realtime connection does not delay starting capture and queued audio waits for ready',async t=>{
 let ready,captured=false;const sent=[];const r=new LiveRecognition();
 r.connect=()=>new Promise(resolve=>ready=resolve);
 t.mock.method(ServerRecognition.prototype,'start',async function(){captured=true;this.audio={sampleRate:16000};});
 const prior=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');Object.defineProperty(globalThis,'WebSocket',{value:{OPEN:1},configurable:true});
 try{const start=r.start();assert.equal(captured,true);r.socket={readyState:1,send:bytes=>sent.push(bytes),close(){}};
  r.receive(new Float32Array(1600).fill(.1));await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.length,0);
  ready();await start;await r.sendQueue;assert.equal(sent.length,1);assert.equal(sent[0].byteLength,3200);assert.equal(r.saved.length,1);
 }finally{if(prior)Object.defineProperty(globalThis,'WebSocket',prior);else delete globalThis.WebSocket;}
});

test('stopping a warmed input before microphone permission releases preparation without sending to a connecting socket',async()=>{
 const r=new LiveRecognition();let closed=0,sent=0,ended=0;r.audio={close:()=>{closed++;return Promise.resolve();}};r.socket={close(){},send(){sent++;throw new Error('not ready');}};r.onend=()=>ended++;
 await r.stop();assert.equal(r.cancelled,true);assert.equal(closed,1);assert.equal(sent,0);assert.equal(ended,1);
});
