import test from 'node:test';import assert from 'node:assert/strict';
import {newTask,confirmStage,changeNarrationVoice,canComplete} from '../public/flow.js';
import {mergePublicLibrary,visibleLibrary,isListedVideo} from '../public/library.js';
import {validateInput,handleTTS} from '../server/worker.mjs';
import {sceneFilm} from './fixtures/scene-film.mjs';
test('withdrawn QA entries stay hidden even under saved aliases while new uploads remain visible',()=>{
 const id='954ddbca-fa85-405d-9b97-6e3e0778a626';
 for(const item of [{id},{id:'uploaded-'+id},{assetId:'upload-'+id},{sourceProjectId:id}])assert.equal(isListedVideo(item),false);
 const items=[{id:'regular',title:'创业之路'},{id:'uploaded-'+id,title:'旧设备保存的测试别名'},{id:'new-upload',title:'我的新视频'}];
 assert.deepEqual(visibleLibrary(items,{all:true}).map(x=>x.id),['regular','new-upload']);
 assert.deepEqual(visibleLibrary(items,{all:true,query:'测试别名'}),[]);
});
test('changing a voice requires confirming the current scene batch again',()=>{const task=newTask(sceneFilm);confirmStage(task);confirmStage(task);changeNarrationVoice(task,'yunzhou');assert.equal(task.confirmedSceneCount,0);assert.equal(task.confirmed.voice,'vivi');assert.equal(canComplete(task),false);assert.equal(confirmStage(task),'full');assert(canComplete(task));assert.equal(task.confirmed.voice,'yunzhou');assert.equal(task.confirmedSceneCount,3);});
test('unsupported speakers cannot reach the synthesis service',()=>{assert.throws(()=>validateInput({kind:'guide',text:'你好',voice:'arbitrary-cloned-voice'}));});
test('selected voice is passed to synthesis and reflected in response',async()=>{let used;const r=await handleTTS(new Request('https://demo.test/api/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Tingjian-Request':'1'},body:JSON.stringify({kind:'guide',text:'你好',voice:'xiaohe'})}),{},async()=>({synthesize:async(_,__,voice)=>{used=voice;return new Uint8Array(48000);},close(){}}));assert.equal(r.status,200);assert.equal(used,'xiaohe');assert.equal(r.headers.get('X-TTS-Voice'),'xiaohe');});
test('two published films retain independent names, durations and progress',()=>{const catalog=[{id:'a',title:'第一部',duration:184},{id:'b',title:'第二部',duration:240}];const saved=[{id:'a-original',assetId:'a',title:'旧标题',position:42,settings:{voice:'yunzhou'}}];const merged=mergePublicLibrary(catalog,saved);assert.equal(merged.length,2);assert.equal(merged.find(x=>x.assetId==='a').position,42);assert.equal(merged.find(x=>x.assetId==='a').title,'第一部');assert.equal(merged[0].duration,240);assert.equal(merged[0].assetId,'b');assert.equal(mergePublicLibrary(catalog,merged).length,2);});
test('home is a stable six-card batch and all videos remain searchable',()=>{const items=Array.from({length:9},(_,i)=>({title:'影片'+i}));assert.equal(visibleLibrary(items).length,6);assert.equal(visibleLibrary(items,{all:true}).length,9);assert.deepEqual(visibleLibrary(items,{query:'影片8',all:true}),[items[8]]);});
