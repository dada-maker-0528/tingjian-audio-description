import {hasStageMedia,extensionReady,secondSceneReady,assembledMediaReady} from './stage-media.js';
import {DEFAULT_VOICE,isVoice} from './voices.js';
import {validateScenePlan} from './scene-plan.js';
export const defaults = () => ({speed:'normal',gain:0.88,density:'balanced',voice:DEFAULT_VOICE});
export function copySettings(settings){const {speed,gain,density,voice}={...defaults(),...settings};return {speed,gain,density,voice};}
export function changeNarrationVoice(task,voice){
 if(!isVoice(voice))throw new Error('不支持这个音色。');
 if((task.candidate.voice||DEFAULT_VOICE)===voice)return false;
 task.candidate={...task.candidate,voice};task.version++;
 if(['short','medium'].includes(task.stage))task.confirmedSceneCount=0;
 if(task.stage==='full-review'){task.renderedVersion=null;task.confirmed=null;}
 task.updated=Date.now();return true;
}
export function newTask(film){const totalScenes=validateScenePlan(film).length;return {id:'film-'+Date.now(),mediaPlan:hasStageMedia(film),assetId:film.id,title:film.title+' · 我的口述版',stage:'roles',version:1,candidate:defaults(),confirmed:null,scenePlanVersion:film.scenePlanVersion,totalScenes,sceneCount:1,confirmedSceneCount:0,completed:false,saved:false,chat:[],updated:Date.now()};}
export function migrateTaskToScenes(task,film){
 if(!task||task.completed)return task;
 const totalScenes=task.mediaScene==='s2'?2:validateScenePlan(film).length;
 if(task.scenePlanVersion===film.scenePlanVersion&&['roles','short','medium','full'].includes(task.stage)){
  const mediaPlan=hasStageMedia(film);
  return {...task,mediaPlan,totalScenes,sceneCount:Math.max(1,Math.min(totalScenes,Number(task.sceneCount)||1)),confirmedSceneCount:mediaPlan&&task.stage==='medium'&&task.mediaScene!=='s2'?0:task.confirmedSceneCount};
 }
 const {mediumEdited,mediumConfirmedVersion,verifiedVersion,...kept}=task;
 return {...kept,mediaPlan:hasStageMedia(film),stage:task.stage==='roles'?'roles':'short',version:(Number(task.version)||1)+1,scenePlanVersion:film.scenePlanVersion,totalScenes,sceneCount:1,confirmedSceneCount:0,confirmed:null,sceneMigrationNotice:'制作已更新为按完整场景确认，保留你的旁白设置，请先试听第一个场景。'};
}
export function confirmStage(task,direction='full'){
  if(task.completed)throw new Error('这个任务已经完成。');
  const stage=task.stage;
  if(stage==='roles'){task.sceneCount=1;task.stage='short';return 'short';}
  if(stage==='short'||stage==='medium'){
    if(!Number.isInteger(task.sceneCount)||task.sceneCount<1||task.sceneCount>task.totalScenes)throw new Error('当前场景范围不正确，请重新选择视频。');
    if(task.mediaPlan&&stage==='medium'&&task.mediaScene!=='s2'){
     if(!secondSceneReady({id:task.assetId}))throw new Error('下一个场景的视频还未就绪。');
     task.confirmed={...task.candidate,version:task.version};task.confirmedSceneCount=1;
     task.mediaScene='s2';task.totalScenes=2;task.sceneCount=2;return 'medium';
    }
    if(task.mediaPlan&&stage==='medium'&&!assembledMediaReady({id:task.assetId}))throw new Error('完整成片还在准备中，当前场景已保留。');
    task.confirmed=task.mediaPlan&&stage==='short'?null:{...task.candidate,version:task.version};
    task.confirmedSceneCount=task.mediaPlan&&stage==='short'?0:task.sceneCount;
    if(stage==='short'&&(task.mediaPlan||task.totalScenes>1)){task.sceneCount=Math.min(3,task.totalScenes);task.stage='medium';return 'medium';}
    if(stage==='medium'&&direction==='next'&&task.sceneCount<task.totalScenes){task.sceneCount++;return 'medium';}
    task.stage='full';return 'full';
  }
  throw new Error('当前阶段尚不能确认。');
}
export function canComplete(task){
  return task.stage==='full'&&task.totalScenes>0&&task.confirmed?.version===task.version&&task.confirmedSceneCount>=Math.min(3,task.totalScenes);
}
export function applyFeedback(task,text){
  if(!['short','medium'].includes(task.stage))return {ok:false,message:'请在场景试听阶段调整旁白。人物称呼已按短片中的对白预设。'};
  const proposal=proposeFeedback(task.candidate,text);if(!proposal.ok)return proposal;
  task.candidate=proposal.settings;task.version++;task.confirmedSceneCount=0;
  task.updated=Date.now();
  return {...proposal,message:'已确认修改，正在生成新版。请试听后再确认后续片段。'};
}
export function proposeFeedback(settings,text){
  if(/只改|只修改|这句话|那句话|这一句|那一句|改名|称呼/.test(text))return {ok:false,message:'这条意见已记录。当前 Demo 暂未准备单句或角色称呼修改的音频版本，原设置保持不变。可以试听现有版本，或调整整段旁白的语速、音量和描述量。'};
  const current=copySettings(settings),s={...current};const changes=[];
  if(/慢|太快/.test(text)){s.speed='slow';changes.push('旁白语速稍慢');}
  if(/正常语速|恢复语速/.test(text)){s.speed='normal';changes.push('旁白恢复自然语速');}
  if(/旁白.*(大声|太小|小了|听不清)|提高旁白|大声一点/.test(text)){s.gain=1;changes.push('旁白音量更清晰');}
  if(/少说|少一点|太多|有点多|精简|简洁/.test(text)){s.density='concise';changes.push('描述更简洁');}
  if(/恢复描述|完整描述/.test(text)){s.density='balanced';changes.push('恢复适中的信息量');}
  if(changes.length===0){
    if(/声音.*小|声音.*大/.test(text))return {ok:false,clarify:true,message:'你想调整旁白音量吗？可以选择“旁白大声一点”。'};
    return {ok:false,message:'这条意见已记录，当前 Demo 暂未准备对应修改结果。可以试试“旁白慢一点”“旁白大声一点”或“描述少一点”。'};
  }
  if(JSON.stringify(s)===JSON.stringify(current))return {ok:false,message:'当前视频已经使用这组设置，可以直接试听，或提出其他修改。'};
  return {ok:true,settings:s,changes,message:'本次修改：'+changes.join('，')+'。请确认修改，之后自动收起对话并重新生成。'};
}
export function newFullRevision(source,film,settings,history=[]){
 if(source.assetId&&source.assetId!==film.id)throw new Error('修改对象与当前影片不一致。');
 const editing=source.stage==='full-review'&&!source.completed;
 const rawVersion=Number(source.version||source.settings?.version||source.confirmed?.version||1);
 const previousVersion=Number.isFinite(rawVersion)&&rawVersion>0?rawVersion:1,version=previousVersion+1;
 const baseTitle=source.baseTitle||String(source.title||film.title).replace(/ · 第 \d+ 版$/,'');
 const original=editing?source.sourceSnapshot:{id:source.id,assetId:film.id,title:source.title||film.title,settings:{...copySettings(source.settings||source.confirmed||source.candidate),version:previousVersion},version:previousVersion,position:source.position||0,created:source.created||Date.now()};
 return {id:editing?source.id:'revision-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),assetId:film.id,sourceId:source.sourceId||source.id,sourceSnapshot:original?{...original,settings:{...original.settings}}:null,baseTitle,title:`${baseTitle} · 第 ${version} 版`,stage:'full-review',version,candidate:copySettings(settings),confirmed:null,renderedVersion:null,completed:false,saved:false,chat:history.map(m=>({...m})),updated:Date.now()};
}
export function markFullRevisionReady(task,version){
 if(task.stage!=='full-review'||task.version!==version||task.completed)return false;
 task.renderedVersion=version;return true;
}
export function acceptFullRevision(task){
 if(task.stage!=='full-review'||task.renderedVersion!==task.version||task.completed)throw new Error('新版尚未准备好，请完成生成并试听后再保存。');
 task.confirmed={...copySettings(task.candidate),version:task.version};task.completed=true;task.saved=false;task.updated=Date.now();
 return {id:task.id,assetId:task.assetId,title:task.title,version:task.version,sourceId:task.sourceId,settings:{...task.confirmed},position:0,created:Date.now()};
}
