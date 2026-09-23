import test from 'node:test';
import assert from 'node:assert/strict';
import {groundedSceneTitle} from '../backend/scene-titles.mjs';
import {VoiceInput} from '../public/assistant/voice-input.js';
import {acquireMicrophone,pcmWav} from '../public/assistant/server-recognition.js';
import {LiveRecognition,joinRecording} from '../public/assistant/live-recognition.js';
import {createMediaBackend} from '../public/assistant/media-backend.js';
import {defaultFilm} from '../public/catalog-config.js';
import {stageFilm,stageVideo} from '../public/stage-media.js';
import {makeContext,createSession,openDraft,applyInterpretation,compileDraft,beginRun,finishRun,acceptCandidate} from '../public/assistant/model.js';

test('scene titles do not infer parent-child relationships from appearance or unrelated dialogue',()=>{
 const s={title:'父子骑电动车',start:4,end:12};
 assert.equal(groundedSceneTitle(s,{text:''}),'两人骑电动车');
 assert.equal(groundedSceneTitle(s,{segments:[{start:20,end:25,text:'父子俩'}]}),'两人骑电动车');
 assert.equal(groundedSceneTitle(s,{segments:[{start:5,end:6,text:'我们父子俩'}]}),'父子骑电动车');
 assert.equal(groundedSceneTitle({...s,title:'女孩指向前方'}),'女孩指向前方');
 assert.equal(s.title,'父子骑电动车');
});

test('microphone constraints retry once but denied permission is never re-requested',async()=>{
 const calls=[],stream={};const devices={async getUserMedia(options){calls.push(options);if(calls.length===1)throw new DOMException('busy','NotReadableError');return stream;}};
 assert.equal(await acquireMicrophone(devices),stream);assert.deepEqual(calls[1],{audio:true});
 let denied=0;await assert.rejects(acquireMicrophone({async getUserMedia(){denied++;throw new DOMException('Permission denied','NotAllowedError');}}));assert.equal(denied,1);
});

test('raw permission errors use Chinese guidance and preserve the existing input',()=>{
 let message='',text='';const r={start(){this.onerror({error:'not-allowed',message:'Permission denied'});},abort(){}};
 const voice=new VoiceInput({factory:()=>r,onState:(_,m)=>message=m,onText:t=>text=t});voice.start('已有修改');
 assert.match(message,/麦克风权限/);assert.doesNotMatch(message,/Permission denied/);assert.equal(text,'已有修改');assert.equal(voice.active,false);
});

test('realtime fallback sends the complete recording once and replaces partial words without duplication',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);let requests=0,received=0,text='',sent=0;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/asr');requests++;received=(await options.body.arrayBuffer()).byteLength;return {ok:true,json:async()=>({ok:true,data:{text:'旁白慢一点'}})};};
 const r=new LiveRecognition();r.abortController=new AbortController();r.start=()=>r.onstart();r.capture={disconnect(){}};
 r.saved=[pcmWav([new Float32Array(1600).fill(.2)],16000),pcmWav([new Float32Array(1600).fill(.1)],16000)];
 const v=new VoiceInput({factory:()=>r,onText:value=>text=value,onSubmit:()=>sent++});v.start('原有要求');
 r.accept({type:'transcript',id:'one',text:'旁白',final:false});r.fail('offline');assert.equal(v.state,'listening');
 v.finish(true);await r.fallbackPromise;
 // stop() first drains its microtask queue before it starts the fallback.
 if(!r.fallbackPromise)await new Promise(resolve=>setImmediate(resolve));await r.fallbackPromise;
 assert.equal(requests,1);assert.equal(received,44+6400);assert.equal(text,'原有要求\n旁白慢一点');assert.equal(sent,1);assert.equal(v.state,'idle');
});

test('failed backup recognition retains the same recording for retry and never sends',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async()=>{throw new Error('offline');};
 const r=new LiveRecognition();r.abortController=new AbortController();r.start=()=>r.onstart();r.saved=[pcmWav([new Float32Array(3200)],16000)];let sends=0;
 const v=new VoiceInput({factory:()=>r,onSubmit:()=>sends++});v.start('保留文字');r.fail('offline');await r.fallback();
 assert.equal(v.state,'error');assert.equal(v.retrySession.recognition,r);assert.equal(r.saved.length,1);assert.equal(sends,0);
 globalThis.fetch=async()=>({ok:true,json:async()=>({ok:true,data:{text:'重新识别成功'}})});
 v.start();await new Promise(resolve=>setImmediate(resolve));await r.fallbackPromise;assert.equal(v.state,'idle');assert.equal(sends,0);
});

test('joined recording preserves WAV duration and PCM bytes',async()=>{
 const chunks=[pcmWav([new Float32Array(1600).fill(.2)],16000),pcmWav([new Float32Array(3200).fill(-.2)],16000)];
 const buffer=await(await joinRecording(chunks)).arrayBuffer(),view=new DataView(buffer);
 assert.equal(view.getUint32(40,true),9600);assert.equal(view.getInt16(44,true),6553);assert.equal(view.getInt16(3244,true),-6553);
});

test('unsupported changes complete on existing media in every stage without overwriting accepted media',async t=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;t.after(()=>{globalThis.window=oldWindow;globalThis.document=oldDocument;});globalThis.window={};
 for(const phase of ['short','medium','watch','s2','full']){
  const owner={id:'retain-'+phase,stage:phase==='s2'?'medium':phase,mediaScene:phase==='s2'?'s2':undefined,mediaExtended:phase==='full'};
  const film=stageFilm(defaultFilm,owner);globalThis.document={createElement(){return {duration:film.duration,removeAttribute(){},load(){},set src(v){queueMicrotask(()=>this.onloadedmetadata?.());}};}};
  const store={},service=createMediaBackend({run(){assert.fail('no synthesis');}},{store,save(){},interpret:async()=>({kind:'patch',patches:[{field:'speech_rate',value:.85}]})});
  const scene=film.scenes[0],ctx=makeContext(film,scene.id,scene.start,owner.id),session=createSession(owner.id,film),draft=openDraft(session,ctx),a={origin:{film,phase:owner.stage,taskId:owner.id},session,draft};
  applyInterpretation(draft,await service.parse('旁白慢一点',ctx,draft,a),ctx);const plan=service.plan(compileDraft(session,draft,ctx),a);assert.equal(plan.valid,true);assert.equal(plan.mediaUnchanged,true);
  const original=stageVideo(film,owner,store),result=await service.run(beginRun(draft,plan),a);assert.equal(result.candidates[0].videoUrl,original);assert.equal(result.candidates[0].audioGenerated,false);
  assert(finishRun(session,draft,result));await service.accept(a,scene.id);acceptCandidate(session,scene.id);assert.equal(stageVideo(film,owner,store),original);
 }
});
