import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceInput} from '../public/assistant/voice-input.js';
import {assistantKeyAction} from '../public/assistant/speech-policy.js';
import {pcmWav} from '../public/assistant/server-recognition.js';
import {sampleRange,newWorkflow} from '../backend/workflow-state.mjs';

test('O works in an empty composer without stealing typed text or Chinese composition',()=>{
 assert.equal(assistantKeyAction({key:'o',code:'KeyO'},{editable:true,inputFocused:true,inputEmpty:true}),'voice');
 assert.equal(assistantKeyAction({key:'o',code:'KeyO'},{editable:true,inputFocused:true,inputEmpty:false}),null);
 assert.equal(assistantKeyAction({key:'o',code:'KeyO',isComposing:true},{editable:true,inputFocused:true,inputEmpty:true}),null);
 assert.equal(assistantKeyAction({key:'o',code:'KeyO'},{editable:true,recording:true}),'finish');
});
test('failed ASR retains audio for retry, replaces the recognized prefix, and never sends on failure',()=>{
 let made=0,sent=0,retried=0,words='';
 const recognizer={start(){this.onstart();},abort(){},retry(){retried++;const result=[{transcript:'旁白慢一点'}];result.isFinal=true;this.onresult({results:[result]});this.onend();}};
 const voice=new VoiceInput({factory:()=>{made++;return recognizer;},onText:text=>words=text,onSubmit:()=>sent++});
 voice.start('原有要求');recognizer.onerror({error:'network',message:'测试失败',recordings:[new Blob(['saved'])]});
 assert.equal(voice.state,'error');assert.equal(sent,0);assert(voice.retrySession);
 voice.start(words);assert.equal(made,1);assert.equal(retried,1);assert.equal(words,'原有要求\n旁白慢一点');assert.equal(sent,0);
});
test('PCM capture produces valid 16 kHz mono WAV without repeating or dropping duration',async()=>{
 const file=pcmWav([new Float32Array(4800).fill(.2),new Float32Array(4800).fill(-.2)],48000);
 const bytes=await file.arrayBuffer(),view=new DataView(bytes);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(40,true),6400);assert.equal(bytes.byteLength,6444);
});
test('uploaded scene flow follows full scene boundaries instead of old 7/45 second samples',()=>{
 const p={duration:42,scenes:[{start:0,end:4},{start:4,end:18},{start:18,end:25},{start:25,end:42}],workflow:{...newWorkflow(),sceneFlow:true,sceneCount:3}};
 assert.deepEqual(sampleRange(p,'short'),{start:0,end:4});assert.deepEqual(sampleRange(p,'medium'),{start:0,end:25});assert.deepEqual(sampleRange(p,'full'),{start:0,end:42});
});


test('uploaded review reuses the source scene, timing and evidence instead of reanalyzing a fragment',async()=>{
 const {reuseSceneAnalysis}=await import('../backend/workflow-scenes.mjs');
 const parent={id:'p',hasAudio:true,provenance:'live-ai',scenes:[{id:'s2',start:4,end:8,insertStart:5,insertEnd:7,evidenceTime:5,text:'骑车',facts:['骑车'],audio:{file:'prior.wav'}}],windows:[{start:5,end:7}],transcript:{alignmentVersion:2,segments:[{start:4,end:5,text:'原声'}]},analysisFrames:[{time:5,file:'evidence.jpg'}],aiRun:{model:'actual-model'}};
 const child={};reuseSceneAnalysis(parent,child,4,8);
 assert.equal(child.scenes.length,1);assert.equal(child.scenes[0].id,'s2');assert.equal(child.scenes[0].end,4);assert.equal(child.scenes[0].audio,null);assert.deepEqual(child.windows,[{start:1,end:3}]);assert.equal(child.analysisFrames[0].file,'evidence.jpg');assert.equal(child.aiRun.reusedFrom,'p');assert.equal(parent.scenes[0].audio.file,'prior.wav');
});
