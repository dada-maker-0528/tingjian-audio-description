import {DEFAULT_VOICE,isVoice} from './voices.js';
export const defaults = () => ({speed:'normal',gain:0.88,density:'balanced',voice:DEFAULT_VOICE});
export function changeNarrationVoice(task,voice){
 if(!isVoice(voice))throw new Error('不支持这个音色。');
 if((task.candidate.voice||DEFAULT_VOICE)===voice)return false;
 task.candidate={...task.candidate,voice};task.version++;task.verifiedVersion=null;
 if(task.stage==='medium'){task.mediumEdited=true;task.mediumConfirmedVersion=null;}
 task.updated=Date.now();return true;
}
export function newTask(film={title:'新视频',id:'unknown'}){return {id:'film-'+Date.now(),assetId:film.id,title:film.title+' · 我的口述版',stage:'roles',version:1,candidate:defaults(),confirmed:null,mediumEdited:false,mediumConfirmedVersion:null,verifiedVersion:null,completed:false,saved:false,chat:[],updated:Date.now()};}
export function confirmStage(task){
  if(task.completed)throw new Error('这个任务已经完成。');
  const stage=task.stage;
  if(stage==='roles'){task.stage='short';return 'short';}
  if(stage==='short'){task.confirmed={...task.candidate,version:task.version};task.stage='medium';return 'medium';}
  if(stage==='medium'){
    task.confirmed={...task.candidate,version:task.version};
    task.mediumConfirmedVersion=task.version;
    if(task.mediumEdited){task.stage='verify';return 'verify';}
    task.stage='full';return 'full';
  }
  if(stage==='verify'){
    task.verifiedVersion=task.version;
    task.confirmed={...task.candidate,version:task.version};
    task.stage='full';return 'full';
  }
  throw new Error('当前阶段尚不能确认。');
}
export function canComplete(task){
  return task.stage==='full' && task.confirmed?.version===task.version && (task.mediumEdited ? task.verifiedVersion===task.version && task.mediumConfirmedVersion!==null : task.mediumConfirmedVersion===task.version);
}
export function applyFeedback(task,text){
  if(!['short','medium','verify'].includes(task.stage))return {ok:false,message:'当前演示支持在试听阶段调整旁白。人物称呼已按短片中的对白预设。'};
  if(/只改|只修改|这句话|那句话|这一句|那一句|改名|称呼/.test(text))return {ok:false,message:'这条意见已记录。当前 Demo 暂未准备单句或角色称呼修改的音频版本，原设置保持不变。可以试听现有版本，或调整整段旁白的语速、音量和描述量。'};
  const s={...task.candidate};const changes=[];
  if(/慢|太快/.test(text)){s.speed='slow';changes.push('旁白语速稍慢');}
  if(/正常语速|恢复语速/.test(text)){s.speed='normal';changes.push('旁白恢复自然语速');}
  if(/旁白.*(大声|太小|小了|听不清)|提高旁白|大声一点/.test(text)){s.gain=1;changes.push('旁白音量更清晰');}
  if(/少说|少一点|太多|有点多|精简|简洁/.test(text)){s.density='concise';changes.push('描述更简洁');}
  if(/恢复描述|完整描述/.test(text)){s.density='balanced';changes.push('恢复适中的信息量');}
  if(changes.length===0){
    if(/声音.*小|声音.*大/.test(text))return {ok:false,clarify:true,message:'你想调整旁白音量吗？可以选择“旁白大声一点”。'};
    return {ok:false,message:'这条意见已记录，当前 Demo 暂未准备对应修改结果。可以试试“旁白慢一点”“旁白大声一点”或“描述少一点”。'};
  }
  if(JSON.stringify(s)===JSON.stringify(task.candidate))return {ok:false,message:'当前样片已经使用这组设置，可以直接试听。'};
  task.candidate=s;task.version++;task.verifiedVersion=null;
  if(task.stage==='medium'){task.mediumEdited=true;task.mediumConfirmedVersion=null;}
  task.updated=Date.now();
  return {ok:true,changes,message:'好的，'+changes.join('，')+'。只调整口述旁白，原片对白、音乐和画面速度保持不变。请试听新版；确认满意后，这组设置才会用于后续片段。'};
}
