import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {UISpeechCache} from '../server/ui-speech.mjs';
import {UI_PROMPTS} from '../public/ui-speech.js';

test('Doubao prompt is synthesized once across simultaneous requests and service restarts',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tingjian-speech-'));let calls=0,closes=0;
 const connector=async()=>({synthesize:async()=>{calls++;await new Promise(r=>setTimeout(r,20));return new Uint8Array(4800);},close:()=>closes++});
 try{
  const cache=new UISpeechCache(dir,{env:{VOLC_TTS_KEY:'test-only'},connector});
  const results=await Promise.all([cache.get('创建新视频','vivi'),cache.get(' 创建新视频。 ','vivi')]);
  assert.equal(calls,1);assert.equal(closes,1);assert.deepEqual(results[0].bytes,results[1].bytes);
  const restarted=new UISpeechCache(dir,{env:{},connector:()=>{throw new Error('must reuse file');}});
  assert.equal((await restarted.get('创建新视频','vivi')).cached,true);
  assert.equal((await restarted.status()).ready,1);
  assert.equal(await restarted.read('创建新视频','xiaohe'),null);
  await cache.get('创建新视频','xiaohe');assert.equal(calls,2);
  assert.equal((await readdir(dir)).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Incomplete speech is never cached and a failed batch can be resumed',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tingjian-speech-'));let fail=true,calls=0;
 const cache=new UISpeechCache(dir,{env:{VOLC_TTS_KEY:'test-only'},connector:async()=>({synthesize:async()=>{calls++;if(fail)throw new Error('provider failed');return new Uint8Array(4800);},close(){}})});
 try{
  const first=cache.prepare();assert.equal(first,cache.prepare());await first.done;
  assert.equal((await cache.status()).state,'error');assert.equal((await readdir(dir)).length,0);
  fail=false;await cache.prepare().done;assert.equal((await cache.status()).ready,UI_PROMPTS.length);
  const before=calls;await cache.prepare().done;assert.equal(calls,before);
  await assert.rejects(()=>cache.get('hello','unknown'),/音色/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Cache identity separates provider configuration; no browser mechanical speech fallback remains',async()=>{
 const a=new UISpeechCache('unused',{env:{VOLC_TTS_RESOURCE_ID:'first'}}),b=new UISpeechCache('unused',{env:{VOLC_TTS_RESOURCE_ID:'second'}});
 assert.notEqual(a.input('播放').key,b.input('播放').key);
 for(const file of ['public/focus-reader.js','public/experience.js'])assert.doesNotMatch(await readFile(file,'utf8'),/SpeechSynthesisUtterance|speechSynthesis\.speak/);
});
