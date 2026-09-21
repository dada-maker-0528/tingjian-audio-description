import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root } from './media.mjs';
import { scriptReview } from './script-review.mjs';

export const dataRoot=path.resolve(process.env.AIMEDIA_DATA_DIR||path.join(root,'.aimedia'));
let saveHook=null;
export function setSaveHook(callback){saveHook=callback;}
export const projects=new Map();
export function projectDir(id){if(!/^[a-zA-Z0-9-]{1,64}$/.test(id))throw new Error('无效作品标识');return path.join(dataRoot,'projects',id);}
export async function initializeStore(){
  await mkdir(path.join(dataRoot,'projects'),{recursive:true});
  for(const id of await readdir(path.join(dataRoot,'projects'))){
    try{const p=JSON.parse(await readFile(path.join(projectDir(id),'project.json'),'utf8'));if(p.job?.status==='running'){p.job.status='interrupted';p.job.message='服务重新启动，已保留有效产物，可重试此阶段';}if(p.listening?.status==='generating'){p.listening.status='interrupted';p.listening.message='服务已重启，按1继续当前片段，已完成的分段会保留';p.listening.revision++;}if(p.workflow?.status==='generating'){p.workflow.status='interrupted';p.workflow.message='服务已重启，已完成的分段保留，请选择继续制作。';p.workflow.revision++;}projects.set(id,p);}catch{}
  }
}
const writes=new Map();
export async function save(p){
  p.updatedAt=new Date().toISOString();projects.set(p.id,p);
  const text=JSON.stringify(p,null,2),snapshot=JSON.parse(text),dir=projectDir(p.id);
  const previous=writes.get(p.id)||Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{await mkdir(dir,{recursive:true});const temp=path.join(dir,`state-${randomUUID()}.tmp`);await writeFile(temp,text,'utf8');await rename(temp,path.join(dir,'project.json'));if(saveHook)await saveHook(snapshot);});
  writes.set(p.id,next);await next;
}
export function getProject(id){const p=projects.get(id);if(!p){const e=new Error('作品不存在');e.status=404;throw e;}return p;}
export function assetUrl(p,file){const rel=path.relative(projectDir(p.id),file);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('媒体文件超出作品目录');return `/media/${p.id}/${rel.split(path.sep).map(encodeURIComponent).join('/')}`;}
export function problems(p){
  const list=[];
  for(const s of p.scenes||[]){
    if(s.category==='uncertain')list.push({scene:s.id,type:'fact',label:'视觉事实待确认'});
    if(s.uncertainty?.trim()&&!s.factResolution?.trim())list.push({scene:s.id,type:'fact',label:'请核实画面疑点并填写处理说明'});
    if(s.category==='none')continue;
    if(!s.text.trim()){list.push({scene:s.id,type:'missing',label:'缺少必要旁白'});continue;}
    if(s.insertStart<s.start-.05)list.push({scene:s.id,type:'early',label:'旁白早于对应场景，请调整插入位置'});
    if(!s.audio||s.audio.textRev!==s.textRev){list.push({scene:s.id,type:'stale',label:s.audio?'文字已修改，声音待更新':'尚未生成旁白声音'});continue;}
    if(s.audio.duration>s.insertEnd-s.insertStart+.015)list.push({scene:s.id,type:'conflict',label:`旁白超出窗口 ${(s.audio.duration-s.insertEnd+s.insertStart).toFixed(2)} 秒`});
    if(s.insertStart+s.audio.duration>p.duration+.05)list.push({scene:s.id,type:'conflict',label:'旁白超过原片末尾'});
    if(p.provenance==='live-ai'&&p.hasAudio&&!s.timingOverride&&!p.windows?.some(w=>s.insertStart>=w.start-.05&&s.insertStart+s.audio.duration<=w.end+.05))list.push({scene:s.id,type:'protected',label:'插入位置不在原声候选空隙，请调整或连同原片试听'});
  }
  const active=(p.scenes||[]).filter(s=>s.category!=='none'&&s.audio?.textRev===s.textRev).sort((a,b)=>a.insertStart-b.insertStart);
  for(let i=1;i<active.length;i++)if(active[i-1].insertStart+active[i-1].audio.duration>active[i].insertStart+.015)list.push({scene:active[i].id,type:'overlap',label:'与上一条旁白重叠'});
  return list;
}
export function publicProject(p){
  const result=structuredClone(p);
  delete result.source;
  delete result.reference;
  result.sourceUrl=assetUrl(p,p.source);
  if(p.audioOnly)result.audioOnlyUrl=assetUrl(p,p.audioOnly);delete result.audioOnly;
  if(p.excerpt)result.excerptUrl=assetUrl(p,p.excerpt);delete result.excerpt;
  result.posterUrl=p.poster?assetUrl(p,p.poster):null;delete result.poster;
  if(result.analysisFrames)result.analysisFrames=result.analysisFrames.map(({time,file})=>({time,url:assetUrl(p,file)}));
  result.problems=problems(p);
  result.scriptReview=scriptReview(p);
  if(result.audition){if(result.audition.revision===p.revision){result.audition.url=assetUrl(p,result.audition.file);delete result.audition.file;}else result.audition=null;}
  for(const s of result.scenes||[]){if(s.audio){s.audio.url=assetUrl(p,s.audio.file);delete s.audio.file;}if(s.evidenceFile){s.evidenceUrl=assetUrl(p,s.evidenceFile);delete s.evidenceFile;}}
  for(const v of result.versions||[]){v.url=assetUrl(p,v.file);delete v.file;for(const s of v.scenes||[]){if(s.audio){s.audio.url=assetUrl(p,s.audio.file);delete s.audio.file;}if(s.evidenceFile)s.evidenceUrl=assetUrl(p,s.evidenceFile);delete s.evidenceFile;}}
  result.pendingReviews=(p.scenes||[]).filter(s=>s.reviewedRev!==s.rev).length;
  result.preview=(result.versions||[]).findLast(v=>v.kind==='preview'&&v.revision===p.revision)||null;
  result.published=(result.versions||[]).filter(v=>v.kind==='published');
  return result;
}
