import {validateScenePlan} from './scene-plan.js';
// Preset data stays separate from actual media and speech results.
import {checkMedia,TASK_TIMING} from './task-progress.js';
export function demoPlan({kind,film,start=0,duration=7,settings,videoURL,prepareNarration}){
 const cues=film.narration?.[settings.speed+'-'+settings.density]||[];
 if(kind==='analyzing')return [
  {start:'读取演示视频信息',complete:'演示视频信息已就绪',run:async({signal,log,node})=>{
   node('presetMedia','先读取演示素材，再确认视频时长与媒体是否可用。',{source:'preset_demo',duration_seconds:film.duration});
   await checkMedia(videoURL,'video',signal);log('已读取视频元数据',{metadata:'ready',playback_rate:1});
  }},
  {start:'加载预设人物介绍',complete:'预设人物介绍已加载',run:async({log,node})=>{
   if(!film.roles?.length)throw new Error('缺少人物预设');
   node('presetRoles','接下来载入预设人物，检查介绍文字与对应画面。',{source:'preset_roles',role_count:film.roles.length});
   log('人物说明与对应画面已匹配',{introductions:film.roles.filter(r=>r.detail).length,portraits:film.roles.filter(r=>r.image).length});
  }},
  {start:'加载预设镜头与场景',complete:'预设镜头与场景已加载',run:async({log,node})=>{
   const scenes=validateScenePlan(film);
   node('presetScenes','检查完整场景按原片顺序连续覆盖影片。',{scene_count:scenes.length,duration_seconds:film.duration});
   log('试听沿用完整场景范围',{first_scene:scenes[0].id,flow:['first_scene','continuous_scenes','full']});
  }},
  {start:'读取预设旁白时间轴',complete:'演示分析已准备好',run:async({log,node})=>{
   if(!film.narration)throw new Error('缺少旁白预设');
   node('presetTimeline','再按语速与描述量选取预设时间轴，准备进入人物介绍。',{narration_cues:cues.length,original_speed:1,analysis_source:'preset'});
   log('人物与试听入口已准备',{next:'role_introduction',requires_confirmation:true});
  }},
 ];
 let audio;
 return [
  {start:'读取本次旁白配置',complete:'本次旁白设置已应用',run:async({log,node})=>{
   if(!settings?.voice||!['normal','slow'].includes(settings.speed))throw new Error('无效设置');
   node('settings','先校验当前音色与语速，将描述量绑定到本次旁白版本。',{voice:settings.voice,speed:settings.speed,gain:settings.gain,density:settings.density});
   node('range','接着定位试听起止时间，筛选落在当前范围内的旁白。',{start_seconds:start,end_seconds:start+duration,content_seconds:duration});
   log('保留原片播放与声音设置',{video_playback_rate:1,original_audio:'preserved'});
  }},
  {start:kind==='full'?'准备完整影片的旁白版本':'匹配本次样片版本',complete:'对应旁白音轨已准备好',run:async({signal,log,node})=>{
   log('从预设时间轴选取本段旁白',{cue_count:cues.filter(c=>c.start>=start&&c.start<start+duration).length,script_source:'preset_demo'});
   node('narration','使用当前已配置的旁白来源：在线语音或本地演示音轨。');
   audio=await prepareNarration(AbortSignal.any([signal,AbortSignal.timeout(TASK_TIMING.timeoutMs)]));
   node('audioReady','已取得旁白音轨，保留播放引用，进入播放器时直接复用。',{provider:audio.provider,returned_cues:audio.cues.length,audio:'ready'});
   log('旁白返回，进入媒体检查');
  }},
  {start:'检查视频与旁白播放资源',complete:'播放资源已检查，可以试听',run:async({signal,log,node})=>{
   node('media','同时读取视频和旁白的媒体信息，检查两路资源是否可以播放。');
   await Promise.all([checkMedia(videoURL,'video',signal),checkMedia(audio.url,'audio',signal)]);
   node('mediaReady','两路媒体检查通过，清理检查监听并准备交给播放器。',{video:'ready',narration:'ready',metadata_check:'passed'});
   log('播放器初始化参数',{clip_start:start,clip_end:start+duration,playback_rate:1});
  }},
 ];
}
