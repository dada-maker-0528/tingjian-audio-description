import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-assistant-'));
process.env.AIMEDIA_API_KEY='test-placeholder';process.env.TINGJIAN_TTS_PROVIDER='minimax';
const {run,ffmpeg}=await import('../backend/media.mjs');
const {projectDir,save,assetUrl}=await import('../backend/store.mjs');
const {newWorkflow,preferences}=await import('../backend/workflow-state.mjs');
const {assistantContext,assistantVoice,beginAssistantRun,assistantJob,acceptAssistant,readAssistantText}=await import('../backend/assistant.mjs');
const {applyAcceptedAssistantAudio}=await import('../backend/assistant-audio.mjs');
const {assistantSpeech}=await import('../backend/assistant-speech.mjs');
const {FIELDS}=await import('../public/assistant/schema.js');
const {makeContext,createSession,openDraft,editDraft,compileDraft,parseRequest}=await import('../public/assistant/model.js');
const dir=projectDir('integration');await mkdir(dir,{recursive:true});
const source=path.join(dir,'source.mp4'),base=path.join(dir,'base.wav'),voice=path.join(dir,'voice.wav');
await run(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=4:d=6','-c:v','libx264','-pix_fmt','yuv420p','-y',source]);
await run(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=6:sample_rate=24000','-y',base]);
await run(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=660:duration=0.4:sample_rate=24000','-y',voice]);
const p={id:'integration',title:'自动化测试素材',duration:6,source,scenes:[{id:'first',title:'第一段',start:0,end:3,facts:['蓝色画面']},{id:'second',title:'第二段',start:3,end:6,facts:['蓝色画面']}],workflow:{...newWorkflow(),status:'complete',stage:'full',roles:[{id:'p1',name:'测试人物',detail:'测试外观'}],current:{id:'original',start:0,end:6,settings:preferences(),settingsVersion:1,parts:[],result:{narrationUrl:assetUrl({id:'integration'},base),cues:[{start:.2,end:1.2,maxDuration:2,text:'蓝色画面。'},{start:3.2,end:4.2,maxDuration:2,text:'蓝色画面。'}]}}}};await save(p);
const speechBytes=await readFile(voice),requests=[],originalFetch=globalThis.fetch;
const envelope=(name,value)=>new Response(JSON.stringify({choices:[{message:{tool_calls:[{type:'function',function:{name,arguments:JSON.stringify(value)}}]}}]}));
globalThis.fetch=async(url,options)=>{if(options.body instanceof FormData)return new Response(JSON.stringify({text:'旁白慢一点',segments:[]}));const b=JSON.parse(options.body);requests.push(b);if(url.endsWith('/t2a_v2'))return new Response(JSON.stringify({data:{audio:speechBytes.toString('hex')}}));const name=b.tools[0].function.name;if(name==='submit_assistant_observations')return envelope(name,{facts:[{frame:0,text:'蓝色画面'}],texts:[{frame:0,category:'信件纸条',carrier:'纸条',text:'测试文字。'},{frame:0,category:'对白字幕',carrier:'字幕',text:'重复对白。'}],limitations:'测试模型返回，非真实识别'});return envelope(name,{text:'蓝色。',reason:'测试改写'});};
const start=patches=>beginAssistantRun({source:{projectId:p.id},sourceVersion:p.workflow.current.id,requestId:crypto.randomUUID(),sceneId:'first',scope:'current',targetIds:['first'],patches});
async function complete(job){const until=Date.now()+30000;while(job.status==='running'){assert.ok(Date.now()<until,'job timeout');await new Promise(r=>setTimeout(r,40));job=assistantJob(job.projectId,job.id);}assert.equal(job.status,'complete',job.message);return job;}
test('all 29 fields and each selectable value compile with semantic scope; no permanently unavailable field',()=>{
 assert.equal(FIELDS.length,29);const data=assistantContext({projectId:p.id}),ctx=makeContext(data.film,'first',0,p.id);let checked=0;
 for(const f of FIELDS){assert.ok(!f.unavailable,f.key);const options=f.type==='alias'?[{value:'小蓝'}]:f.options;
  for(const option of options){const session=createSession(p.id,data.film,data.settings),d=openDraft(session,ctx);const patch={field:f.key,value:f.type==='set'?[option.value]:option.value,...(f.type==='alias'||f.key==='naming_mode'&&option.value==='用户别名'?{targetCharacterId:'p1'}:{})};const patches=patch.targetCharacterId&&f.key==='naming_mode'?[{field:'character_alias',targetCharacterId:'p1',value:'小蓝'},patch]:[patch];editDraft(d,patches,ctx);const plan=compileDraft(session,d,ctx);assert.ok(plan.valid||plan.errors.every(e=>e.includes('无需重新生成')),f.key+':'+plan.errors);if(plan.valid)assert.ok(plan.fullPrompt.includes(f.key));checked++;}
 }
 assert.ok(checked>70);const d=openDraft(createSession(p.id,data.film,data.settings),ctx);assert.equal(parseRequest('动作不用讲得太细',ctx,d).patches.find(x=>x.field==='action_detail').value,'结果');
});
test('real audio gain changes only chosen range; acceptance is idempotent, keeps original, rejects stale writes',async()=>{
 const job=await complete(await start([{field:'narration_gain_db',value:3}]));assert.equal(p.workflow.current.id,'original');assert.equal(job.candidates.length,1);
 const accepted=await acceptAssistant(p.id,{jobId:job.id,sceneId:'first'});assert.equal(p.workflow.history[0].id,'original');assert.deepEqual(await acceptAssistant(p.id,{jobId:job.id,sceneId:'first'}),{sourceVersion:accepted.sourceVersion,projectId:p.id});assert.equal(p.workflow.history.length,1);
 const revised=path.join(dir,decodeURIComponent(p.workflow.current.result.narrationUrl.split('/').at(-1)));
 for(const [file,name] of [[base,'before'],[revised,'after']])await run(ffmpeg,['-v','error','-i',file,'-ss','3','-f','s16le','-y',path.join(dir,name+'.pcm')]);
 const before=await readFile(path.join(dir,'before.pcm')),after=await readFile(path.join(dir,'after.pcm'));assert.equal(before.length,after.length);let delta=0;for(let i=0;i<before.length;i+=2)delta=Math.max(delta,Math.abs(before.readInt16LE(i)-after.readInt16LE(i)));assert.ok(delta<=1,'unselected PCM difference: '+delta);
 await assert.rejects(()=>beginAssistantRun({source:{projectId:p.id},sourceVersion:'original',requestId:crypto.randomUUID(),sceneId:'first',patches:[{field:'narration_gain_db',value:-3}]}),/版本已变化/);
 const future={id:'future',start:0,end:6,settings:preferences(),result:{narrationUrl:assetUrl(p,base),cues:[]}};await applyAcceptedAssistantAudio(p,future);assert.deepEqual(future.assistantOverrides,[job.candidates[0].id]);
});
test('content uses visual evidence; voice and pause yield real wave files; text reading respects preferences',async()=>{
 const job=await complete(await start([{field:'action_detail',value:'细节'},{field:'delivery',value:'温和'},{field:'sentence_pause',value:350}]));assert.equal(job.candidates[0].audioGenerated,true);assert.equal(job.candidates[0].audioProcessing[0].delivery,'温和');assert.ok(requests.some(b=>b.tools?.[0]?.function.name==='submit_assistant_observations'));
 const a=await assistantSpeech('第一句。第二句。',path.join(dir,'short-pause.wav'),undefined,{speed:1,sentencePause:120});const b=await assistantSpeech('第一句。第二句。',path.join(dir,'long-pause.wav'),undefined,{speed:1,sentencePause:350});assert.ok(Math.abs(b.duration-a.duration-.23)<.02);
 const versionBeforeReading=p.workflow.current.id;const common={source:{projectId:p.id},sourceVersion:p.workflow.current.id,sceneId:'first'};
 await assert.rejects(()=>readAssistantText({...common,kind:'full',patches:[]}),/先选择/);
 const full=await readAssistantText({...common,kind:'full',patches:[{field:'long_text',value:'暂停读全文'}]});assert.equal(full.text,'纸条：测试文字。');assert.ok(full.narrationUrl.endsWith('.wav'));
 const duplicate=await readAssistantText({...common,kind:'duplicate',patches:[{field:'duplicate_text',value:'按请求补读'}]});assert.equal(duplicate.text,'字幕：重复对白。');
 assert.equal(p.workflow.current.id,versionBeforeReading);
});
test('recorded feedback uses real media decoding and server ASR without changing the narration',async()=>{const version=p.workflow.current.id,result=await assistantVoice({source:{projectId:p.id},sourceVersion:version,audio:speechBytes.toString('base64')});assert.equal(result.text,'旁白慢一点');assert.equal(p.workflow.current.id,version);assert.ok(p.workflow.recording.id);});
test.after(()=>{globalThis.fetch=originalFetch;});


test('confirmed following-scene rule produces and persists later audio without touching an individually accepted scene',async()=>{
 const data=assistantContext({projectId:p.id});
 const job=await complete(await beginAssistantRun({source:{projectId:p.id},sourceVersion:data.sourceVersion,requestId:crypto.randomUUID(),sceneId:'first',scope:'current_and_following',patches:[{field:'narration_gain_db',value:-3}]}));
 await acceptAssistant(p.id,{jobId:job.id,sceneId:'first'});
 assert.equal(p.assistant.accepted.second.settings.narration_gain_db,-3);
 assert.equal(p.assistant.inheritance.length,1);
 assert.ok(p.workflow.current.result.narrationUrl.includes('following'));
 const current=p.workflow.current.result.narrationUrl;
 await acceptAssistant(p.id,{jobId:job.id,sceneId:'first'});
 assert.equal(p.workflow.current.result.narrationUrl,current);
});
