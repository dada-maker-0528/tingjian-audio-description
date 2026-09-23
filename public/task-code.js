// Source excerpts explain the implementation; producer events report actual results.
const snippets={
"mixedRange":{
  "source": "demo-progress.js",
  "lines": [
    "    const scenes=validateScenePlan(film);",
    "    const clipEnd=start+duration;",
    "    selectedScenes=scenes.filter(scene=>scene.start<clipEnd&&scene.end>start);",
    "    node('mixedRange','读取已有成片的场景清单，确定这次试听的起止位置。',{",
    "     source:'prebuilt_mixed_video',selected_scene_count:selectedScenes.length,",
    "     total_scene_count:scenes.length,scene_ids:selectedScenes.map(scene=>scene.id),",
    "     clip_start:start,clip_end:clipEnd,content_seconds:duration,",
    "    });"
  ]
},
"mixedMedia":{
  "source": "task-progress.js",
  "lines": [
    "export function checkMedia(url,kind,signal,expectedDuration){",
    " return new Promise((resolve,reject)=>{",
    "  const media=document.createElement(kind);let timer;",
    "  const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);media.onloadedmetadata=media.onerror=null;media.removeAttribute('src');media.load();error?reject(error):resolve();};",
    "  const abort=()=>finish(new DOMException('已取消','AbortError'));",
    "  if(signal?.aborted){abort();return;}",
    "  signal?.addEventListener('abort',abort,{once:true});",
    "  media.preload='metadata';media.onloadedmetadata=()=>finish(Number.isFinite(media.duration)&&media.duration>0&&(!Number.isFinite(expectedDuration)||Math.abs(media.duration-expectedDuration)<.15)?null:new Error('媒体时长无效或与对应版本不一致'));media.onerror=()=>finish(new Error('媒体读取失败'));",
    "  timer=setTimeout(()=>finish(new DOMException('媒体读取超时','TimeoutError')),15000);media.src=url;",
    " });",
    "}"
  ]
},
"mixedPlayback":{
  "source": "demo-progress.js",
  "lines": [
    "    const playback={",
    "     scene_count:selectedScenes.length,",
    "     scene_ids:selectedScenes.map(scene=>scene.id),",
    "     clip_start:start,",
    "     clip_end:start+duration,",
    "     content_seconds:duration,",
    "     playback_rate:1,",
    "     audio_source:'embedded_in_video',",
    "     extra_narration:false,",
    "     metadata_ready:metadataReady,",
    "    };",
    "    node('mixedPlayback','核对试听范围、原速播放和成片内置声音，再开放试听入口。',playback);"
  ]
},
  "presetMedia": {
    "source": "demo-progress.js",
    "lines": [
      "node('presetMedia','读取当前素材，确认视频时长与媒体是否可用。',{source:'preset_demo',duration_seconds:film.duration});",
      "   await checkMedia(videoURL,'video',signal);log('已读取视频元数据',{metadata:'ready',playback_rate:1});"
    ]
  },
  "presetRoles": {
    "source": "demo-progress.js",
    "lines": [
      "if(!film.roles?.length)throw new Error('缺少人物预设');",
      "   node('presetRoles','载入人物资料，检查介绍文字与对应画面。',{source:'preset_roles',role_count:film.roles.length});",
      "   log('人物说明与对应画面已匹配',{introductions:film.roles.filter(r=>r.detail).length,portraits:film.roles.filter(r=>r.image).length});"
    ]
  },
  "presetScenes": {
    "source": "scene-plan.js",
    "lines": [
      "export function validateScenePlan(film){",
      " const scenes=film.scenes;",
      " if(!film.scenePlanVersion||!Array.isArray(scenes)||!scenes.length)throw new Error('影片尚未准备场景划分。');",
      " let end=0;const ids=new Set();",
      " for(const scene of scenes){",
      "  if(!scene.id||ids.has(scene.id)||!scene.title||!Number.isFinite(scene.start)||!Number.isFinite(scene.end)||scene.end<=scene.start||Math.abs(scene.start-end)>.001)throw new Error('场景必须按原片顺序连续排列，并有独立名称。');",
      "  ids.add(scene.id);end=scene.end;",
      " }",
      " if(Math.abs(end-film.duration)>.001)throw new Error('场景划分必须完整覆盖影片。');",
      " return scenes;",
      "}"
    ]
  },
  "presetTimeline": {
    "source": "demo-progress.js",
    "lines": [
      "if(!film.narration)throw new Error('缺少旁白预设');",
      "   node('presetTimeline','按当前设置读取旁白时间轴，准备进入人物介绍。',{narration_cues:cues.length,original_speed:1,analysis_source:'preset'});",
      "   log('人物与试听入口已准备',{next:'role_introduction',requires_confirmation:true});"
    ]
  },
  "settings": {
    "source": "demo-progress.js",
    "lines": [
      "if(!settings?.voice||!['normal','slow'].includes(settings.speed))throw new Error('无效设置');",
      "   node('settings','先校验当前音色与语速，将描述量绑定到本次旁白版本。',{voice:settings.voice,speed:settings.speed,gain:settings.gain,density:settings.density});"
    ]
  },
  "range": {
    "source": "scene-plan.js",
    "lines": [
      "export function sceneRange(film,count){",
      " const scenes=validateScenePlan(film);",
      " if(!Number.isInteger(count)||count<1||count>scenes.length)throw new Error('请选择有效的场景数量。');",
      " const selected=scenes.slice(0,count);",
      " return {start:selected[0].start,duration:seconds(selected.at(-1).end-selected[0].start),count,sceneIds:selected.map(s=>s.id),scenes:selected};",
      "}"
    ]
  },
  "narration": {
    "source": "experience.js",
    "lines": [
      "if(liveSpeech())return speech.narration(start,duration,task.candidate,signal,film);",
      "  if(task.candidate.voice!==DEFAULT_VOICE)throw new Error('当前音色需要在线语音服务');",
      "  const key=task.candidate.speed+'-'+task.candidate.density;",
      "  if(!film.fallbackAudio?.[key])throw new Error('缺少本地演示音频');",
      "  return {url:assetURL(film.fallbackAudio[key]),cues:film.narration?.[key]||[],provider:'local-preset'};"
    ]
  },
  "audioReady": {
    "source": "demo-progress.js",
    "lines": [
      "audio=await prepareNarration(AbortSignal.any([signal,AbortSignal.timeout(TASK_TIMING.timeoutMs)]));",
      "   node('audioReady','已取得旁白音轨，保留播放引用，进入播放器时直接复用。',{provider:audio.provider,returned_cues:audio.cues.length,audio:'ready'});",
      "   log('旁白返回，进入媒体检查');"
    ]
  },
  "media": {
    "source": "demo-progress.js",
    "lines": [
      "await Promise.all([checkMedia(videoURL,'video',signal),checkMedia(audio.url,'audio',signal)]);"
    ]
  },
  "mediaReady": {
    "source": "task-progress.js",
    "lines": [
      "const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);media.onloadedmetadata=media.onerror=null;media.removeAttribute('src');media.load();error?reject(error):resolve();};",
      "  const abort=()=>finish(new DOMException('已取消','AbortError'));",
      "  if(signal?.aborted){abort();return;}",
      "  signal?.addEventListener('abort',abort,{once:true});",
      "  media.preload='metadata';"
    ]
  }
};
export const allTaskSnippets=()=>Object.values(snippets);
export const taskSnippet=event=>snippets[event.node]||null;
