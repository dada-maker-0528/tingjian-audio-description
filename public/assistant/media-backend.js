import {hasStageMedia,matchingVersion,MEDIA_PLANS,stageVideo,stageCues} from '../stage-media.js';
import {parseRequest,differences,editDraft} from './model.js';
import {FIELD_MAP} from './schema.js';
import {request} from './backend-service.js';
import {checkMedia} from '../task-progress.js';
import {assetURL} from '../asset-url.js';
import {FIRST_SCENE_VOICE_PROMPT} from '../s1c-media.js';
export function createMediaBackend(fallback,{store,save,interpret=body=>request('/api/assistant/interpret',body,AbortSignal.timeout(30000))}){
 store.mediaVersions||={};
 const available=a=>a.origin?.phase==='medium'&&a.origin.film.mediaScene!=='s2'&&MEDIA_PLANS[a.origin.film.id]?.revised;
 const voiceAvailable=a=>['short','medium'].includes(a.origin?.phase)&&a.origin?.film?.mediaScene!=='s2'&&MEDIA_PLANS[a.origin?.film?.id]?.voiceRevision;
 function syncMediaState(a){
  if(!voiceAvailable(a)||a.context?.sceneId!=='scene-s1')return;
  const session=a.session,id=a.context.sceneId,map=MEDIA_PLANS[a.origin.film.id];
  const adopted=store.mediaVersions?.[a.origin.taskId]?.s1;
  const version=[map.voiceRevision,map.revised].find(v=>v?.id===adopted?.id&&v.video===adopted.video);
  const actual={voice_id:'female',reference_mode:FIELD_MAP.reference_mode.default,information_level:FIELD_MAP.information_level.default};
  for(const effect of version?.effects||[])if(Object.hasOwn(actual,effect.field))actual[effect.field]=effect.value;
  for(const [field,value] of Object.entries(actual))session.initial[field]=value;
  const accepted=session.accepted[id];
  if(accepted&&(!version||accepted.mediaVersion!==version.id||accepted.videoUrl!==version.video))delete session.accepted[id];
  const pending=session.candidates[id];
  if(pending?.mediaUnchanged&&pending.settings?.voice_id!==actual.voice_id)delete session.candidates[id];
  const draft=session.drafts[id];if(!draft)return;
  const previousBase=draft.base||{};
  for(const [field,value] of Object.entries(actual)){
   if(draft.effective?.[field]===previousBase[field])draft.effective[field]=value;
   draft.base[field]=value;
  }
  if((draft.status==='result'&&draft.result?.candidates?.some(c=>c.mediaUnchanged&&c.settings?.voice_id!==actual.voice_id))||
    (draft.status==='result'&&draft.result?.candidates?.some(c=>c.id===accepted?.id)&&!session.accepted[id])){
   draft.result=null;draft.status='editing';draft.message='';draft.error=null;
  }
  if(!session.accepted[id]&&!session.candidates[id])draft.baseVersion='original';
 }
 function syncS1VoiceDraft(a){
  if(!voiceAvailable(a)||a.draft?.scope!=='current'||a.context?.sceneId!=='scene-s1')return;
  const changes=differences(a.draft.base,a.draft.effective);
  if(changes.length!==1||changes[0].field!=='voice_id'||changes[0].value!=='male'||changes[0].targetCharacterId)return;
  const stale=a.draft.status==='result'&&a.draft.result?.candidates?.length===1&&a.draft.result.candidates[0].mediaUnchanged;
  if(!['editing','ready'].includes(a.draft.status)&&!stale)return;
  if(stale){
   const candidate=a.draft.result.candidates[0];
   if(a.session.candidates[a.context.sceneId]?.id===candidate.id)delete a.session.candidates[a.context.sceneId];
   a.draft.result=null;a.draft.status='editing';
  }
  editDraft(a.draft,MEDIA_PLANS[a.origin.film.id].voiceRevision.effects,a.context);
 }
 function playbackVersion(a,plan){
  const film=a.origin.film;
  try{return matchingVersion(film,a.origin.phase,plan);}catch{
   const owner={id:a.origin.taskId,stage:a.origin.phase,mediaScene:film.mediaScene,mediaExtended:film.mediaScene==='full'};
   const slot=owner.mediaExtended?'full':film.mediaScene==='s2'?'s2':'s1';
   const video=stageVideo(film,owner,store);
   return {id:store.mediaVersions[owner.id]?.[slot]?.id||'retained-'+slot,video,duration:film.duration,slot,cues:stageCues(film,owner,store),unchanged:true};
  }
 }
 function recover(a){
  const version=available(a);if(!version)return null;
  return {kind:'patch',patches:[...differences(a.draft.effective,a.draft.base).map(p=>({...p,op:'set'})),...version.effects.map(p=>({...p}))],scope:'current',targetIds:[a.draft.sceneId],notes:['将待执行方案调整为人物称呼更明确、措辞更简洁；动作细节和语速保持原样。请检查后确认，原要求保留在对话记录中。']};
 }
 return {
  recover,
  syncMediaState,
  syncS1VoiceDraft,
  examples:a=>available(a)?[FIRST_SCENE_VOICE_PROMPT,'谁在做什么说清楚些','描述简洁一点']:null,
  isVideo:a=>hasStageMedia(a.origin?.film),
  defaultInput:a=>available(a)?FIRST_SCENE_VOICE_PROMPT:null,
  inputHint:a=>hasStageMedia(a.origin?.film)?(available(a)?FIRST_SCENE_VOICE_PROMPT:'说说这段旁白哪里需要调整…'):null,
  plan(plan,a){
   if(!hasStageMedia(a.origin?.film))return plan;
   const execution='核对修改要求 → 读取对应视频版本 → 检查播放资源';
   const next={...plan,execution,mediaKind:'video',recovery:Boolean(a.draft?.clarification&&available(a))};
   if(plan.valid){const version=playbackVersion(a,plan);next.mediaUnchanged=Boolean(version.unchanged);next.recovery=false;}
   next.fullPrompt=[plan.fullPrompt,`任务 ${plan.taskId}；场景 ${plan.sceneId}。`,execution+'。',a.draft?.semantic?'语义识别依据：'+JSON.stringify(a.draft.semantic):'', '视频来源及版本映射保存在交付清单；本次操作不发起在线改写或配音。', '不匹配的修改要求不能套用已有版本。原版保留。'].filter(Boolean).join('\n\n');
   return next;
  },
  async parse(text,ctx,draft,a){
   if(!hasStageMedia(a.origin?.film))return fallback.parse(text,ctx,draft,a);
   const requestText=text.replace(/\s+/g,'').replace(/[。！!，,]/g,'');
   if(voiceAvailable(a)&&[FIRST_SCENE_VOICE_PROMPT,'换一个男生声音'].some(prompt=>requestText===prompt.replace(/[。！!，,]/g,''))){
    return {kind:'patch',patches:MEDIA_PLANS[a.origin.film.id].voiceRevision.effects.map(effect=>({...effect})),scope:'current',targetIds:[ctx.sceneId],notes:[]};
   }
   let result;
   try{result=await interpret({text,filmId:a.origin.film.id,sceneId:ctx.sceneId,mediaScene:a.origin.film.mediaScene,effective:draft.effective,history:draft.history});}
   catch{result=parseRequest(text,ctx,draft);result={...result,semantic:{provider:'local-fallback'},notes:[...(result.notes||[]),'语义服务暂时不可用，先按本地规则整理；请核对修改方案。']};}
   if(a.origin.film.mediaScene==='s2')return result;
   const voice=voiceAvailable(a);
   if(voice&&result.kind==='patch'&&(!result.scope||result.scope==='current')&&result.patches?.some(p=>p.field==='voice_id'&&p.value==='male'&&!p.targetCharacterId)&&result.patches.every(p=>voice.effects.some(e=>e.field===p.field&&e.value===p.value&&!p.targetCharacterId))){
    result={...result,patches:voice.effects.map(e=>({...e})),scope:'current',targetIds:[ctx.sceneId]};
   }
   const local=result.semantic?.provider==='local-fallback';
   const concise=local&&/(描述|旁白|句子).*(简洁|精简|简短)/.test(text)&&!/(不要|不用|别).*(简洁|精简|简短)/.test(text);
   if(concise&&result.kind==='clarify')result={...result,kind:'patch',patches:[{field:'information_level',value:'精简'}]};
   const named=local&&/(人物|称呼).*(说清楚|讲清楚|明确|清楚)|分不清谁/.test(text)&&!/(不要|不用|别).*(人物|称呼)/.test(text);
   if(named&&result.kind==='clarify')result={...result,kind:'patch',patches:[{field:'reference_mode',value:'每个动作点名'}]};
   else if(named&&result.kind==='patch'&&!result.patches.some(p=>p.field==='reference_mode'))result.patches.push({field:'reference_mode',value:'每个动作点名'});
   const effects=MEDIA_PLANS[a.origin.film.id]?.revised?.effects||[];
   if(result.kind==='patch'&&!result.patches.some(p=>p.field==='voice_id')&&result.patches.some(p=>effects.some(e=>p.field===e.field&&p.value===e.value&&!p.targetCharacterId))){
    // Interpret intent independently, then propose the actual available media changes.
    // This is an explicit candidate, not a claim that every interpreted wish was fulfilled.
    const requested=result.patches.map(p=>({...p}));
    result={...result,patches:[...differences(draft.effective,draft.base).map(p=>({...p,op:'set'})),...effects.map(e=>({...e}))],scope:'current',targetIds:[ctx.sceneId],semantic:{...result.semantic,requestedPatches:requested},notes:[...(result.notes||[]),'根据你的要求，建议先试听人物称呼更明确、措辞更简洁的版本。此方案只改这两项，动作细节、音色和语速保持原样；其他要求留在对话记录中。请检查后确认。']};
   }
   return result;
  },
  async run(run,a){
   if(!hasStageMedia(a.origin?.film))return fallback.run(run,a);
   const version=playbackVersion(a,run.plan);
   await checkMedia(assetURL(version.video),'video',AbortSignal.timeout(30000),version.duration);
   return {runId:run.id,taskId:run.taskId,submittedRevision:run.submittedRevision,mediaKind:'video',candidates:run.plan.targets.map(t=>{
    const end=a.origin.phase==='short'?Math.min(t.end,MEDIA_PLANS[a.origin.film.id].previewSeconds):t.end;
    const cues=(version.cues||t.cues).filter(c=>c.start<end);
    return {
     id:run.id+':'+t.sceneId,sceneId:t.sceneId,number:t.number,title:t.title,start:t.start,end,baseVersion:t.baseVersion,base:t.base,settings:t.effective,scope:run.plan.scope,patches:t.inheritancePatches,changes:t.changes,nodes:['match','media-check'],prompt:run.plan.fullPrompt,
     mediaKind:'video',videoUrl:version.video,mediaVersion:version.id,slot:version.slot,mediaUnchanged:Boolean(version.unchanged),audioGenerated:false,timingVerified:false,mediaChecked:true,cues,candidateText:cues.map(c=>({id:c.id,text:c.text,status:'对应版本文稿'})),issues:[],
    };
   })};
  },
  async accept(a,sceneId){
   if(!hasStageMedia(a.origin?.film))return fallback.accept(a,sceneId);
   const c=a.draft.result?.candidates.find(c=>c.sceneId===sceneId),pending=a.session.candidates[sceneId];
   if(!c?.videoUrl||pending?.id!==c.id)throw new Error('待确认版本已变化，请重新检查。');
   const version=c.mediaUnchanged?{video:stageVideo(a.origin.film,{id:a.origin.taskId,stage:a.origin.phase,mediaScene:a.origin.film.mediaScene,mediaExtended:a.origin.film.mediaScene==='full'},store),id:c.mediaVersion}:matchingVersion(a.origin.film,a.origin.phase,{targets:[{sceneId,changes:c.changes,effective:c.settings}]});
   if(c.videoUrl!==version.video||c.mediaVersion!==version.id)throw new Error('视频映射已更新，请重新试听后确认。');
   const records=store.mediaVersions[a.origin.taskId]||={history:[]};
   if(c.mediaUnchanged){records.operations||=[];const record={candidateId:c.id,sceneId,video:c.videoUrl,mediaUnchanged:true,acceptedAt:Date.now()};records.operations.push(record);save();return record;}
   if(records[c.slot])records.history.push({...records[c.slot]});
   records[c.slot]={id:c.mediaVersion,slot:c.slot,video:c.videoUrl,candidateId:c.id,acceptedAt:Date.now()};save();return records[c.slot];
  },
  current:ownerId=>fallback.current(ownerId),
 };
}
