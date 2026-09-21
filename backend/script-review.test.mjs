import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,readFile,copyFile} from 'node:fs/promises';
const dataRoot=await mkdtemp(path.join(os.tmpdir(),'aimedia-script-review-'));
process.env.AIMEDIA_DATA_DIR=dataRoot;process.env.AIMEDIA_API_KEY='test-placeholder';
const service=await import('./service.mjs');
const {save,projectDir,publicProject}=await import('./store.mjs');
const {scriptReview,scriptHash}=await import('./script-review.mjs');
const {run,ffmpeg}=await import('./media.mjs');
const mediaDir=path.join(dataRoot,'fixtures');await mkdir(mediaDir,{recursive:true});
const source=path.join(mediaDir,'source.mp4'),voice=path.join(mediaDir,'voice.wav');
await run(ffmpeg,['-v','error','-f','lavfi','-i','color=c=0x233044:s=320x180:r=24:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',source]);
await run(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=880:duration=0.6','-y',voice]);
let sequence=0;
async function project({audio=false,live=false,empty=false}={}){
 const id='script-test-'+(++sequence),dir=projectDir(id);await mkdir(dir,{recursive:true});await copyFile(source,path.join(dir,'source.mp4'));await copyFile(voice,path.join(dir,'voice.wav'));
 const p={id,title:'制作脚本验证',source:path.join(dir,'source.mp4'),sourceInfo:{sha256:'fixture-source',filmId:'fixture'},duration:4,width:320,height:180,hasAudio:false,provenance:live?'live-ai':'sample-annotated',revision:1,fullReviewRev:0,originalVolume:1,narrationVolume:1,createdAt:new Date().toISOString(),scenes:[],versions:[],feedback:[],windows:[{start:0,end:4}],transcript:{text:'',segments:[]}};
 if(!empty)p.scenes=[{id:'s1',title:'海面',start:0,end:4,evidenceTime:0,evidence:'蓝色海面',facts:['蓝色海面'],text:'蓝色海面。',aiText:'蓝色海面。',category:'required',rev:1,textRev:1,reviewedRev:0,insertStart:1,insertEnd:2,uncertainty:'',...(audio?{audio:{file:path.join(dir,'voice.wav'),duration:.6,textRev:1}}:{})}];
 await save(p);return p;
}
async function mockFetch(handler,fn){const orig=globalThis.fetch;globalThis.fetch=handler;try{return await fn();}finally{globalThis.fetch=orig;}}
const wave=await readFile(voice);
const ttsResponse=()=>new Response(JSON.stringify({base_resp:{status_code:0},data:{audio:wave.toString('hex')}}));
test('analysis stops after draft, without speech or rendering; restart preserves the gate',async()=>{
 const p=await project({empty:true});let calls=0;
 await mockFetch(async(url,options)=>{const count=JSON.parse(options.body).messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(c=>c.type==='image_url').length;assert.match(url,/chat\/completions/);calls++;return new Response(JSON.stringify({choices:[{message:{tool_calls:[{type:'function',function:{name:'submit_scene_analysis',arguments:JSON.stringify({scenes:[{title:'海面',firstFrame:0,lastFrame:count-1,evidenceFrame:0,evidence:'蓝色海面',facts:['蓝色海面'],category:'required',text:'蓝色海面。',uncertainty:''}]})}}]}}]}));},async()=>{service.pipeline(p);await service.waitForJobs();});
 assert.equal(p.job.status,'done',p.job.message);assert.equal(p.job.stage,1);assert.equal(calls,1);assert.equal(p.scenes.length,1);assert.equal(p.versions.length,0);assert.ok(!p.scenes[0].audio);assert.equal(scriptReview(p).approved,false);
 const restored=JSON.parse(await readFile(path.join(projectDir(p.id),'project.json')));assert.throws(()=>service.pipeline(restored,{stage:'produce',revision:restored.revision}),/确认/);
});
test('existing drafts stop without any model calls; direct speech/render cannot bypass confirmation',async()=>{
 const p=await project();await mockFetch(async()=>{throw Error('Unexpected model call');},async()=>{service.pipeline(p);await service.waitForJobs();});assert.equal(p.job.stage,1);assert.equal(p.job.status,'done');assert.throws(()=>service.voiceScene(p,'s1'),/确认/);assert.throws(()=>service.renderPreview(p),/确认/);assert.throws(()=>service.pipeline(p,{stage:'produce',revision:1}),/确认/);
});
test('approval is idempotent, revision checked, and bound to current script content',async()=>{
 const p=await project();await assert.rejects(service.approveScript(p,0),/刷新/);await service.approveScript(p,1);const record=structuredClone(p.scriptApproval);await service.approveScript(p,1);assert.deepEqual(p.scriptApproval,record);assert.equal(scriptReview(p).approved,true);
 await service.editScene(p,'s1',{revision:1,text:'海面泛着光。'});assert.equal(scriptReview(p).approved,false);assert.equal(scriptReview(p).needsReconfirmation,true);assert.throws(()=>service.voiceScene(p,'s1'),/确认/);
});
test('unresolved facts prevent approval even before audio exists',async()=>{
 const p=await project();p.scenes[0].uncertainty='人物身份不明';await assert.rejects(service.approveScript(p,1),/核实/);assert.equal(p.scriptApproval,undefined);
});
test('confirmed production synthesizes exact approved words, preserves approval, and renders preview',async()=>{
 const p=await project({live:true});await service.approveScript(p,1);const hash=scriptHash(p);let calls=0;
 await mockFetch(async(url,options)=>{assert.match(url,/t2a_v2/);assert.equal(JSON.parse(options.body).text,'蓝色海面。');calls++;return ttsResponse();},async()=>{service.pipeline(p,{stage:'produce',revision:1});await service.waitForJobs();});
 assert.equal(p.job.status,'done',p.job.message);assert.equal(calls,1);assert.equal(scriptHash(p),hash);assert.equal(scriptReview(p).approved,true);assert.equal(p.versions.at(-1).kind,'preview');assert.equal(publicProject(p).preview.revision,p.revision);
 await mockFetch(async()=>{throw Error('Completed voice should be reused');},async()=>{service.pipeline(p,{stage:'produce',revision:p.revision});await service.waitForJobs();});assert.equal(p.job.status,'done');
});
test('overlong approved narration returns for editing without automatic rewriting',async()=>{
 const p=await project({audio:true,live:true});p.scenes[0].audio.duration=2;await save(p);await service.approveScript(p,1);const hash=scriptHash(p);
 await mockFetch(async()=>{throw Error('Must not rewrite approved script');},async()=>{service.pipeline(p,{stage:'produce',revision:1});await service.waitForJobs();});assert.equal(p.job.status,'done');assert.equal(p.job.stage,2);assert.equal(scriptHash(p),hash);assert.equal(p.versions.length,0);assert.ok(publicProject(p).problems.some(i=>i.type==='conflict'));
});
test('personal listening remains automatic and does not create script approval',async()=>{
 const p=await project();let calls=0;await mockFetch(async(url)=>{assert.match(url,/t2a_v2/);calls++;return ttsResponse();},async()=>{service.pipeline(p,{purpose:'listen'});await service.waitForJobs();});assert.equal(p.job.status,'done',p.job.message);assert.equal(calls,1);assert.equal(p.versions.at(-1).kind,'personal');assert.equal(p.scriptApproval,undefined);
});
test('processing rejects script edits, duplicate work, and confirmation; failures retry saved script',async()=>{
 const p=await project();await service.approveScript(p,1);
 await mockFetch(async()=>new Response('{}',{status:401}),async()=>{service.pipeline(p,{stage:'produce',revision:1});assert.throws(()=>service.pipeline(p,{stage:'produce',revision:1}),/正在处理/);await assert.rejects(service.editScene(p,'s1',{revision:1,text:'并发改稿'}),/等待/);await assert.rejects(service.approveScript(p,1),/等待/);await service.waitForJobs();});
 assert.equal(p.job.status,'failed');assert.equal(scriptReview(p).approved,true);assert.equal(p.scenes[0].text,'蓝色海面。');await mockFetch(async()=>ttsResponse(),async()=>{service.pipeline(p,{stage:'produce',revision:p.revision});await service.waitForJobs();});assert.equal(p.job.status,'done');assert.equal(p.versions.at(-1).kind,'preview');
});
test('mix changes keep script approval while timing changes invalidate it',async()=>{
 const p=await project();await service.approveScript(p,1);await service.mixSettings(p,{revision:1,duckLevel:.2});assert.equal(scriptReview(p).approved,true);await service.editScene(p,'s1',{revision:p.revision,insertStart:1.1});assert.equal(scriptReview(p).approved,false);
});

test('personal pipeline merges a dialogue-dense opening, preserves analysis, and records completed media checks',async()=>{
 const p=await project({live:true});const first=p.scenes[0];first.end=1;first.text='海。';first.aiText='海。';
 p.scenes.push({...structuredClone(first),id:'s2',start:1,end:4,title:'海面继续',text:'浪。',aiText:'浪。'});p.windows=[{start:1.2,end:4}];await save(p);
 await mockFetch(async()=>ttsResponse(),async()=>{service.pipeline(p,{purpose:'listen'});await service.waitForJobs();});
 assert.equal(p.job.status,'done',p.job.message);assert.equal(p.scenes.length,1);assert.equal(p.scenes[0].text,'海。浪。');assert.equal(p.narrationGrouping.original.length,2);assert.equal(p.narrationGrouping.merges.length,1);
 assert.equal(p.job.steps[2].status,'done');assert.equal(p.job.steps[3].status,'done');assert.equal(p.job.steps[4].status,'done');assert.equal(p.versions.at(-1).kind,'personal');
});

test('mixed audio retains headroom after AAC decoding even when the inputs drive the limiter',async()=>{
 const {mixVideo}=await import('./media.mjs');const p=await project({audio:true});
 const out=path.join(projectDir(p.id),'headroom.mp4'),pcm=path.join(projectDir(p.id),'headroom.f32');
 await mixVideo(p.source,p.scenes,out,{duration:4,hasAudio:true,originalVolume:8,narrationVolume:8,duckLevel:1});
 await run(ffmpeg,['-v','error','-i',out,'-vn','-f','f32le','-acodec','pcm_f32le','-y',pcm]);
 const data=await readFile(pcm);let peak=0;for(let i=0;i<data.length;i+=4)peak=Math.max(peak,Math.abs(data.readFloatLE(i)));
 assert.ok(peak<.98,`AAC decoded peak ${peak} lost its headroom`);
});
