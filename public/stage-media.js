import {sceneRange,validateScenePlan} from './scene-plan.js';
import {secondScene} from './s2-media.js';
import {firstSceneRevision} from './s1b-media.js';
import {firstSceneVoiceRevision} from './s1c-media.js';
// Version mappings are delivery data. Null means no playable asset has been supplied.
// Keep the story scene IDs stable; the opening excerpt is not another story scene.
export const MEDIA_PLANS={
 'nezha-s1-20260922':{
  previewSeconds:10.2,
  initial:{id:'s1-a',video:'assets/NZ2_S1_demo_h264.mp4',duration:39.079},
  revised:firstSceneRevision,
  voiceRevision:firstSceneVoiceRevision,
  second:secondScene,
  extension:{
   baseS1Id:firstSceneRevision.id,baseS2Id:secondScene.id,
   initial:{id:'full-86f34f49',video:'assets/NZ2_full_86f34f49.mp4',duration:176.983333,sha256:'86f34f496305e456ad5563f99a805c3ce2cad2d694455e319283a31cba54dd0a'},
   scenes:[{id:'scene-s1',title:'云中飞行',storyNumber:1,start:0,end:39.066667,characterIds:['C01','C02']},{...secondScene.scene,start:39.066667,end:176.983333}],
   narration:{'normal-balanced':[...firstSceneRevision.cues,...secondScene.cues.map(c=>({...c,start:c.start+39.066667,end:c.end+39.066667}))]},
  },
 },
};
export const hasStageMedia=film=>Boolean(MEDIA_PLANS[film?.id]);
export const isSecondScene=owner=>owner?.mediaScene==='s2'&&!owner?.mediaExtended;
export function secondSceneReady(film){const s=MEDIA_PLANS[film?.id]?.second;return Boolean(s?.video&&s.audioMode==='mixed-narration'&&Number.isFinite(s.duration)&&s.duration>0);}
export function assembledMediaReady(film){
 const p=MEDIA_PLANS[film?.id];return Boolean(p?.revised?.id&&p.revised.id===p.extension?.baseS1Id&&p.second?.contentApproved&&p.extension.baseS2Id===p.second.id&&extensionReady(film));
}
export function finalMediaReady(film,acceptedId){
 const p=MEDIA_PLANS[film?.id];return Boolean(assembledMediaReady(film)&&p.revised.id===acceptedId);
}
export function resolveSource(value){
 const input=String(value||'').trim();
 if(!input||input.length>4096)throw new Error('请输入视频链接。');
 const matched=input.match(/https?:\/\/[^\s<>]+/i);
 if(matched){
  let url;try{url=new URL(matched[0].replace(/[）)\]，。]+$/u,''));}catch{throw new Error('链接格式不完整，请重新粘贴。');}
  if(!url.hostname.includes('.')||url.username||url.password)throw new Error('请输入完整的视频链接。');
  return {kind:'url',input,url:url.href,filmId:'nezha-s1-20260922'};
 }
 if(/^(?:《)?哪[吒咤](?:之)?(?:魔童闹海)?(?:》)?$/u.test(input.replace(/\s/g,'')))return {kind:'title',input,filmId:'nezha-s1-20260922'};
 throw new Error('暂未找到这部影片，请检查输入内容或粘贴视频链接。');
}
export function stageRange(film,task,count=1){
 const range=sceneRange(film,count),plan=MEDIA_PLANS[film.id];
 return plan&&task?.stage==='short'?{...range,duration:Math.min(plan.previewSeconds,range.duration)}:range;
}
export function extensionReady(film,acceptedId){
 const p=MEDIA_PLANS[film?.id],ext=p?.extension;
 if(!ext?.initial?.video||!ext.scenes||!ext.narration)return false;
 if(arguments.length>1&&ext.baseS1Id!==(acceptedId||p.initial.id))return false;
 try{validateScenePlan({scenePlanVersion:'mapped-extension',duration:ext.initial.duration,scenes:ext.scenes});return ext.scenes.length>=2&&ext.scenes[0].id==='scene-s1'&&Math.abs(ext.scenes[0].end-p.initial.duration)<.1;}catch{return false;}
}
export function stageFilm(film,owner){
 const plan=MEDIA_PLANS[film.id],ext=plan?.extension;
 if(owner?.mediaExtended&&extensionReady(film))return {...film,mediaScene:'full',audioMode:'mixed-narration',duration:ext.initial.duration,scenes:ext.scenes,narration:ext.narration,video:ext.initial.video,description:'哪吒与太乙真人，从云中飞行到山间练习。',fallbackAudio:{},prebuiltOnline:{}};
 if(isSecondScene(owner)&&secondSceneReady(film)){
  const s=plan.second;
  return {...film,mediaScene:'s2',storySceneCount:2,duration:s.duration,video:s.video,audioMode:'mixed-narration',scenes:[{...s.scene,end:s.duration}],covers:[s.cover],narration:{'normal-balanced':s.cues},dialogues:[],fallbackAudio:{},prebuiltOnline:{},description:'哪吒与太乙真人继续山间的故事。',roles:film.roles.map(r=>({...r,detail:r.detail.replace(/，坐在飞猪头上。/,'。').replace(/，坐在飞猪背上吃东西。/,'。')}))};
 }
 return film;
}
export function stageVideo(film,owner,store,{original=false}={}){
 const plan=MEDIA_PLANS[film.id];if(!plan)return film.video;
 const accepted=store?.mediaVersions?.[owner?.id];
 if(owner?.mediaExtended&&extensionReady(film))return (!original&&accepted?.full?.video)||plan.extension.initial.video;
 if(isSecondScene(owner)&&secondSceneReady(film))return plan.second.video;
 const adopted=accepted?.s1;
 return (!original&&(owner?.stage!=='short'||adopted?.id===plan.voiceRevision?.id)&&adopted?.video)||plan.initial.video;
}
export function mediaHistory(film,owner,store){
 const plan=MEDIA_PLANS[film.id];if(!plan)return [];
 const full=owner?.mediaExtended,initial=full?plan.extension?.initial:isSecondScene(owner)?plan.second:plan.initial,records=store.mediaVersions?.[owner?.id],slot=full?'full':isSecondScene(owner)?'s2':'s1';
 if(!initial)return [];
 const versions=[{...initial,label:'原版'},...(records?.history||[]).filter(v=>v.slot===slot).map(v=>({...v,label:'历史版本'})),...(records?.[slot]?[{...records[slot],label:'已采用版本'}]:[])];
 return versions.filter((v,i)=>versions.findIndex(x=>x.video===v.video)===i);
}
export function matchingVersion(film,phase,plan){
 const map=MEDIA_PLANS[film?.id];if(!map)return null;
 if(film.mediaScene==='s2')throw new Error('第二场景的修改意见已保留，新的对应视频尚未就绪。可以继续观看当前版本。');
 const full=['watch','complete','full-review'].includes(phase),target=plan.targets?.[0],changes=target?.changes||[];
 const voice=map.voiceRevision;
 const voiceRequested=!full&&voice?.video&&changes.some(c=>c.field==='voice_id'&&c.value==='male'&&!c.targetCharacterId)
  &&changes.every(c=>voice.effects.some(e=>c.field===e.field&&c.value===e.value&&!c.targetCharacterId))
  &&voice.effects.every(e=>target?.effective?.[e.field]===e.value);
 if(phase==='short'&&!voiceRequested)throw new Error('当前片段只提供已接入的男声精简版；其他修改意见已保留，可在完整场景继续调整。');
 const version=full?map.extension?.revised:voiceRequested?voice:map.revised;
 if(!version?.video)throw new Error('对应修改版本尚未就绪。你的要求已保留，当前视频可以继续试听。');
 const targets=plan.targets||[];
 if(targets.length!==1||targets[0].sceneId!==(full?'scene-s2':'scene-s1'))throw new Error('该版本只对应当前场景，请调整应用范围。');
 const effects=version.effects||[];
 // A fixed video must not be reported as fulfilling unrelated or partial requests.
 if(!voiceRequested&&(changes.length!==effects.length||!effects.every(e=>changes.some(c=>c.field===e.field&&c.value===e.value&&!c.targetCharacterId))))throw new Error('当前版本不包含这组修改。请调整要求；原版保持可用。');
 if(Math.abs(version.duration-(full?map.extension.initial.duration:map.initial.duration))>.1)throw new Error('新旧版本时长不一致，请检查视频素材。');
 return {...version,slot:full?'full':'s1'};
}

export function stageCues(film,owner,store,{original=false}={}){
 const p=MEDIA_PLANS[film.id];
 if(p&&!original&&!isSecondScene(owner)&&!owner?.mediaExtended){
  const acceptedId=store?.mediaVersions?.[owner?.id]?.s1?.id;
  const version=[p.voiceRevision,p.revised].find(v=>v?.id===acceptedId);
  if(version&&(owner?.stage!=='short'||version.id===p.voiceRevision?.id))return version.cues;
 }
 return film.narration?.['normal-balanced']||[];
}
