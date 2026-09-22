import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {projects,getProject,projectDir,assetUrl,save} from './store.mjs';
import {root,run,ffmpeg,probe} from './media.mjs';
import {registerUpload} from './service.mjs';
import {transcribeRecording} from './workflow.mjs';
import {newWorkflow,newVersion,preferences,validatePreferences} from './workflow-state.mjs';
import {cloudSpeech,rewriteAssistantCue} from './ai.mjs';
import {renderNarration} from './narration.mjs';
import {narrationFile,overlayNarration,applyAcceptedAssistantAudio} from './assistant-audio.mjs';
import {films} from '../public/catalog-config.js';
import {catalogScenes} from '../public/assistant/catalog-scenes.js';
import {createSession,openDraft,editDraft,compileDraft,makeContext,applyPatches} from '../public/assistant/model.js';
import {initialTags} from '../public/assistant/schema.js';
import {assistantSpeech} from './assistant-speech.mjs';
import {observeScene} from './assistant-observations.mjs';
const active=new Map(),locks=new Map(),conflict=message=>Object.assign(new Error(message),{status:409});
const voices={female:'vivi',neutral:'xiaohe',male:'yunzhou'};
const idOK=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(id);
async function locked(id,work){const next=(locks.get(id)||Promise.resolve()).catch(()=>{}).then(work);locks.set(id,next);try{return await next;}finally{if(locks.get(id)===next)locks.delete(id);}}
function catalogParent(source){
 const film=films.find(f=>f.id===source.filmId);if(!film||!idOK(source.workspaceId))throw new Error('公开视频或工作区标识无效');
 const existing=projects.get(source.workspaceId);if(existing){if(existing.assistantCatalog!==film.id)throw conflict('此工作区属于其他视频');return existing;}
 const settings={...preferences(),...(source.settings||{})};settings.speed=settings.speed==='slow'?.8:settings.speed==='normal'?1:settings.speed;if(!validatePreferences(settings))throw new Error('旁白基准设置无效');
 const start=Number(source.start||0),end=Number(source.end||film.duration);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>film.duration||end<=start)throw new Error('播放范围无效');
 const variant=(settings.speed===.8?'slow':'normal')+'-'+settings.density;
 const current={id:'catalog-'+film.id,start,end,settings,settingsVersion:1,stage:'full',parts:[],result:{cues:(film.narration[variant]||film.narration['normal-balanced']||[]).filter(c=>c.start>=start&&c.start<end).map(c=>({...c,start:c.start-start,end:c.end-start,maxDuration:c.maxDuration}))}};
 return {id:source.workspaceId,title:film.title,duration:film.duration,scenes:film.scenes||catalogScenes[film.id],workflow:{...newWorkflow(),stage:'full',status:'complete',current,candidate:settings,roles:film.roles},assistantCatalog:film.id,virtual:true};
}
function parent(source){
 if(source?.projectId){const p=getProject(source.projectId);if(!p.workflow||p.archived)throw new Error('此项目不可修改');return p;}
 return catalogParent(source||{});
}
function editable(p){if(!p.workflow.current?.result||!['review','complete'].includes(p.workflow.status))throw conflict('请等待当前旁白完成，再打开旁白助手');}
function contextFor(p){
 editable(p);const c=p.workflow.current,roles=p.workflow.roles.map((r,i)=>({id:r.id||'C'+String(i+1).padStart(2,'0'),name:r.name,visualName:r.name,detail:r.detail,nameRevealedAt:r.evidenceTime??null}));
 const cues=c.result.cues.map((cue,i)=>({...cue,id:'cue-'+i,start:cue.start+c.start,end:cue.end+c.start}));
 const scenes=(p.scenes||[]).filter(s=>s.start<c.end&&s.end>c.start).map((s,i)=>{
  const start=Math.max(c.start,s.start),end=Math.min(c.end,s.end);
  const selected=cues.filter(q=>q.start>=start&&q.start<end).map((q,j)=>({...q,windowId:s.id+'-w'+j,maxDuration:Math.max(0,Math.min(q.maxDuration||q.end-q.start,end-q.start,(cues[cues.indexOf(q)+1]?.start??end)-q.start))}));
  return {id:s.id||'scene-'+i,title:s.title||'片段 '+(i+1),start,end,characterIds:s.characterIds,cues:selected,facts:(s.facts||[]).map((text,j)=>({id:(s.id||i)+'-f'+j,text,revealedAt:start}))};
 });
 if(!scenes.length)scenes.push({id:'current',title:'当前试听片段',start:c.start,end:c.end,cues:cues.map((q,i)=>({...q,windowId:'window-'+i,maxDuration:q.end-q.start})),facts:[]});
 const film={id:p.id,title:p.title,duration:p.duration,actualContext:true,scenePlanVersion:`${c.start}-${c.end}`,scenes,roles};
 return {projectId:p.virtual?null:p.id,sourceVersion:c.id,settings:c.settings,film,accepted:p.assistant?.accepted||{},originalNarrationUrl:c.result.narrationUrl||null,sourceUrl:p.virtual?'/api/media/'+films.find(f=>f.id===p.assistantCatalog).fileName:assetUrl(p,p.source)};
}
export async function assistantContext(source){
 const p=parent(source);
 if(!p.virtual&&p.assistantCatalog)await locked(p.id,()=>repairCatalogCoverage(p));
 return contextFor(p);
}
function catalogVariant(settings){return (settings.speed===.8?'slow':'normal')+'-'+settings.density;}
function expectedCatalogCues(p){const f=films.find(f=>f.id===p.assistantCatalog),c=p.workflow.current;return (f?.narration[catalogVariant(c.settings)]||[]).filter(q=>q.start>=c.start&&q.start<c.end);}
export function validateBaselineCoverage(expected,cues){
 if(expected.some(q=>!cues.some(c=>Math.abs(c.start-q.start)<.05)))throw new Error('原版旁白缺少后续场景，请读取完整音轨后重试；没有覆盖原版。');
}
async function repairCatalogCoverage(p){
 const old=p.workflow.current;if(!old?.result||active.has(p.id))return;
 const expected=expectedCatalogCues(p),overrides=p.assistant?.audioOverrides||Object.values(p.assistant?.accepted||{});
 const missing=expected.filter(q=>!overrides.some(a=>q.start>=a.start&&q.start<a.end)&&!old.result.cues.some(c=>Math.abs(c.start+old.start-q.start)<.05));
 if(!missing.length)return;
 const film=films.find(f=>f.id===p.assistantCatalog),variant=catalogVariant(old.settings);
 if(old.settings.voice!=='vivi'||!film.fallbackAudio[variant])throw new Error('旧版旁白不完整，请以完整原版重新制作；旧版已保留。');
 const version=structuredClone(old);version.id=randomUUID();
 const file=path.join(projectDir(p.id),`narration-${version.id}-restored.wav`);
 await run(ffmpeg,['-v','error','-ss',String(old.start),'-i',path.join(root,'public',film.fallbackAudio[variant]),'-t',String(old.end-old.start),'-c:a','pcm_s16le','-y',file]);
 version.result={...old.result,versionId:version.id,narrationUrl:assetUrl(p,file),cues:expected.map(q=>({...q,start:q.start-old.start,end:q.end-old.start}))};
 await applyAcceptedAssistantAudio(p,version);
 version.coverageRepair={restoredStarts:missing.map(q=>q.start),sourceVersion:old.id,at:new Date().toISOString()};
 p.workflow.history.push({...structuredClone(old),supersededAt:new Date().toISOString()});p.workflow.current=version;p.workflow.revision++;await save(p);
}
export async function readAssistantText(input,signal){
 let p=parent(input.source);const data=contextFor(p);
 if(data.sourceVersion!==input.sourceVersion)throw conflict('当前视频版本已变化，请重新打开助手');
 const scene=data.film.scenes.find(s=>s.id===input.sceneId);if(!scene)throw new Error('场景不存在');
 if(!['full','duplicate'].includes(input.kind))throw new Error('读取方式无效');
 const ctx=makeContext(data.film,scene.id,scene.start,p.id);
 const base=store(p).accepted[scene.id]?.settings||initialTags(data.settings);
 if(!Array.isArray(input.patches)||input.patches.length>100)throw new Error('读取设置无效');
 const effective=applyPatches(base,input.patches,ctx);
 if(input.kind==='full'&&effective.long_text!=='暂停读全文')throw new Error('请先选择“暂停读全文”，再主动发起朗读');
 if(input.kind==='duplicate'&&effective.duplicate_text!=='按请求补读')throw new Error('请先选择“按请求补读”，再主动发起补读');
 p=await materialize(p,input.baseline);const observation=await observeScene(p,scene,signal);
 const spoken=(p.transcript?.segments||[]).filter(s=>s.start<scene.end&&s.end>scene.start).map(s=>s.text).join('').replace(/[\s，。！？、]/g,'');
 const entries=observation.texts.filter(t=>input.kind==='duplicate'?(t.category==='对白字幕'||spoken.includes(t.text.replace(/[\s，。！？、]/g,''))):effective.text_categories.includes(t.category));
 const lines=[...new Set(entries.map(t=>(effective.text_source==='先报载体'?t.carrier+'：':'')+t.text))];
 if(!lines.length)return {projectId:p.id,message:'当前采样画面中没有辨认出符合读取条件的文字，未生成或补造全文。',text:'',narrationUrl:null,sampleTimes:observation.sampleTimes};
 const text=lines.join('。');if(text.length>2000)throw new Error('这段文字较长，请选择更短的场景后读取');
 const file=path.join(projectDir(p.id),'assistant-read-'+randomUUID()+'.wav');
 await assistantSpeech(text,file,signal,{speed:effective.speech_rate,voice:voices[effective.voice_id],delivery:effective.delivery,sentencePause:effective.sentence_pause,filmId:p.id,promptHash:'screen-text-read-v1'});
 return {projectId:p.id,message:'已暂停原片。以下是采样画面中识别出的文字，模糊处保留“无法辨认”。',text,narrationUrl:assetUrl(p,file),sampleTimes:observation.sampleTimes};
}
async function materialize(p,baseline){
 if(!p.virtual)return p;
 const film=films.find(f=>f.id===p.assistantCatalog),dir=projectDir(p.id);await mkdir(dir,{recursive:true});
 const source=path.join(dir,'source.mp4');await copyFile(path.join(root,'public',film.video),source);
  const file=path.join(dir,'catalog-original.wav');
 const current=p.workflow.current,variant=catalogVariant(current.settings);let original=path.join(root,'public',film.fallbackAudio[variant]||'');
 if(baseline){
  if(typeof baseline.audio!=='string'||baseline.audio.length>26000000||!Array.isArray(baseline.cues)||baseline.cues.length>1000)throw new Error('原版旁白数据无效');
  validateBaselineCoverage(expectedCatalogCues(p),baseline.cues);
  original=path.join(dir,'assistant-baseline.bin');await writeFile(original,Buffer.from(baseline.audio,'base64'));const info=await probe(original);if(info.duration<current.end-.1||info.duration>film.duration+.5)throw new Error('原版旁白时长与视频不符');
  const windows=film.narration['normal-balanced'];
  for(const cue of baseline.cues)if(typeof cue.text!=='string'||cue.text.length>500||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.end<=cue.start||!windows.some(w=>cue.start>=w.start-.05&&cue.end<=w.start+w.maxDuration+.05))throw new Error('原版旁白不在已记录的原声空隙');
  current.result.cues=baseline.cues.filter(c=>c.start>=current.start&&c.start<current.end).map(c=>({text:c.text,start:c.start-current.start,end:c.end-current.start,maxDuration:windows.find(w=>c.start>=w.start-.05&&c.end<=w.start+w.maxDuration+.05).maxDuration}));
 }else if(current.settings.voice!=='vivi'||!film.fallbackAudio[variant])throw new Error('请从播放器重新打开助手，以读取当前实际旁白');
 await run(ffmpeg,['-v','error','-ss',String(current.start),'-i',original,'-t',String(current.end-current.start),'-c:a','pcm_s16le','-y',file]);
 const saved=await registerUpload(p.id,film.title+'-旁白修订.mp4',source,{guided:true});
 saved.assistantCatalog=film.id;saved.scenes=p.scenes;saved.workflow=p.workflow;delete saved.virtual;
 saved.workflow.current.result={...p.workflow.current.result,narrationUrl:assetUrl(saved,file),sourceUrl:assetUrl(saved,source),start:current.start,end:current.end,duration:current.end-current.start};
 saved.workflow.current.execution={source:'existing-catalog-audio'};await save(saved);return saved;
}
function store(p){return p.assistant||={jobs:{},accepted:{}};}
function authoritativePlan(p,input){
 const data=contextFor(p);if(input.sourceVersion!==data.sourceVersion)throw conflict('当前视频版本已变化，请刷新旁白助手；草稿仍保留');
 const context=makeContext(data.film,input.sceneId,undefined,p.id),session=createSession(p.id,data.film,data.settings);
 session.accepted=structuredClone(store(p).accepted);
 session.inheritance=structuredClone(store(p).inheritance||[]);
 const draft=openDraft(session,context);
 if(input.baseCandidate){const candidate=Object.values(store(p).jobs).flatMap(j=>j.candidates||[]).find(c=>c.id===input.baseCandidate&&c.sceneId===input.sceneId&&(c.baseMediaVersion===data.sourceVersion||store(p).accepted[input.sceneId]?.id===c.id));if(!candidate)throw conflict('修订基准已失效，请重新打开助手');draft.base=structuredClone(candidate.settings);draft.effective=structuredClone(candidate.settings);const scene=data.film.scenes.find(s=>s.id===input.sceneId);scene.cues=candidate.cues.map(c=>({...c,maxDuration:scene.cues.find(q=>q.start===c.start)?.maxDuration||c.end-c.start}));context.cues=scene.cues;}
 if(!Array.isArray(input.patches)||input.patches.length>100)throw new Error('修改字段格式无效');
 editDraft(draft,input.patches,context,{scope:input.scope,targetIds:input.targetIds});
 const plan=compileDraft(session,draft,context);if(!plan.valid)throw new Error(plan.errors.join(' '));
 for(const target of plan.targets){if(!target.cues.length)throw new Error(`场景“${target.title}”没有已确认的旁白窗口，不能安全重制。请选择已有旁白的场景。`);}
 return {plan,data};
}
export async function beginAssistantRun(input){
 const initial=parent(input.source);return locked(initial.id,async()=>{
  let p=parent(input.source);editable(p);const state=store(p);
  if(!idOK(input.requestId))throw new Error('缺少有效的请求标识');
  if(state.jobs[input.requestId])return jobView(p,state.jobs[input.requestId]);
  if(active.has(p.id))throw conflict('这个视频已有旁白重制正在执行，请等待完成');
  if(input.sourceVersion!==contextFor(p).sourceVersion)throw conflict('当前版本已变化，请刷新助手');p=await materialize(p,input.baseline);const {plan,data}=authoritativePlan(p,input);
   const job={id:input.requestId,projectId:p.id,status:'running',baseCandidate:input.baseCandidate||null,baseMediaVersion:data.sourceVersion,lastAppliedVersion:data.sourceVersion,plan,candidates:[],accepted:[],message:'正在按已确认指令重制旁白',createdAt:new Date().toISOString()};store(p).jobs[job.id]=job;await save(p);
  const controller=new AbortController();active.set(p.id,{controller});
  const promise=produce(p,job,controller.signal).then(()=>{job.status='complete';job.message='新配音已生成，请试听后采用';}).catch(e=>{job.status='error';job.message=e.message;}).finally(async()=>{job.endedAt=new Date().toISOString();await save(p);active.delete(p.id);});active.get(p.id).promise=promise;
  return jobView(p,job);
 });
}
async function produce(p,job,signal){
 const masterGain=p.workflow.current.settings.gain||1;
 for(const target of job.plan.targets){
  if(signal.aborted)throw new Error('重制已中断，原版保持不变');
  const dir=path.join(projectDir(p.id),'assistant-'+job.id);await mkdir(dir,{recursive:true});const generated=[],reasons=[];
  job.message='正在重制场景：'+target.title;await save(p);
  const observation=target.nodes.includes('rewrite')?await observeScene(p,target,signal):null;
  if(observation?.limitations)reasons.push(observation.limitations);
  const gainOnly=target.nodes.every(n=>['gain','level-check'].includes(n));
  for(const [i,cue] of target.cues.entries()){
   if(gainOnly){generated.push({text:cue.text,category:'required',insertStart:cue.start-target.start,insertEnd:cue.start-target.start+cue.maxDuration,audio:{duration:cue.end-cue.start}});continue;}
   const speechSettings={speed:target.effective.speech_rate,voice:voices[target.effective.voice_id],delivery:target.effective.delivery,sentencePause:target.effective.sentence_pause,filmId:p.id,promptHash:createHash('sha256').update(target.prompt).digest('hex')};
   let text=cue.text;
   if(target.nodes.includes('rewrite')){const edited=await rewriteAssistantCue({...cue,speed:speechSettings.speed,facts:[...(p.scenes.find(s=>s.id===target.sceneId)?.facts||[]),...(observation?.facts||[]).filter(f=>f.time<=cue.start+cue.maxDuration)],screenTexts:(observation?.texts||[]).filter(t=>t.time<=cue.start+cue.maxDuration&&(target.effective.text_categories.includes(t.category))),textPolicy:{source:target.effective.text_source,longText:target.effective.long_text,duplicates:target.effective.duplicate_text},previousCues:p.workflow.current.result.cues.filter(q=>q.start+p.workflow.current.start<cue.start).slice(-8)},target.prompt,signal);text=edited.text;if(edited.reason)reasons.push(edited.reason);}
   const output=await assistantSpeech(text,path.join(dir,`${target.sceneId}-${i}.wav`),signal,speechSettings);
   if(output.duration>cue.maxDuration+.02)throw new Error(`场景“${target.title}”新配音超出原声空隙，原版已保留；请精简描述或恢复语速。`);
   generated.push({text,category:'required',insertStart:cue.start-target.start,insertEnd:cue.start-target.start+cue.maxDuration,audio:output});
  }
  const raw=path.join(dir,target.sceneId+'-raw.wav'),file=path.join(dir,target.sceneId+'.wav');
  if(gainOnly){
   const base=Object.values(store(p).jobs).flatMap(j=>j.candidates||[]).find(c=>c.id===job.baseCandidate&&c.sceneId===target.sceneId);
   const baseFile=narrationFile(p,base?.narrationUrl||p.workflow.current.result.narrationUrl),offset=base?0:target.start-p.workflow.current.start;
   await run(ffmpeg,['-v','error','-ss',String(offset),'-i',baseFile,'-t',String(target.end-target.start),'-af',`volume=${target.effective.narration_gain_db-target.base.narration_gain_db}dB`,'-c:a','pcm_s16le','-y',file],{signal});
  }else{
   await renderNarration(generated,raw,target.end-target.start,signal);
   await run(ffmpeg,['-v','error','-i',raw,'-af',`volume=${target.effective.narration_gain_db}dB`,'-c:a','pcm_s16le','-y',file],{signal});
  }
  const info=await probe(file,signal);if(Math.abs(info.duration-(target.end-target.start))>.15)throw new Error('新音轨时长检查失败');
  await run(ffmpeg,['-v','error','-i',file,'-f','null','-'],{signal});
  job.candidates.push({id:job.id+'-'+target.sceneId,sceneId:target.sceneId,number:target.number,title:target.title,start:target.start,end:target.end,baseVersion:target.baseVersion,baseMediaVersion:job.baseMediaVersion,base:target.base,settings:target.effective,scope:job.plan.scope,patches:target.inheritancePatches,changes:target.changes,nodes:target.nodes,prompt:target.prompt,mediaKind:'audio',audioGenerated:true,timingVerified:true,narrationUrl:assetUrl(p,file),masterGain,originalText:target.cues.map(c=>c.text),observations:observation?{sampleTimes:observation.sampleTimes,limitations:observation.limitations}:null,audioProcessing:generated.map(q=>({sentences:q.audio.sentenceCount,pause:q.audio.pauseMilliseconds,delivery:q.audio.delivery})),cues:generated.map(q=>({text:q.text,start:q.insertStart+target.start,end:q.insertStart+target.start+q.audio.duration,maxDuration:q.insertEnd-q.insertStart})),candidateText:generated.map((q,i)=>({id:target.sceneId+'-'+i,text:q.text,status:'实际生成旁白'})),issues:reasons});await save(p);
 }
 if(p.workflow.current.id!==job.baseMediaVersion)throw conflict('原版在重制期间已更新，新音轨保留但不会覆盖，请重新打开助手');
}
function jobView(p,job){return {id:job.id,projectId:p.id,status:job.status,message:job.message,candidates:job.status==='complete'?job.candidates:[],accepted:job.accepted,sourceVersion:job.lastAppliedVersion};}
export function assistantJob(id,jobId){const p=getProject(id),job=p.assistant?.jobs[jobId];if(!job)throw new Error('重制任务不存在');if(job.status==='running'&&!active.has(id)){job.status='error';job.message='服务重启中断了重制，原版保留；请重新确认执行。';}return jobView(p,job);}
export async function acceptAssistant(id,input){return locked(id,async()=>{
 const p=getProject(id),job=p.assistant?.jobs[input.jobId];editable(p);
 if(!job||job.status!=='complete')throw conflict('新配音尚未完成');
 const candidate=job.candidates.find(c=>c.sceneId===input.sceneId);if(!candidate)throw new Error('场景结果不存在');
 if(job.accepted.includes(candidate.id)){
  if(candidate.scope==='current_and_following')await applyInheritedAssistant(p,p.workflow.current);
  return {sourceVersion:job.lastAppliedVersion,projectId:p.id};
 }
 if(p.workflow.current.id!==job.lastAppliedVersion)throw conflict('当前版本已改变，不能覆盖；新音轨仍保留');
 const old=p.workflow.current,version=structuredClone(old);version.id=randomUUID();
 const file=path.join(projectDir(p.id),`narration-${version.id}.wav`);
 await overlayNarration(narrationFile(p,old.result.narrationUrl),[{file:narrationFile(p,candidate.narrationUrl),at:candidate.start-old.start,duration:candidate.end-candidate.start}],file,old.end-old.start);
 version.result={...old.result,narrationUrl:assetUrl(p,file),versionId:version.id,cues:[...old.result.cues.filter(c=>c.start+old.start<candidate.start||c.start+old.start>=candidate.end),...candidate.cues.map(c=>({...c,start:c.start-old.start,end:c.end-old.start}))].sort((a,b)=>a.start-b.start)};
 version.assistantRevision={jobId:job.id,sceneId:candidate.sceneId};
 editable(p);if(p.workflow.current.id!==old.id)throw conflict('当前版本已改变，不能覆盖；新音轨仍保留');
 p.workflow.history.push({...structuredClone(old),supersededAt:new Date().toISOString()});p.workflow.current=version;p.workflow.revision++;
 const prior=store(p).audioOverrides||Object.values(store(p).accepted);
 store(p).audioOverrides=prior.flatMap(old=>{if(old.end<=candidate.start||old.start>=candidate.end)return [old];const pieces=[];if(old.start<candidate.start)pieces.push({...old,end:candidate.start,sourceStart:old.sourceStart??old.start,cues:old.cues.filter(c=>c.start<candidate.start)});if(old.end>candidate.end)pieces.push({...old,start:candidate.end,sourceStart:old.sourceStart??old.start,cues:old.cues.filter(c=>c.start>=candidate.end)});return pieces;});store(p).audioOverrides.push(candidate);
 store(p).accepted[candidate.sceneId]=candidate;
 if(candidate.scope==='current_and_following')(store(p).inheritance||=[]).push({after:candidate.number,patches:structuredClone(candidate.patches),acceptedId:candidate.id});
 job.accepted.push(candidate.id);job.lastAppliedVersion=version.id;await save(p);
 if(candidate.scope==='current_and_following')await applyInheritedAssistant(p,version);
 return {projectId:p.id,sourceVersion:version.id,narrationUrl:version.result.narrationUrl};
 });}
export async function stopAssistantJobs(){for(const {controller} of active.values())controller.abort();await Promise.allSettled([...active.values()].map(x=>x.promise));}

// Apply a confirmed following-scene rule to actual audio when later scenes
// become available. Existing individually accepted scenes retain their version.
export async function applyInheritedAssistant(p,version,signal=new AbortController().signal){
 const rules=store(p).inheritance||[];if(!rules.length)return;
 const data=contextFor({...p,workflow:{...p.workflow,status:'review',current:version}}),targets=[];
 for(const [index,scene] of data.film.scenes.entries()){
  if(store(p).accepted[scene.id]||!scene.cues.length)continue;
  const applicable=rules.filter(r=>index+1>r.after);if(!applicable.length)continue;
  const context=makeContext(data.film,scene.id,scene.start,p.id),session=createSession(p.id,data.film,data.settings),draft=openDraft(session,context);
  for(const rule of applicable)editDraft(draft,rule.patches,context,{scope:'current'});
  const plan=compileDraft(session,draft,context);
  if(plan.valid)targets.push(...plan.targets);
  else if(plan.changes.length)throw new Error(plan.errors.join(' '));
 }
 if(!targets.length)return;
 const job={id:randomUUID(),projectId:p.id,status:'running',baseMediaVersion:version.id,lastAppliedVersion:version.id,plan:{scope:'current',targets},candidates:[],accepted:[],createdAt:new Date().toISOString(),inheritedFrom:rules.map(r=>r.acceptedId)};
 store(p).jobs[job.id]=job;
 try{
  await produce(p,job,signal);
  const file=path.join(projectDir(p.id),`narration-${version.id}-following-${job.id}.wav`);
  await overlayNarration(narrationFile(p,version.result.narrationUrl),job.candidates.map(c=>({file:narrationFile(p,c.narrationUrl),at:c.start-version.start,duration:c.end-c.start})),file,version.end-version.start,signal);
  version.result={...version.result,narrationUrl:assetUrl(p,file),cues:[...version.result.cues.filter(c=>!job.candidates.some(a=>c.start+version.start>=a.start&&c.start+version.start<a.end)),...job.candidates.flatMap(a=>a.cues.map(c=>({...c,start:c.start-version.start,end:c.end-version.start})))].sort((a,b)=>a.start-b.start)};
  for(const c of job.candidates){store(p).accepted[c.sceneId]=c;(store(p).audioOverrides||=[]).push(c);job.accepted.push(c.id);}
  job.status='complete';job.message='已将确认的设置用于后续场景';
 }catch(e){job.status='error';job.message=e.message;throw e;}
 finally{job.endedAt=new Date().toISOString();await save(p);}
}

export async function assistantVoice(input){let p=parent(input.source);if(contextFor(p).sourceVersion!==input.sourceVersion)throw conflict('视频版本已变化，请重新打开助手');if(typeof input.audio!=='string'||input.audio.length>12000000)throw new Error('录音数据无效');const bytes=Buffer.from(input.audio,'base64');if(bytes.length>8*1024*1024)throw new Error('录音过大，请控制在60秒以内');p=await materialize(p,input.baseline);return {projectId:p.id,...await transcribeRecording(p,bytes,input.recordingId)};}
