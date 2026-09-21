import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {save,projectDir,projects,assetUrl} from './store.mjs';
import {pipeline,cancelJob,registerUpload} from './service.mjs';
import {identifyRoles,transcribe} from './ai.mjs';
import {trimVideo,run,ffmpeg,probe} from './media.mjs';
import {renderNarration} from './narration.mjs';
import {newWorkflow,sampleRange,nextStage,feedbackChange,newVersion} from './workflow-state.mjs';
import {isVoice} from '../public/voices.js';

const active=new Map(),locks=new Map();
export const activeWorkflows=()=>active.size;
const now=()=>new Date().toISOString();
export function projectView(p){
  const w=structuredClone(p.workflow);
  if(w)w.roles=(w.roles||[]).map(r=>{const {evidenceFile,...rest}=r;return {...rest,evidenceUrl:evidenceFile?assetUrl(p,evidenceFile):null};});
  for(const v of [w?.current,...(w?.history||[])])if(v){delete v.inFlight;v.parts=v.parts.map(({start,end})=>({start,end}));}
  return {id:p.id,title:p.title,duration:p.duration,sourceUrl:assetUrl(p,p.source),hasAudio:p.hasAudio,updatedAt:p.updatedAt,workflow:w,provenance:'uploaded'};
}
async function report(p,message){const w=p.workflow;if(w.message!==message){w.message=message;w.events.push({at:now(),message});w.events=w.events.slice(-80);await save(p);}}
async function waitPipeline(p,child,signal){
  let cancelled=false;
  while(child.job?.status==='running'){
    if(signal.aborted&&!cancelled){cancelled=true;await cancelJob(child);}
    await report(p,child.job.message);await new Promise(r=>setTimeout(r,100));
  }
  if(signal.aborted)throw new Error('已暂停制作');
  if(child.job?.status!=='done')throw new Error(child.job?.message||'处理尚未完成');
}
async function analyzeProject(p,signal){
  if(!p.scenes.length){pipeline(p,{stage:'analyze'});await waitPipeline(p,p,signal);}
  const frames=await Promise.all((p.analysisFrames||[]).map(async f=>({...f,url:'data:image/jpeg;base64,'+(await readFile(f.file)).toString('base64')})));
  if(!frames.length)throw new Error('尚未取得分析画面，请重试');
  if(!p.workflow.rolesAnalyzed){await report(p,'正在依据画面整理人物介绍');p.workflow.roles=await identifyRoles(frames,p.transcript,signal);p.workflow.rolesAnalyzed=true;await save(p);}
  if(signal.aborted)throw new Error('已暂停分析');
  p.workflow.ranges={short:sampleRange(p,'short')};
  p.workflow.stage='roles';p.workflow.status='review';
  await report(p,`分析完成，采样中整理了${p.workflow.roles.length}位人物。可重听介绍，或继续制作短样片。`);
}
async function produce(p,signal){
  const w=p.workflow,c=w.current;
  if(!c)throw new Error('缺少当前制作版本');
  let cursor=c.parts.at(-1)?.end??c.start;
  while(cursor<c.end-.02){
    if(signal.aborted)throw new Error('已暂停制作');
    const end=Math.min(c.end,cursor+60);
    let child=c.inFlight?.start===cursor?projects.get(c.inFlight.id):null;
    if(!child){
      const id=randomUUID(),dir=projectDir(id);await mkdir(dir,{recursive:true});
      const source=path.join(dir,'source.mp4');await report(p,`正在准备原片${cursor.toFixed(1)}至${end.toFixed(1)}秒`);
      await trimVideo(p.source,source,cursor,end,signal);
      child=await registerUpload(id,p.title+'-处理分段.mp4',source);child.archived=true;child.parentListeningProject=p.id;
      child.listeningPreferences={...c.settings,roles:w.roles.map(({name,detail})=>({name,detail}))};
      child.originalVolume=1;child.narrationVolume=1;child.duckLevel=1;
      await save(child);c.inFlight={id,start:cursor};await save(p);
    }
    const job=active.get(p.id);if(job)job.child=child;
    if(!child.versions.some(v=>v.kind==='personal'&&v.revision===child.revision)){
      pipeline(child,{purpose:'listen'});await waitPipeline(p,child,signal);
      if(!child.versions.some(v=>v.kind==='personal'&&v.revision===child.revision))throw new Error(child.job?.message||'旁白未通过时长检查');
    }
    const cues=child.scenes.filter(s=>s.category!=='none'&&s.audio).map(s=>({text:s.text,category:s.category,insertStart:s.insertStart+cursor-c.start,insertEnd:s.insertEnd+cursor-c.start,audio:{...s.audio}}));
    const narrationFile=`part-${c.id}-${c.parts.length}.wav`;
    await renderNarration(child.scenes,path.join(projectDir(p.id),narrationFile),end-cursor,signal);
    c.parts.push({start:cursor,end,childId:child.id,narrationFile,cues});c.inFlight=null;cursor=end;await save(p);
  }
  await report(p,'正在检查独立旁白音轨和完整时间范围');
  const file=path.join(projectDir(p.id),`narration-${c.id}.wav`);
  const concat=path.join(projectDir(p.id),`concat-${c.id}.txt`);
  await writeFile(concat,c.parts.map(part=>`file '${part.narrationFile}'`).join('\n'),'utf8');
  await run(ffmpeg,['-v','error','-f','concat','-safe','1','-i',concat.replaceAll('\\','/'),'-c:a','pcm_s16le','-y',file],{signal,timeout:300000});
  const info=await probe(file,signal);
  if(Math.abs(info.duration-(c.end-c.start))>.15||!info.hasAudio)throw new Error('完整旁白音轨未覆盖原片范围，请重试');
  await run(ffmpeg,['-v','error','-i',file,'-f','null','-'],{signal,timeout:300000});
  if(signal.aborted)throw new Error('已暂停制作');
  c.result={narrationUrl:assetUrl(p,file),sourceUrl:assetUrl(p,p.source),start:c.start,end:c.end,duration:c.end-c.start,versionId:c.id,settingsVersion:c.settingsVersion,createdAt:now(),cues:c.parts.flatMap(part=>part.cues.map(x=>({text:x.text,start:x.insertStart,end:x.insertStart+x.audio.duration})))};
  w.status=w.stage==='full'?'complete':'review';
  await report(p,w.stage==='full'?'完整口述影像已准备好。可以播放或保存到我的视频；内容未经人工审听。':'新样片已准备好，请试听后确认，或提出修改。');
}
function launch(p){
  if(active.has(p.id))return;
  const controller=new AbortController(),entry={controller,child:null};active.set(p.id,entry);
  p.workflow.status='generating';p.workflow.revision++;
  entry.promise=(async()=>{
    try{await save(p);if(p.workflow.stage==='analyzing')await analyzeProject(p,controller.signal);else await produce(p,controller.signal);}
    catch(error){p.workflow.status=controller.signal.aborted?'paused':'error';await report(p,controller.signal.aborted?'制作已暂停，已完成的内容已保留。':error.message);}
    finally{p.workflow.revision++;await save(p);active.delete(p.id);}
  })().catch(error=>{active.delete(p.id);console.error('Workflow persistence failed:',error.code||'unknown');});
}
export async function startWorkflow(p,voice){if(!p.workflow){p.workflow=newWorkflow();if(voice){if(!isVoice(voice))throw new Error('不支持此音色');p.workflow.candidate.voice=voice;}await save(p);}launch(p);return projectView(p);}
export async function workflowAction(p,input){
  const previous=locks.get(p.id)||Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>act(p,input));locks.set(p.id,next);
  try{return await next;}finally{if(locks.get(p.id)===next)locks.delete(p.id);}
}
async function act(p,input){
  const w=p.workflow;if(!w)throw new Error('未找到制作任务');
  if(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>100)throw new Error('缺少有效请求标识');
  if(w.requests.includes(input.requestId))return projectView(p);
  if(input.revision!==w.revision)throw Object.assign(new Error('进度已更新，请刷新当前任务后再操作。'),{status:409});
  const action=input.action;
  if(action==='pause'){
    active.get(p.id)?.controller.abort();if(active.get(p.id)?.child)await cancelJob(active.get(p.id).child);
  }else if(action==='position'){
    if(!Number.isFinite(input.position)||input.position<0||input.position>p.duration)throw new Error('播放位置无效');w.position=input.position;
  }else{
    if(active.has(p.id))throw Object.assign(new Error('当前仍在处理，请稍候或暂停。'),{status:409});
    if(action==='retry'){
      if(!['error','paused','interrupted'].includes(w.status))throw new Error('当前无需重试');
      if(w.stage!=='analyzing'&&!w.current){const range=sampleRange(p,w.stage);w.ranges[w.stage]=range;w.current=newVersion(w,range);}
      launch(p);
    }else if(action==='accept'){
      if(w.status!=='review')throw new Error('当前尚无可确认的结果');
      if(w.stage!=='roles'&&(!w.current?.result||input.versionId!==w.current.id||w.current.settingsVersion!==w.settingsVersion))throw new Error('只能确认当前已生成的版本');
      const stage=nextStage(w),range=sampleRange(p,stage);
      if(w.stage!=='roles'){
        w.history.push({...structuredClone(w.current),acceptedAt:now()});w.confirmed={...w.candidate,version:w.settingsVersion};
        if(w.stage==='verify')w.verifiedVersion=w.settingsVersion;
      }
      if(stage==='full'&&w.mediumEdited&&w.verifiedVersion!==w.settingsVersion)throw new Error('请先确认当前设置的新短片复验');
      w.stage=stage;w.ranges[stage]=range;w.current=newVersion(w,range);launch(p);
    }else if(action==='voice'){
      if(!isVoice(input.voice))throw new Error('不支持此音色');
      if(w.status!=='review'||!['roles','short','medium','verify'].includes(w.stage))throw new Error('已完成作品保留原音色；请在试听阶段切换。');
      if(w.candidate.voice!==input.voice){
        w.candidate={...w.candidate,voice:input.voice};w.settingsVersion++;w.verifiedVersion=null;
        if(w.stage==='medium')w.mediumEdited=true;
        if(w.stage!=='roles'){w.history.push({...structuredClone(w.current),acceptedAt:null});w.current=newVersion(w,w.ranges[w.stage]);launch(p);}
      }
    }else if(action==='feedback'){
      if(w.status!=='review'||!['short','medium','verify'].includes(w.stage))throw new Error('请先完成当前样片');
      const result=feedbackChange(input.text,w.candidate);w.feedback={text:String(input.text),message:result.message,engine:'rules-v1',at:now()};
      if(result.ok){w.history.push({...structuredClone(w.current),acceptedAt:null});w.candidate=result.candidate;w.settingsVersion++;w.verifiedVersion=null;if(w.stage==='medium')w.mediumEdited=true;w.current=newVersion(w,w.ranges[w.stage]);launch(p);}
      else await report(p,result.message);
    }else if(action==='save'){
      if(w.status!=='complete'||!w.current?.result||w.stage!=='full')throw new Error('整片完成后才能加入我的视频，当前任务已自动保留为草稿。');
      w.saved=true;await report(p,'已加入我的视频，下次可继续播放。');
    }else throw new Error('不支持此操作');
  }
  w.requests.push(input.requestId);w.requests=w.requests.slice(-100);w.revision++;await save(p);return projectView(p);
}
export async function transcribeRecording(p,bytes,recordingId){
  if(!p.workflow||p.workflow.status!=='review'||!['short','medium','verify'].includes(p.workflow.stage))throw new Error('请在样片完成后提出修改');
  const dir=projectDir(p.id);
  if(!recordingId){
    recordingId=randomUUID();await writeFile(path.join(dir,`feedback-${recordingId}.webm`),bytes);
    p.workflow.recording={id:recordingId,versionId:p.workflow.current.id,status:'saved'};await save(p);
  }
  if(p.workflow.recording?.id!==recordingId||p.workflow.recording.versionId!==p.workflow.current.id)throw new Error('录音与当前样片版本不匹配，请重新录制');
  const versionId=p.workflow.current.id;
  const raw=path.join(dir,`feedback-${recordingId}.webm`),wav=path.join(dir,`feedback-${recordingId}.wav`);
  try{
    await run(ffmpeg,['-v','error','-i',raw,'-t','61','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-y',wav]);
    const info=await probe(wav);if(info.duration>60||info.duration<.2)throw new Error('录音请控制在1至60秒');
    const text=(await transcribe(wav)).text;
    if(p.workflow.current?.id!==versionId||p.workflow.recording?.id!==recordingId)throw new Error('录音所属版本已变化，转写结果未回填。');
    p.workflow.recording={...p.workflow.recording,status:'transcribed',text};await save(p);return {text,recordingId};
  }catch(error){if(p.workflow.recording?.id===recordingId){p.workflow.recording.status='error';await save(p);}throw Object.assign(new Error('转写未完成，录音已保留，可重试或输入文字。'),{status:502,recordingId});}
}
export async function stopWorkflows(){for(const job of active.values())job.controller.abort();await Promise.allSettled([...active.values()].map(j=>j.promise));}
