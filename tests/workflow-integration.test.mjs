import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,readFile,copyFile} from 'node:fs/promises';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-workflow-'));
process.env.AIMEDIA_API_KEY='test-placeholder';
delete process.env.TINGJIAN_TTS_PROVIDER;
const {run,ffmpeg,probe}=await import('../backend/media.mjs');
const {registerUpload}=await import('../backend/service.mjs');
const {projects,projectDir,save,initializeStore}=await import('../backend/store.mjs');
const {startWorkflow,workflowAction,activeWorkflows,projectView,transcribeRecording}=await import('../backend/workflow.mjs');
const fixture=path.join(process.env.AIMEDIA_DATA_DIR,'fixture.mp4'),voice=path.join(process.env.AIMEDIA_DATA_DIR,'voice.wav');
await run(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=8:d=80','-c:v','libx264','-pix_fmt','yuv420p','-y',fixture]);
await run(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=650:duration=1','-y',voice]);
const wave=await readFile(voice),requests=[];
const original=globalThis.fetch;
const mocked=async(url,opt)=>{
  if(url.endsWith('/speech_to_text'))return new Response(JSON.stringify({text:'旁白慢一点',segments:[]}));
  const b=JSON.parse(opt.body);requests.push(b);
  if(url.endsWith('/t2a_v2'))return new Response(JSON.stringify({data:{audio:wave.toString('hex')}}));
  const name=b.tools[0].function.name;
  if(name==='submit_roles')return envelope(name,{roles:[{name:'测试人物',detail:'受控模型结果，仅用于测试。',frame:0}]});
  const count=b.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(c=>c.type==='image_url').length;
  const n=count>12?3:1,scenes=[];
  for(let i=0;i<n;i++)scenes.push({title:'受控画面',firstFrame:Math.floor(i*count/n),lastFrame:Math.floor((i+1)*count/n)-1,evidenceFrame:Math.floor(i*count/n),evidence:'蓝色测试画面',facts:['蓝色画面'],category:'required',text:'蓝色画面。',uncertainty:''});
  return envelope(name,{scenes});
};
function envelope(name,value){return new Response(JSON.stringify({choices:[{message:{tool_calls:[{type:'function',function:{name,arguments:JSON.stringify(value)}}]}}]}));}
async function wait(p,status='review'){const start=Date.now();while(activeWorkflows()){if(Date.now()-start>90000)throw new Error('Timed out');await new Promise(r=>setTimeout(r,80));}assert.equal(p.workflow.status,status,p.workflow.message);}
async function make(id){await mkdir(projectDir(id),{recursive:true});const source=path.join(projectDir(id),'source.mp4');await copyFile(fixture,source);return registerUpload(id,'用户视频.mp4',source,{guided:true});}
test('real media with mocked model: roles, version gates, rework, full duration, save, persisted resume and private paths',async()=>{
  globalThis.fetch=mocked;
  try{
    const p=await make('test-flow');await startWorkflow(p);await wait(p);assert.equal(p.workflow.stage,'roles');
    const act=(action,extra={})=>workflowAction(p,{action,revision:p.workflow.revision,requestId:crypto.randomUUID(),versionId:p.workflow.current?.id,...extra});
    await act('accept');await wait(p);assert.equal(p.workflow.stage,'short');assert.equal(p.workflow.current.result.duration,7);
    const firstVersion=p.workflow.current.id;await act('feedback',{text:'旁白慢一点'});await wait(p);
    assert.equal(p.workflow.confirmed,null);assert.equal(p.workflow.current.settings.speed,.8);
    await assert.rejects(()=>act('accept',{versionId:firstVersion}),/当前已生成/);
    const duplicate={action:'accept',revision:p.workflow.revision,requestId:'duplicate',versionId:p.workflow.current.id};
    await Promise.all([workflowAction(p,duplicate),workflowAction(p,duplicate)]);await wait(p);
    assert.equal(p.workflow.stage,'medium');assert.equal(p.workflow.current.result.duration,45);assert.equal(p.workflow.confirmed.speed,.8);
    await act('feedback',{text:'描述少一点'});await wait(p);assert.equal(p.workflow.confirmed.density,'balanced');
    await act('accept');await wait(p);assert.equal(p.workflow.stage,'verify');assert.notEqual(p.workflow.current.start,p.workflow.ranges.short.start);
    await act('accept');
    const started=Date.now();while(p.workflow.current.parts.length<1&&activeWorkflows()){if(Date.now()-started>30000)throw new Error('First full chunk timed out');await new Promise(r=>setTimeout(r,20));}
    const checkpoint=structuredClone(p.workflow.current.parts[0]);await act('pause');await wait(p,'paused');
    await act('retry');await wait(p,'complete');assert.deepEqual(p.workflow.current.parts[0],checkpoint);assert.equal(p.workflow.stage,'full');
    assert.equal(p.workflow.current.result.duration,80);assert.equal(p.workflow.current.parts[0].start,0);assert.equal(p.workflow.current.parts.at(-1).end,80);
    for(let i=1;i<p.workflow.current.parts.length;i++)assert.equal(p.workflow.current.parts[i].start,p.workflow.current.parts[i-1].end);
    const sourceBefore=await readFile(p.source);await act('save');assert.equal(p.workflow.saved,true);assert.deepEqual(await readFile(p.source),sourceBefore);
    await act('position',{position:21});await initializeStore();assert.equal(projects.get(p.id).workflow.position,21);
    const json=JSON.stringify(projectView(p));assert.ok(!json.includes(process.env.AIMEDIA_DATA_DIR.replaceAll('\\','\\\\')));assert.ok(!json.includes('evidenceFile'));assert.ok(!json.includes('"file":'));
    assert.ok(requests.some(b=>b.voice_setting?.speed===.8));
  }finally{globalThis.fetch=original;}
});
test('failed speech recognition retains recording for retry without rerecording',async()=>{
  globalThis.fetch=mocked;
  try{
    const p=await make('voice-flow');await startWorkflow(p);await wait(p);
    await workflowAction(p,{action:'accept',revision:p.workflow.revision,requestId:'start-short'});await wait(p);
    globalThis.fetch=async()=>new Response('',{status:401});let id;
    await assert.rejects(()=>transcribeRecording(p,wave),e=>{id=e.recordingId;return !!id;});
    assert.equal(p.workflow.recording.status,'error');assert.ok((await readFile(path.join(projectDir(p.id),`feedback-${id}.webm`))).length);
    globalThis.fetch=mocked;const result=await transcribeRecording(p,null,id);assert.equal(result.text,'旁白慢一点');
    p.workflow.status='generating';await save(p);await initializeStore();assert.equal(projects.get(p.id).workflow.status,'interrupted');
  }finally{globalThis.fetch=original;}
});
