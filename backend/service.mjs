import {promptHash} from './prompt-library.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { scriptHash, scriptReview, requireScriptApproval } from './script-review.mjs';
import { createReadStream } from 'node:fs';
import { mkdir, copyFile, writeFile, readFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { projects, save, getProject, projectDir, problems, publicProject } from './store.mjs';
import { root, probe, verifyVideo, localSpeech, extractFrames, extractAudio, silentWindows, dialogueGaps, mixVideo, trimVideo, trimSpeechEdges } from './media.mjs';
import { settings, transcribe, analyze, shorten, cloudSpeech } from './ai.mjs';

const controllers=new Map();
const activeJobs=new Map();
export async function waitForJobs(){while(activeJobs.size)await Promise.allSettled([...activeJobs.values()]);}
const uid=()=>randomUUID().slice(0,12);
const conflictText='近处的浪峰缓缓隆起，一层层蓝绿色的波纹向远处铺开，水面泛着细碎的光。';
async function sourceIdentity(source,title,duration){const hash=createHash('sha256');for await(const chunk of createReadStream(source))hash.update(chunk);const sha256=hash.digest('hex');return {filmId:`film-${sha256.slice(0,16)}`,filmTitle:title,clipTitle:title,sourceStart:0,sourceEnd:duration,sha256};}
function baseProject(id,title,source,info,provenance){return {id,title,source,...info,provenance,revision:1,createdAt:new Date().toISOString(),scenes:[],versions:[],feedback:[],job:null,fullReviewRev:0,originalVolume:1,narrationVolume:1,windows:[],transcript:null};}
export async function createSample(){
  const id=uid(),dir=projectDir(id);await mkdir(dir,{recursive:true});
  const source=path.join(dir,'source.mp4');await copyFile(path.join(root,'public','sample-original.mp4'),source);
  const p=baseProject(id,'海的另一种声音',source,{duration:18,width:1280,height:720,hasAudio:true},'sample-annotated');
  p.sourceInfo=await sourceIdentity(source,p.title,p.duration);
  p.poster=path.join(dir,'poster.jpg');await copyFile(path.join(root,'public','coast.jpg'),p.poster);
  const rows=[
    {title:'海面与天空',start:0,end:6,evidenceTime:.8,text:'蓝绿色的海面，铺展在浅色的天空下。',insertStart:.8,insertEnd:5.3,evidence:'蓝绿色海面位于画面下方，浅色天空在上方。',facts:['海面为蓝绿色','上方是浅色天空'],category:'required'},
    {title:'近处的浪峰',start:6,end:12,evidenceTime:6.5,text:conflictText,insertStart:6.5,insertEnd:11,evidence:'近处可见隆起的浪峰与水面高光。这是静态照片推镜，不据此推断浪的运动方向。',facts:['近处有隆起的浪峰','水面有细碎高光'],category:'required'},
    {title:'天际的颜色',start:12,end:17,evidenceTime:12.5,text:'远处，海面与淡粉色的天际相接。',insertStart:12.5,insertEnd:17,evidence:'远处海面与淡粉色天际相接，没有可辨认的人物或画面文字。',facts:['远处天际淡粉色'],category:'optional'},
    {title:'给风景一点留白',start:17,end:18,evidenceTime:17.2,text:'',insertStart:17,insertEnd:18,evidence:'最后一秒延续相同画面，无新增的必要视觉信息。',facts:[],category:'none'}
  ];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];const s={id:`s${i+1}`,...row,aiText:row.text,dialogue:'无对白；这段示例由静态海面照片缓慢推镜制作。',uncertainty:'',rev:1,textRev:1,reviewedRev:0,audio:null,suggestion:null,evidenceFile:p.poster};
    if(i!==3){const original=i===1?'narration-long.wav':`narration-${i+1}.wav`;const file=path.join(dir,original);await copyFile(path.join(root,'public',original),file);const audioInfo=await probe(file);s.audio={file,duration:audioInfo.duration,textRev:1,engine:'预制系统语音',voice:'Microsoft Huihui Desktop'};}
    p.scenes.push(s);
  }
  p.scenes[1].suggestion={text:'近处的浪峰隆起，水面泛着细碎的光。',reason:'保留浪峰与水面高光；去掉静态样片无法证明的运动方向。重新配音后检查实际时长。',baseTextRev:1,provenance:'预设示例建议',status:'pending'};
  p.windows=[{start:0,end:18}];p.transcript={text:'',segments:[]};
  await save(p);return p;
}
export async function registerUpload(id,filename,source,{guided=false}={}){
  const info=await verifyVideo(source);
  if(info.duration>(guided?3600.1:180.1))throw new Error(guided?'分段收听支持60分钟以内的视频':'当前制作工作台支持3分钟以内的视频');
  if(info.duration<.5)throw new Error('视频过短，请选择完整片段');
  const p=baseProject(id,filename.replace(/\.[^.]+$/,'').slice(0,100),source,info,'uploaded');
  p.sourceInfo=await sourceIdentity(source,p.title,p.duration);
  await save(p);return p;
}
export async function createStory(){
  const id=uid(),dir=projectDir(id);await mkdir(dir,{recursive:true});
  const source=path.join(dir,'source.mp4');
  try{await copyFile(path.join(root,'public','story','original.mp4'),source);}catch{throw new Error('作品素材正在准备，请先导入自己的短片');}
  const p=await registerUpload(id,'未说出口的信.mp4',source);
  p.poster=path.join(dir,'poster.jpg');await copyFile(path.join(root,'public','story','poster.jpg'),p.poster);
  p.sourceNote='原创剪纸动画，包含合成对白。AI 分析仅依据导入的画面与原声，人工确认后交付。';
  await save(p);return p;
}
export async function createLiveFilm(){
  const id=uid(),dir=projectDir(id);await mkdir(dir,{recursive:true});
  const source=path.join(dir,'source.mp4'),assets=path.join(root,'public','live-film');
  const metadata=JSON.parse(await readFile(path.join(assets,'metadata.json'),'utf8'));
  await copyFile(path.join(assets,'original.mp4'),source);
  const p=await registerUpload(id,metadata.clipTitle+'.mp4',source);
  p.poster=path.join(dir,'poster.jpg');await copyFile(path.join(assets,'poster.jpg'),p.poster);
  p.sourceInfo={...p.sourceInfo,...metadata};
  p.sourceNote=`${metadata.filmTitle} · ${metadata.credit}。${metadata.license}。截取原片 ${metadata.sourceStart}–${metadata.sourceEnd} 秒，保留原声，制作中文口述音轨。真人表演与视觉特效混合制作。`;
  await save(p);return p;
}
export async function importShowcase(){
  let seed;try{seed=JSON.parse(await readFile(path.join(root,'public','showcase','project.json'),'utf8'));}catch{return null;}
  const id=uid(),dir=projectDir(id);await mkdir(dir,{recursive:true});
  await cp(path.join(root,'public','showcase'),dir,{recursive:true});
  const resolve=file=>{if(!file)return file;const target=path.resolve(dir,file);if(!target.startsWith(dir+path.sep))throw new Error('作品包的媒体路径无效');return target;};
  seed.id=id;seed.source=resolve(seed.source);seed.poster=resolve(seed.poster);if(seed.audioOnly)seed.audioOnly=resolve(seed.audioOnly);if(seed.excerpt)seed.excerpt=resolve(seed.excerpt);seed.isShowcase=true;seed.archived=false;seed.feedback=[];seed.job=null;delete seed.audition;
  for(const s of [...seed.scenes,...seed.versions.flatMap(v=>v.scenes||[])]){if(s.audio)s.audio.file=resolve(s.audio.file);s.evidenceFile=resolve(s.evidenceFile);}
  for(const v of seed.versions)v.file=resolve(v.file);
  await save(seed);return seed;
}
function running(p){return p.job?.status==='running';}
function revisionCheck(p,revision){if(Number(revision)!==p.revision){const e=new Error('稿件已在其他操作中更新，请刷新后再保存');e.status=409;throw e;}}
function changed(p,s,textChanged){s.rev++;if(textChanged)s.textRev++;s.reviewedRev=0;p.revision++;p.fullReviewRev=0;}
export async function editScene(p,id,input){
  revisionCheck(p,input.revision);if(running(p))throw new Error('请等待当前处理完成后再修改脚本');const s=p.scenes.find(s=>s.id===id);if(!s)throw new Error('找不到该场景');
  const next={...s};
  if(typeof input.text==='string'){if(input.text.length>160)throw new Error('旁白请控制在 160 字以内');next.text=input.text.trim();}
  if(input.category!==undefined){if(!['required','optional','none','uncertain'].includes(input.category))throw new Error('无效的信息分类');next.category=input.category;}
  for(const key of ['insertStart','insertEnd'])if(input[key]!==undefined){const n=Number(input[key]);if(!Number.isFinite(n)||n<0||n>p.duration)throw new Error('插入时间必须在视频范围内');next[key]=n;}
  if(next.insertEnd<=next.insertStart)throw new Error('结束时间必须晚于开始时间');
  if(next.category!=='none'&&!next.text)throw new Error('此场景需要旁白，请填写文字或改为无需口述');
  if(input.timingOverride!==undefined)next.timingOverride=Boolean(input.timingOverride);
  const textChanged=next.text!==s.text;
  if(input.factResolution!==undefined){if(typeof input.factResolution!=='string'||input.factResolution.length>600)throw new Error('核实说明请控制在 600 字以内');next.factResolution=input.factResolution.trim();}else if(textChanged)next.factResolution='';
  if(textChanged||next.category!==s.category||next.insertStart!==s.insertStart||next.insertEnd!==s.insertEnd||next.timingOverride!==s.timingOverride||next.factResolution!==s.factResolution){Object.assign(s,next);s.manualEdited=true;p.manualEdited=true;changed(p,s,textChanged);await save(p);}
  return p;
}
export async function acceptSuggestion(p,id,revision){
  revisionCheck(p,revision);if(running(p))throw new Error('请等待当前处理完成后再修改脚本');const s=p.scenes.find(s=>s.id===id);
  if(!s?.suggestion||s.suggestion.baseTextRev!==s.textRev)throw new Error('建议对应的稿件已过期，请重新生成建议');
  if(s.suggestion.status!=='pending')throw new Error('这条建议已处理');
  s.text=s.suggestion.text;s.factResolution='';s.suggestion.status='accepted';s.manualEdited=true;p.manualEdited=true;changed(p,s,true);await save(p);return p;
}
export async function rejectSuggestion(p,id){const s=p.scenes.find(s=>s.id===id);if(!s?.suggestion)throw new Error('没有待处理建议');s.suggestion.status='rejected';await save(p);return p;}
export function startJob(p,type,worker,sceneId=null){
  if(running(p))throw new Error('当前作品正在处理，请等待完成或先取消');
  const id=uid(),controller=new AbortController();controllers.set(p.id,controller);
  p.job={id,type,sceneId,status:'running',stage:0,message:'任务已开始',startedAt:new Date().toISOString(),events:[],steps:{}};
  const job=p.job;
  const stage=async(index,message,details={})=>{if(controller.signal.aborted)throw new Error('任务已取消');const at=new Date().toISOString();job.stage=index;job.message=message;job.steps[index]={...job.steps[index],startedAt:job.steps[index]?.startedAt||at,...details,status:details.status||'running',message,updatedAt:at};job.events.push({time:at,stage:index,status:details.status||'running',message});await save(p);};
  const completion=save(p).then(()=>worker({signal:controller.signal,stage,id})).then(async()=>{job.status=controller.signal.aborted?'cancelled':'done';if(controller.signal.aborted)job.message='已取消；有效产物已保留';job.endedAt=new Date().toISOString();await save(p);}).catch(async error=>{job.status=controller.signal.aborted?'cancelled':'failed';job.message=controller.signal.aborted?'已取消；有效产物已保留':error.message;job.endedAt=new Date().toISOString();await save(p);}).catch(error=>console.error('Task state could not be saved:',error.code||'unknown')).finally(()=>{if(controllers.get(p.id)===controller)controllers.delete(p.id);activeJobs.delete(id);});
  activeJobs.set(id,completion);
  return p;
}
export async function cancelJob(p){const controller=controllers.get(p.id);if(controller){controller.abort();p.job.cancelRequested=true;p.job.message='正在停止处理，已完成的产物会保留';await save(p);}return p;}
async function fitSpeechEdges(p,s,signal){
  if(!p.listeningPreferences||!s.audio||s.audio.boundaryTrimChecked)return;
  const result=await trimSpeechEdges(s.audio.file,s.audio.file.replace(/\.wav$/i,'.trim.wav'),signal);
  s.audio={...s.audio,...result};if(result.boundaryTrim){s.rev++;p.revision++;s.reviewedRev=0;p.fullReviewRev=0;}await save(p);
}
async function synthesizeScene(p,s,signal){
  if(s.category==='none')return;
  const text=s.text,textRev=s.textRev,cfg=settings(),speed=p.listeningPreferences?.speed||1;
  const dir=path.join(projectDir(p.id),'speech');await mkdir(dir,{recursive:true});
  const hash=createHash('sha256').update(text+'|'+speed+'|'+cfg.ttsMode+'|'+(cfg.ttsMode==='local'?cfg.localVoice:cfg.ttsVoice)).digest('hex').slice(0,16);
  const output=cfg.ttsMode==='local'?await localSpeech(text,dir,{voice:cfg.localVoice,rate:Math.round((speed-1)*10),signal}):await cloudSpeech(text,path.join(dir,`remote-${hash}-${uid()}.wav`),signal,{speed,voice:p.listeningPreferences?.voice,filmId:p.parentListeningProject||p.id,promptHash:p.promptProfile?promptHash(p.promptProfile.entries):''});
  if(signal.aborted)throw new Error('任务已取消');
  if(s.textRev!==textRev)throw new Error('声音已生成，但稿件已更新。旧声音未覆盖当前稿，请重新配音');
  s.audio={...output,textRev,speed,engine:cfg.ttsMode==='local'?'本机中文配音':'在线配音',voice:cfg.ttsMode==='local'?cfg.localVoice:cfg.ttsVoice};
  s.rev++;s.reviewedRev=0;p.revision++;p.fullReviewRev=0;await save(p);
}
export function voiceScene(p,sceneId){
  requireScriptApproval(p);
  const s=p.scenes.find(s=>s.id===sceneId);if(!s||s.category==='none')throw new Error('该场景不需要配音');
  return startJob(p,'tts',async({signal,stage})=>{await stage(2,'正在合成这条旁白');await synthesizeScene(p,s,signal);await stage(3,problems(p).some(i=>i.scene===s.id)?'声音已生成，仍有时间问题需要处理':'声音已更新，请试听并确认');},sceneId);
}
export function suggestScene(p,sceneId){
  const s=p.scenes.find(s=>s.id===sceneId);if(!s)throw new Error('找不到场景');
  const textRev=s.textRev,snapshot=structuredClone(s);
  return startJob(p,'suggest',async({signal,stage})=>{
    await stage(1,'正在根据画面证据精简旁白');
    const value=p.provenance==='sample-annotated'&&s.id==='s2'?{text:'近处的浪峰隆起，水面泛着细碎的光。',reason:'保留浪峰和高光两项事实，去掉静态画面无法证明的运动方向。'}:await shorten(snapshot,signal,p.promptProfile);
    if(signal.aborted)throw new Error('任务已取消');
    s.suggestion={...value,baseTextRev:textRev,provenance:p.provenance==='sample-annotated'&&s.id==='s2'?'预设示例建议':'AI 生成建议',status:s.textRev===textRev?'pending':'stale'};
    await stage(1,s.textRev===textRev?'建议已就绪，由你决定是否采纳':'原稿已变化，这条建议已标为旧建议');
  },sceneId);
}
export async function approveScript(p,revision){
  revisionCheck(p,revision);
  if(running(p))throw new Error('请等待当前处理完成，再确认脚本');
  const review=scriptReview(p);
  if(review.issues.length)throw new Error(review.issues[0].label);
  if(review.approved)return p;
  p.scriptApproval={hash:scriptHash(p),revision:p.revision,approvedAt:new Date().toISOString()};
  await save(p);return p;
}
export function pipeline(p,input={}){
  const personal=input.purpose==='listen',produce=!personal&&input.stage==='produce';
  if(input.stage!==undefined&&!['analyze','produce'].includes(input.stage))throw new Error('无效制作阶段');
  if(produce){revisionCheck(p,input.revision);requireScriptApproval(p);}
  return startJob(p,'pipeline',async({signal,stage})=>{
    const dir=projectDir(p.id);
    if(!p.scenes.length){
      if(!settings().visionReady)throw new Error('视频理解服务尚未连接；当前素材已保留，服务配置完成后可以重试');
      await stage(0,'提取视频画面与原声音频');
      const frames=await extractFrames(p.source,path.join(dir,'frames'),p.duration,signal);p.poster=frames[0]?.file;p.analysisFrames=frames.map(({time,file})=>({time,file}));
      p.windows=await silentWindows(p.source,p.duration,p.hasAudio,signal);await save(p);
      if(p.hasAudio&&!p.transcript){await stage(0,'转写原始对白，保护原声信息');const file=await extractAudio(p.source,path.join(dir,'source-audio.wav'),signal);p.transcript=await transcribe(file,signal);}else if(!p.hasAudio)p.transcript={text:'无原始音轨',segments:[]};else await stage(0,'复用已完成的原声转写');
      if(p.transcript.segments.length){p.quietWindows=p.windows;p.windows=dialogueGaps(p.transcript.segments,p.duration);p.windowSource='dialogue-gaps';await stage(0,`已定位 ${p.transcript.segments.length} 段对白，按对白空隙安排旁白`);}else p.windowSource='quiet-gaps';
      await stage(0,`已提取 ${frames.length} 个画面，原声处理完成`,{status:'done'});
      await stage(1,'联合画面与原声，选择必要信息并编写旁白');
      const scenes=await analyze(frames,p.transcript,p.windows,p.duration,signal,{personal,preferences:p.listeningPreferences,promptProfile:p.promptProfile});
      if(signal.aborted)throw new Error('任务已取消');
      p.scenes=scenes.map(s=>({...s,aiText:s.text}));p.provenance='live-ai';p.aiRun={provider:settings().provider,model:settings().visionModel,frameCount:frames.length,analyzedAt:new Date().toISOString(),hasOriginalAudio:p.hasAudio};p.revision++;await save(p);
    } else if(personal) {
      await stage(1,p.provenance==='sample-annotated'?'采用样片预标注，开始真实配音':'复用已完成的场景分析');
      if(p.hasAudio&&p.windowSource==='dialogue-gaps'&&p.transcript?.alignmentVersion!==2){
        await stage(0,'更新对白定位，保留已完成的场景与配音');
        const file=await extractAudio(p.source,path.join(dir,'source-audio.wav'),signal);
        p.transcript=await transcribe(file,signal);p.transcript.alignmentVersion=2;
        p.windows=dialogueGaps(p.transcript.segments,p.duration);
        for(const s of p.scenes){s.dialogue=p.transcript.segments.filter(t=>t.start<s.end&&t.end>s.start).map(t=>t.text.trim()).join(' ')||'此段无识别出的对白，请结合原声音效核对。';changed(p,s,false);}
        await stage(1,`已重新定位 ${p.transcript.segments.length} 段对白，继续适配旁白`);
      }
    }
    if(!produce&&p.provenance==='live-ai'&&p.transcript?.text&&!p.transcript.segments?.length){
      const label='全片原声（未逐句定位）：'+p.transcript.text.slice(0,550);
      for(const s of p.scenes)if(s.dialogue!==label){s.dialogue=label;changed(p,s,false);}
      await save(p);
    }
    await stage(1,`已整理 ${p.scenes.length} 个场景与对应旁白`,{status:'done'});
    if(!personal&&!produce){await stage(1,'制作脚本已就绪，请核对并确认；尚未开始配音',{status:'waiting'});return;}
    // Group a dialogue-dense event with the following event before fitting speech.
    // Keep the original analysis as evidence; never move speech ahead of its facts.
    if(personal&&p.provenance==='live-ai'&&!p.scenes.some(s=>s.manualEdited)&&!p.narrationGrouping){
      const original=p.scenes.map(({id,title,start,end,text,category})=>({id,title,start,end,text,category})),merges=[];
      for(let i=0;i<p.scenes.length-1;i++){
        const s=p.scenes[i];if(s.category==='none')continue;
        const gap=()=>p.windows.some(w=>Math.min(w.end,s.end)-Math.max(w.start,s.start)>=1.8);
        while(!gap()&&i<p.scenes.length-1){
          const next=p.scenes[i+1];if(next.end-s.start>32||next.manualEdited)break;
          merges.push({kept:s.id,joined:next.id,start:s.start,end:next.end});
          s.end=next.end;s.title=`${s.title} / ${next.title}`.slice(0,100);s.evidence+='；'+next.evidence;s.facts=[...s.facts,...next.facts];
          s.text=[s.text,next.text].filter(Boolean).join('');s.aiText=s.text;
          s.uncertainty=[s.uncertainty,next.uncertainty].filter(Boolean).join('；');
          changed(p,s,true);p.scenes.splice(i+1,1);
        }
      }
      p.narrationGrouping={original,merges,createdAt:new Date().toISOString()};await save(p);
      if(merges.length)await stage(1,`已将 ${merges.length} 个对白密集片段并入连续事件，保留原始分析记录`,{status:'done'});
    }
    const narrationCount=p.scenes.filter(s=>s.category!=='none').length;
    await stage(2,`正在检查 ${narrationCount} 条旁白与声音`,{total:narrationCount});
    for(let i=0;i<p.scenes.length;i++){
      const s=p.scenes[i];if(s.category==='none')continue;
      if(personal&&p.provenance==='live-ai'&&!s.manualEdited){
        const candidates=p.windows.map(w=>({start:Math.max(w.start,s.start),end:Math.min(w.end,s.end)})).filter(w=>w.end-w.start>.7).sort((a,b)=>(b.end-b.start)-(a.end-a.start));
        const window=candidates[0];
        if(window&&(s.insertStart!==window.start||s.insertEnd!==window.end)){s.insertStart=window.start;s.insertEnd=window.end;changed(p,s,false);await save(p);}
        if(window&&s.text.length>Math.max(3,Math.floor((window.end-window.start)*3.4*(p.listeningPreferences?.speed||1))-1)&&s.audio?.textRev!==s.textRev){
          await stage(2,`正在按 ${Math.floor((window.end-window.start)*3.4*(p.listeningPreferences?.speed||1))-1} 字容量编排「${s.title}」`);
          const suggestion=await shorten({...structuredClone(s),speechSpeed:p.listeningPreferences?.speed||1},signal,p.promptProfile);if(signal.aborted)throw new Error('任务已取消');
          s.fitHistory??=[];s.fitHistory.push({before:s.text,window:window.end-window.start,after:suggestion.text,reason:suggestion.reason,phase:'before-speech'});
          s.text=suggestion.text;s.aiText=s.text;changed(p,s,true);await save(p);
        }
      }
      if(s.audio?.textRev!==s.textRev){await stage(2,`正在配音：${s.title}`,{total:narrationCount});await synthesizeScene(p,s,signal);}
      if(personal)await fitSpeechEdges(p,s,signal);
      for(let retry=0;retry<2&&personal&&p.provenance==='live-ai'&&!s.manualEdited&&s.audio.duration>s.insertEnd-s.insertStart+.015;retry++){
        await stage(2,`「${s.title}」声音超出窗口，正在进行第 ${retry+1}/2 次精简`);
        const expected=s.textRev;const suggestion=await shorten({...structuredClone(s),speechSpeed:p.listeningPreferences?.speed||1},signal,p.promptProfile);
        if(signal.aborted)throw new Error('任务已取消');
        if(s.textRev!==expected||s.manualEdited)throw new Error('稿件已由人工更新，自动精简结果已停止回填');
        s.fitHistory??=[];s.fitHistory.push({before:s.text,actualDuration:s.audio.duration,window:s.insertEnd-s.insertStart,after:suggestion.text,reason:suggestion.reason});
        s.text=suggestion.text;s.aiText=s.text;changed(p,s,true);await save(p);await synthesizeScene(p,s,signal);await fitSpeechEdges(p,s,signal);
      }
    }
    if(problems(p).some(issue=>!personal||issue.type!=='fact')){await stage(2,personal?'部分旁白仍有时长或原声冲突，已保存声音，暂未生成完整版本':'配音检查完成，请处理时长或原声冲突；已确认的脚本未被自动改写',{status:'blocked'});return;}
    await stage(2,`${narrationCount} 条旁白已通过时长与插入检查`,{status:'done',total:narrationCount});
    const kind=personal?'personal':'preview';
    await stage(3,'正在混音并验证成片');await renderSnapshot(p,kind,signal);await stage(3,'音轨、时长及全片解码检查通过',{status:'done'});await stage(4,personal?'个人口述版本已生成，未经人工审核':kind==='auto'?'自动初版已生成，请逐场景核对后交付':'当前稿件已生成审听版，请核对后交付',{status:'done'});
  });
}
export async function confirmScene(p,sceneId,revision){
  revisionCheck(p,revision);if(running(p))throw new Error('处理完成后再确认场景');
  const s=p.scenes.find(s=>s.id===sceneId);if(!s)throw new Error('找不到场景');
  const issue=problems(p).find(i=>i.scene===s.id);if(issue)throw new Error(`先处理当前问题：${issue.label}`);
  s.reviewedRev=s.rev;s.reviewedAt=new Date().toISOString();await save(p);return p;
}
export function auditionScene(p,sceneId){
  const s=p.scenes.find(s=>s.id===sceneId);if(!s||s.category==='none'||!s.audio||s.audio.textRev!==s.textRev)throw new Error('请先为当前稿件生成声音');
  if(s.insertStart+s.audio.duration>p.duration+.05)throw new Error('旁白超出片尾，请先调时或精简；仍可单独试听声音');
  return startJob(p,'audition',async({signal,stage,id})=>{
    const snapshot=structuredClone(p),scene=snapshot.scenes.find(s=>s.id===sceneId),revision=p.revision;
    const start=Math.max(0,Math.min(scene.start,scene.insertStart)-1.5),end=Math.min(p.duration,Math.max(scene.end,scene.insertStart+scene.audio.duration)+1.5);
    const dir=projectDir(p.id),full=path.join(dir,`audition-full-${id}.mp4`),file=path.join(dir,`audition-${id}.mp4`);
    await stage(2,'正在把这条旁白与前后原声合成试听片段');
    await mixVideo(snapshot.source,[scene],full,{duration:snapshot.duration,hasAudio:snapshot.hasAudio,originalVolume:snapshot.originalVolume,narrationVolume:snapshot.narrationVolume,duckLevel:snapshot.duckLevel??.35,signal});
    await trimVideo(full,file,start,end,signal);
    if(signal.aborted||p.revision!==revision)throw new Error('稿件已更新或任务已取消，请按当前版本重新试听');
    p.audition={sceneId,revision,start,end,file};await stage(3,'上下文试听已就绪，请听对白、音效与旁白是否清楚');
  },sceneId);
}
async function renderSnapshot(p,kind,signal){
  const snapshot=structuredClone(p),revision=p.revision,id=uid();
  const reviewWarnings=problems(snapshot);
  if(reviewWarnings.some(issue=>kind!=='personal'||issue.type!=='fact'))throw new Error('先处理声音过期、时间冲突和未确认事实，再进行混音');
  if(!snapshot.scenes.length)throw new Error('尚未生成场景与旁白');
  const file=path.join(projectDir(p.id),`render-${id}.mp4`);
  await mixVideo(snapshot.source,snapshot.scenes,file,{duration:snapshot.duration,hasAudio:snapshot.hasAudio,originalVolume:snapshot.originalVolume,narrationVolume:snapshot.narrationVolume,duckLevel:snapshot.duckLevel??.35,signal});
  if(signal.aborted)throw new Error('任务已取消');
  if(p.revision!==revision)throw new Error('混音期间稿件已更新。旧成片已隔离，请按最新修订重新合成');
  if(!p.sourceInfo){p.sourceInfo=await sourceIdentity(p.source,p.title,p.duration);await save(p);}
  const version={id,kind,revision,file,...(kind==='personal'?{reviewWarnings:structuredClone(reviewWarnings),requiresReview:true}:{}),createdAt:new Date().toISOString(),scenes:snapshot.scenes,duration:snapshot.duration,title:snapshot.title,sourceInfo:structuredClone(p.sourceInfo),sourceNote:p.sourceNote||'',originalVolume:snapshot.originalVolume,narrationVolume:snapshot.narrationVolume,duckLevel:snapshot.duckLevel??.35};
  p.versions.push(version);await save(p);return version;
}
export function renderPreview(p){requireScriptApproval(p);return startJob(p,'render',async({signal,stage})=>{await stage(3,'正在将当前旁白与原片真实混音');await renderSnapshot(p,'preview',signal);await stage(4,'审听版已生成并通过媒体检查，请完整播放确认');});}
export async function fullReview(p,revision,input={}){revisionCheck(p,revision);if(running(p))throw new Error('当前仍在处理，请等待完成');if(problems(p).length||p.scenes.some(s=>s.reviewedRev!==s.rev))throw new Error('请先处理全部问题并确认每个场景');const preview=p.versions.findLast(v=>v.kind==='preview'&&v.revision===p.revision);if(!preview)throw new Error('请先合成当前修订的审听版');if(input.previewId!==preview.id||!Number.isFinite(input.listenedSeconds)||input.listenedSeconds<p.duration*.9||input.listenedSeconds>p.duration+.25)throw new Error('请先完整播放当前审听版，再确认声音与节奏');p.fullReviewRev=p.revision;p.reviewRecord={revision:p.revision,previewId:preview.id,listenedSeconds:input.listenedSeconds,reviewedAt:new Date().toISOString()};await save(p);return p;}
export async function publish(p,revision){
  revisionCheck(p,revision);requireScriptApproval(p);if(running(p))throw new Error('当前仍在处理，请等待完成');
  if(problems(p).length||p.fullReviewRev!==p.revision||p.scenes.some(s=>s.reviewedRev!==s.rev))throw new Error('交付前需要完成问题处理、场景确认和当前版本整段审听');
  const existing=p.versions.find(v=>v.kind==='published'&&v.revision===p.revision);if(existing)return p;
  const preview=p.versions.findLast(v=>v.kind==='preview'&&v.revision===p.revision);if(!preview)throw new Error('缺少当前审听版');
  p.versions.push({...structuredClone(preview),scenes:structuredClone(p.scenes),id:uid(),kind:'published',number:p.versions.filter(v=>v.kind==='published').length+1,publishedAt:new Date().toISOString(),review:structuredClone(p.reviewRecord||{revision:p.revision,reviewedAt:new Date().toISOString()})});
  await save(p);return p;
}
export async function addFeedback(p,input){
  const version=p.versions.find(v=>v.id===input.version&&['published','auto','preview','personal'].includes(v.kind));if(!version)throw new Error('请选择有效的可播放版本');
  const time=Number(input.time);if(!Number.isFinite(time)||time<0||time>version.duration)throw new Error('反馈时间无效');
  const type=String(input.type||'其他').slice(0,30),text=String(input.text||'').trim().slice(0,1000);
  if(!text&&!type)throw new Error('请选择问题类型或补充说明');
  const key=String(input.requestId||uid()).slice(0,80);if(p.feedback.some(f=>f.requestId===key))return p;
  p.feedback.push({id:uid(),requestId:key,version:version.id,versionNumber:version.number??null,versionLabel:version.kind==='published'?`V${version.number}`:`${version.kind==='personal'?'AI 个人版':version.kind==='auto'?'AI 初版':'修订预览'} · ${version.id.slice(0,6)}`,time,type,text,status:'open',createdAt:new Date().toISOString()});await save(p);return p;
}
export async function resolveFeedback(p,id,input={}){const item=p.feedback.find(f=>f.id===id);if(!item)throw new Error('反馈不存在');const resolution=String(input.resolution||'').trim();if(!resolution||resolution.length>1000)throw new Error('请填写处理说明（1000 字以内）');if(input.resolvedVersion&&!p.versions.some(v=>v.kind==='published'&&v.id===input.resolvedVersion))throw new Error('请选择实际已交付的修订版本');item.status='resolved';item.resolution=resolution;item.resolvedAt=new Date().toISOString();item.resolvedVersion=input.resolvedVersion||null;await save(p);return p;}
export async function mixSettings(p,input){
  revisionCheck(p,input.revision);
  if(running(p))throw new Error('当前仍在处理，请等待完成后再调整混音');
  const next={originalVolume:p.originalVolume,narrationVolume:p.narrationVolume,duckLevel:p.duckLevel??.35};
  for(const key of Object.keys(next))if(input[key]!==undefined){
    const value=input[key],max=key==='duckLevel'?1:1.5;
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw new Error(key==='duckLevel'?'原声保留比例应为 0 至 100%':'音量范围应为 0 至 150%');
    next[key]=value;
  }
  if(Object.entries(next).every(([key,value])=>value===(p[key]??(key==='duckLevel'?.35:undefined))))return p;
  Object.assign(p,next);p.revision++;p.fullReviewRev=0;p.scenes.forEach(s=>s.reviewedRev=0);
  await save(p);return p;
}

export function deliveryManifest(p,versionId){const clean=publicProject(p),v=clean.versions.find(v=>v.id===versionId&&v.kind==='published');if(!v)throw new Error('交付版本不存在');return {schema:'aimedia-delivery/2',project:p.id,title:v.title,versionId:v.id,version:v.number,revision:v.revision,duration:v.duration,source:v.sourceInfo||null,sourceNote:v.sourceNote||'',review:v.review||null,provenance:p.provenance,video:v.url,scenes:v.scenes.map(s=>({id:s.id,eventStart:s.start,eventEnd:s.end,evidenceTime:s.evidenceTime,evidence:s.evidence,evidenceUrl:s.evidenceUrl,facts:s.facts,uncertainty:s.uncertainty||'',factResolution:s.factResolution||'',reviewed:s.reviewedRev===s.rev,reviewedAt:s.reviewedAt||null,text:s.text,insertStart:s.insertStart,insertEnd:s.insertEnd,audio:s.audio||null,category:s.category})),publishedAt:v.publishedAt};}
