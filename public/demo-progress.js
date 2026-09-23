import {validateScenePlan} from './scene-plan.js';
// Preset data stays separate from actual media and speech results.
import {checkMedia,TASK_TIMING} from './task-progress.js';
export function demoPlan({kind,film,start=0,duration=7,settings,videoURL,prepareNarration}){
 const cues=film.narration?.[settings.speed+'-'+settings.density]||[];
 if(kind==='analyzing')return [
  {start:'读取视频信息',complete:'视频信息已就绪',run:async({signal,log,node})=>{
   node('presetMedia','读取当前素材，确认视频时长与媒体是否可用。',{source:'preset_demo',duration_seconds:film.duration});
   await checkMedia(videoURL,'video',signal);log('已读取视频元数据',{metadata:'ready',playback_rate:1});
  }},
  {start:'加载人物介绍',complete:'人物介绍已加载',run:async({log,node})=>{
   if(!film.roles?.length)throw new Error('缺少人物预设');
   node('presetRoles','载入人物资料，检查介绍文字与对应画面。',{source:'preset_roles',role_count:film.roles.length});
   log('人物说明与对应画面已匹配',{introductions:film.roles.filter(r=>r.detail).length,portraits:film.roles.filter(r=>r.image).length});
  }},
  {start:'加载镜头与场景',complete:'镜头与场景已加载',run:async({log,node})=>{
   const scenes=validateScenePlan(film);
   node('presetScenes','检查完整场景按原片顺序连续覆盖影片。',{scene_count:scenes.length,duration_seconds:film.duration});
   log('试听沿用完整场景范围',{first_scene:scenes[0].id,flow:['first_scene','continuous_scenes','full']});
  }},
  {start:'读取旁白时间轴',complete:'影片资料已准备好',run:async({log,node})=>{
   if(!film.narration)throw new Error('缺少旁白预设');
   node('presetTimeline','按当前设置读取旁白时间轴，准备进入人物介绍。',{narration_cues:cues.length,original_speed:1,analysis_source:'preset'});
   log('人物与试听入口已准备',{next:'role_introduction',requires_confirmation:true});
  }},
 ];
 if(film.audioMode==='mixed-narration'){
  let selectedScenes=[],metadataReady=false;
  return [
   {start:'核对场景范围',complete:'本次完整场景范围已核对',run:async({log,node})=>{
    const scenes=validateScenePlan(film);
    const clipEnd=start+duration;
    selectedScenes=scenes.filter(scene=>scene.start<clipEnd&&scene.end>start);
    node('mixedRange','读取已有成片的场景清单，确定这次试听的起止位置。',{
     source:'prebuilt_mixed_video',selected_scene_count:selectedScenes.length,
     total_scene_count:scenes.length,scene_ids:selectedScenes.map(scene=>scene.id),
     clip_start:start,clip_end:clipEnd,content_seconds:duration,
    });
    log('场景名称与顺序',{scenes:selectedScenes.map(scene=>({title:scene.title,start:scene.start,end:scene.end}))});
   }},
   {start:'读取成片媒体信息',complete:'成片媒体信息读取成功',run:async({signal,log,node})=>{
    node('mixedMedia','读取视频元数据，检查媒体能否加载以及时长是否有效。');
    await checkMedia(videoURL,'video',signal);
    metadataReady=true;
    log('本次媒体读取结果',{metadata:'ready',duration_check:'finite_positive',resource:'prebuilt_mixed_video'});
    log('沿用交付成片中的原声与旁白',{audio:'embedded',extra_narration:false,synthesis:false});
   }},
   {start:'准备场景试听参数',complete:'本次场景可以试听',run:async({log,node})=>{
    const playback={
     scene_count:selectedScenes.length,
     scene_ids:selectedScenes.map(scene=>scene.id),
     clip_start:start,
     clip_end:start+duration,
     content_seconds:duration,
     playback_rate:1,
     audio_source:'embedded_in_video',
     extra_narration:false,
     metadata_ready:metadataReady,
    };
    node('mixedPlayback','核对试听范围、原速播放和成片内置声音，再开放试听入口。',playback);
    log('视频已准备好，等待你开始试听',{next:'scene_preview',requires_confirmation:true});
   }},
  ];
 }
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
