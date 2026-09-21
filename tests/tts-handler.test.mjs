import test from 'node:test';import assert from 'node:assert/strict';
import {handleTTS,validateInput} from '../server/worker.mjs';
import film from '../public/assets/film.json' with {type:'json'};
import {sceneRange} from '../public/scene-plan.js';
const request=(body,extra={})=>new Request('https://demo.test/api/tts',{method:'POST',headers:{'Content-Type':'application/json','X-Tingjian-Request':'1',...extra},body:JSON.stringify(body)});
test('rejects unsupported media ranges and excessive arbitrary text',()=>{assert.throws(()=>validateInput({kind:'guide',text:'x'.repeat(401)}));assert.throws(()=>validateInput({kind:'narration',start:0,duration:999,speed:'normal',density:'balanced'}));});
test('does not open provider connections for cross-origin requests',async()=>{let opened=false;const r=await handleTTS(request({kind:'guide',text:'你好'},{Origin:'https://other.test'}),{},async()=>{opened=true;});assert.equal(r.status,403);assert.equal(opened,false);});
test('returns playable WAV and closes the upstream session',async()=>{let closed=false;const r=await handleTTS(request({kind:'guide',text:'你好'}),{},async()=>({synthesize:async()=>new Uint8Array(48000),close:()=>closed=true}));assert.equal(r.status,200);const audio=new Uint8Array(await r.arrayBuffer());assert.equal(new TextDecoder().decode(audio.slice(0,4)),'RIFF');assert.equal(audio.length,48044);assert(closed);});
test('refuses narration which would overlap the original dialogue',async()=>{let closed=false;const r=await handleTTS(request({kind:'narration',filmId:film.id,...sceneRange(film,1),speed:'slow',density:'balanced'}),{},async()=>({synthesize:async()=>new Uint8Array(48000*8),close:()=>closed=true}));assert.equal(r.status,422);assert.equal((await r.json()).code,'timing_overflow');assert(closed);});
test('rejects stale narration requests from a different movie',()=>{assert.throws(()=>validateInput({kind:'narration',filmId:'previous-movie',...sceneRange(film,1),speed:'normal',density:'balanced'}));});
test('API accepts complete scene prefixes and rejects former timed clips or an obsolete plan',()=>{
 const base={kind:'narration',filmId:film.id,speed:'normal',density:'balanced'};
 for(const count of [1,3,4,film.scenes.length])assert.doesNotThrow(()=>validateInput({...base,...sceneRange(film,count)}));
 for(const duration of [7,45])assert.throws(()=>validateInput({...base,start:0,duration}));
 assert.throws(()=>validateInput({...base,...sceneRange(film,3),scenePlanVersion:'old-plan'}));
});
test('does not reflect upstream secrets or internal errors',async()=>{const r=await handleTTS(request({kind:'guide',text:'你好'}),{},async()=>{throw new Error('sensitive-key-that-must-not-escape');});assert.equal(r.status,502);assert(!(await r.text()).includes('sensitive-key'));});
