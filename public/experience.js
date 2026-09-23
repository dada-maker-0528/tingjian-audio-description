import {uploadVideo,projectRequest,filmFromProject} from './upload-service.js';
import {resolveSource,hasStageMedia,MEDIA_PLANS,stageRange,stageVideo,extensionReady,stageFilm,mediaHistory,isSecondScene,secondSceneReady,assembledMediaReady,stageCues} from './stage-media.js';
import {createMediaBackend} from './assistant/media-backend.js';
import {openingPage} from './opening.js';
import {request as backendRequest} from './assistant/backend-service.js';
import {createAssistantBackend,audioBaseline} from './assistant/backend-service.js';
import {createPromptLibrary} from './prompt-library.js';
import {installDialogFocus} from './dialog-focus.js';
installDialogFocus();
import {createTaskProgress,runTaskPlan} from './task-progress.js';
import {demoPlan} from './demo-progress.js';
let processingView=null;
import {icon,main,fillIcons,icons} from './app.js';
import {defaults,newTask,migrateTaskToScenes,confirmStage,canComplete,changeNarrationVoice,copySettings,markFullRevisionReady,acceptFullRevision} from './flow.js';
import {NarrationAssistant} from './assistant/view.js';
import {restoreStore,editDraft} from './assistant/model.js';
import {assistantKeyAction} from './assistant/speech-policy.js';
import {sceneRange,scenePreviewCount,sceneScopeLabel,sceneStageLabel} from './scene-plan.js';
import {SpeechService} from './speech-service.js';
import {films,defaultFilm,findFilm} from './catalog-config.js';
import {DEFAULT_VOICE,VOICES,isVoice,voiceInfo} from './voices.js';
import {FocusReader} from './focus-reader.js';
import {installAudioPreload} from './audio-preload.js';
import {PROMPT_CHANNELS,promptRates,rateForGuide,setChannelRate,promptRateLabel,promptText,promptUtterance,applyPromptAudioRate} from './prompt-speech.js';
import {GuideSequence,pageGuide,briefPageGuide,roleIntroduction,roleChoices,roleTourSteps,roleKeyAction} from './page-guidance.js';
import {mergePublicLibrary,visibleLibrary,hasNarration,isListedVideo} from './library.js';
let film=defaultFilm;
import {assetURL} from './asset-url.js';
Object.assign(icons,{pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',replay:'<path d="M3 10a9 9 0 119 11M3 4v6h6"/>',back10:'<path d="M4 9a8 8 0 111 9M4 3v6h6"/><path d="M9 12v5M12 12h3v5h-3z"/>',forward10:'<path d="M20 9a8 8 0 10-1 9M20 3v6h-6"/><path d="M9 12v5M12 12h3v5h-3z"/>',chat:'<path d="M21 11a8 8 0 01-8 8H7l-5 3V11a9 9 0 0119 0zM7 9h9M7 13h6"/>',mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',fullscreen:'<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',spark:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4zM20 2v4M18 4h4"/>',save:'<path d="M5 3h14v18l-7-4-7 4z"/>',file:'<path d="M14 3H5v18h14V8zM14 3v5h5M9 13l5 3-5 3z"/>'});
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displaySeconds=n=>{const value=Math.max(0,n||0),full=MEDIA_PLANS[film?.id]?.extension.initial.duration;return Number.isFinite(full)&&Math.abs(value-full)<.002?Math.round(value):Math.floor(value);};
const time=n=>{const whole=displaySeconds(n);return `${Math.floor(whole/60).toString().padStart(2,'0')}:${(whole%60).toString().padStart(2,'0')}`;};
const KEY='tingjian-demo-v4';
let stored={};try{stored=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('tingjian-demo-'+defaultFilm.id)||'{}')||{};}catch{}
const assistantStore=restoreStore(stored.assistant);
const validSettings=s=>s&&['normal','slow'].includes(s.speed)&&['balanced','concise'].includes(s.density)&&[0.88,1].includes(s.gain)&&isVoice(s.voice||DEFAULT_VOICE);
let prefs={guide:true,reader:false,shortcuts:true,focusReadout:true,voice:DEFAULT_VOICE,...stored.prefs};
if(!isVoice(prefs.voice))prefs.voice=DEFAULT_VOICE;
prefs.promptRates=promptRates(prefs.promptRates);delete prefs.promptRate;
let library=mergePublicLibrary(films,(Array.isArray(stored.library)?stored.library:[]).filter(x=>x&&typeof x.id==='string'&&validSettings(x.settings)).map(x=>({...x,assetId:x.assetId||defaultFilm.id,settings:{...defaults(),...x.settings}})),{...defaults(),voice:prefs.voice});
let task=stored.draft&&validSettings(stored.draft.candidate)&&findFilm(stored.draft.assetId||defaultFilm.id)?stored.draft:null;
if(task){task.assetId=task.assetId||defaultFilm.id;task.candidate={...defaults(),...task.candidate};if(task.confirmed)task.confirmed={...defaults(),...task.confirmed};task=migrateTaskToScenes(task,findFilm(task.assetId));}
let revision=stored.revision&&stored.revision.stage==='full-review'&&!stored.revision.completed&&validSettings(stored.revision.candidate)&&findFilm(stored.revision.assetId)?stored.revision:null;
if(revision){revision.candidate=copySettings(revision.candidate);revision.renderedVersion=null;}
let regenerationBusy=false;
let route='home',watching=null,guideToken=0,runId=0,toastId,returnFocus=null,lastMessage='',currentGuide='home',previewUrl=null,guideDetailPrefix='',lastAutoPage='';
const roleTour=new GuideSequence();
const speech=new SpeechService();let guideAbort=null,guideResolver=null,mediaAbort=null,activeNarrationCues=null,currentAudioSource='local';
const liveSpeech=()=>speech.available&&prefs.ttsMode!=='local';
let player=null,playing=false,playerReady=false,clipStart=0,clipEnd=film.duration,narrationOn=true,captionOn=true,lastSavedPosition=0,raf=0,mediaGeneration=0;
const narration=$('#narration'),guide=$('#guide-audio'),modal=$('#modal'),chat=$('#chat');
let roles=film.roles||[],audioOffset=0,extraAudio=null;
function promptAssistantSource(){
 if(!assistant.visible)return null;
 const d=assistant.draft;
 const canApply=!assistant.busy&&!assistant.voice.active&&!['running','parsing','result'].includes(d.status)&&!d.input.trim();
 return {session:assistant.session,draft:d,context:assistant.context,token:JSON.stringify([assistant.session.taskId,assistant.context.sceneId,d.revision,d.baseVersion,d.status,d.input]),canApply,reason:d.input.trim()?'助手还有未发送的要求，请先发送并检查方案。':'请先完成当前录音、处理或结果确认，再加入新组合。'};
}
const promptLibrary=createPromptLibrary({modal,show:showModal,announce,getAssistant:promptAssistantSource,applySelection:(patches,token)=>{
 const current=promptAssistantSource();
 if(!current?.canApply||current.token!==token)throw new Error('助手草稿已变化，请关闭提示词库后重新打开再检查。');
 editDraft(assistant.draft,patches,assistant.context);assistant.parseId++;assistant.mode='ordinary';assistant.category=null;assistant.view='card';persist();assistant.render();
 queueMicrotask(()=>assistant.el.querySelector('#assistant-command-title')?.focus());
}});
const audioBackend=createAssistantBackend({store:assistantStore,save:persist,stop:stopAll,preview:audio=>extraAudio=audio,baseline:async a=>{
 const source=a.origin.film,settings=a.origin.settings,key=settings.speed+'-'+settings.density;
 // The server already owns the complete default-voice track. A preview blob is
 // padded to film duration but contains only the preview's cues, never a baseline.
 if((settings.voice||DEFAULT_VOICE)===DEFAULT_VOICE&&source.fallbackAudio?.[key])return undefined;
 const full=await speech.narration(0,source.duration,settings,undefined,source);
 return audioBaseline(full.url,full.cues);
}});

const backendAssistant=createMediaBackend(audioBackend,{store:assistantStore,save:persist});
function mediaAsset(file){return assetURL(file?.startsWith('/')?file:'assets/'+file);}
function updateUploaded(p){
 const value=filmFromProject(p),existing=findFilm(value.id);if(existing)Object.assign(existing,value);else films.push(value);
 const current=existing||value;
 if(film.id===current.id){film=current;roles=film.roles;}
 return current;
}
function taskFromUploaded(p){
 const current=updateUploaded(p);selectFilm(current.id);const w=p.workflow;
 task={...(task?.sourceProjectId===p.id?task:{}),id:'uploaded-'+p.id,sourceProjectId:p.id,assetId:current.id,title:p.title,stage:w.stage==='analyzing'?'roles':w.stage,version:w.settingsVersion,candidate:current.playbackSettings,scenePlanVersion:current.scenePlanVersion,totalScenes:current.scenes.length,sceneCount:w.sceneCount||1,confirmedSceneCount:w.stage==='medium'?1:w.stage==='full'?Math.min(3,current.scenes.length):0,completed:w.status==='complete',saved:w.saved,updated:Date.now()};
 if(w.status==='complete')task.stage='complete';task.confirmed={...task.candidate,version:task.version};
 assistantStore.sources[task.id]={projectId:p.id};persist();return current;
}
async function loadUploaded(){
 try{const data=await backendRequest('/api/bootstrap');for(const p of data.projects.filter(isListedVideo)){const current=updateUploaded(p);if(!library.some(x=>x.id==='uploaded-'+p.id))library.push({id:'uploaded-'+p.id,assetId:current.id,title:p.title,duration:p.duration,settings:current.playbackSettings,position:p.workflow.position||0,sourceProjectId:p.id,created:0,public:false});assistantStore.sources['uploaded-'+p.id]={projectId:p.id};}
  if(stored.draft?.sourceProjectId&&isListedVideo(stored.draft)){const p=data.projects.find(p=>p.id===stored.draft.sourceProjectId);if(p)taskFromUploaded(p);}persist();
 }catch(error){console.warn('Uploaded library unavailable:',error.message);}
}
async function confirmUploaded(direction){
 const p=film.project;if(!p||regenerationBusy||assistant.busy)return;
 try{const latest=await projectRequest(p.id);const result=await projectRequest(p.id,{action:'accept',requestId:crypto.randomUUID(),revision:latest.workflow.revision,versionId:latest.workflow.current?.id,extend:direction==='next'});taskFromUploaded(result);showUploadedProgress(result);}
 catch(error){toast(error.message);}
}
function showUploadedProgress(initial){
 taskFromUploaded(initial);route=initial.workflow.stage==='analyzing'?'analyzing':initial.workflow.stage==='full'?'full':'generating';const id=++runId;
 page(shell(`<section class="processing"><div class="process-icon">${icon('spark')}</div><h1>正在准备${route==='analyzing'?'视频资料':route==='full'?'完整旁白':'场景旁白'}</h1><p>《${esc(initial.title)}》 · ${time(initial.duration)}<br>正在处理你上传的视频</p><div id="task-progress"></div></section>`,route==='analyzing'?1:stageIndex(initial.workflow.stage)),route);main.classList.add('process-page');
 const steps=initial.workflow.progress?.steps||['读取视频与场景','整理人物介绍','检查试听范围'];
 const view=createTaskProgress($('#task-progress'),{steps,mode:'live',completeLabel:route==='analyzing'?'解析已完成，按空格继续。':route==='full'?'整片已就绪，按空格继续下一步。':'样片已就绪，按空格继续下一步。',onReady:()=>{main.querySelector('.processing h1').textContent='已准备好';void say(currentGuide);},onRetry:async()=>{try{const p=await projectRequest(initial.id);showUploadedProgress(await projectRequest(p.id,{action:'retry',requestId:crypto.randomUUID(),revision:p.workflow.revision}));}catch(e){toast(e.message);}}});processingView=view;
 void (async()=>{
  try{let p=initial;
   while(id===runId&&!view.signal.aborted){
    for(const event of p.workflow.progress?.events||[])view.event(event);
    if(['error','paused','interrupted'].includes(p.workflow.status)){view.fail(p.workflow.message);return;}
    if(['review','complete'].includes(p.workflow.status)){taskFromUploaded(p);const ok=await view.complete();if(!ok||id!==runId)return;if(p.workflow.stage==='roles')renderRoles();else if(p.workflow.status==='complete')renderComplete();else renderSample();return;}
    await new Promise(r=>setTimeout(r,700));p=await projectRequest(p.id);
   }
  }catch(error){if(!view.signal.aborted)view.fail(error.message);}
 })();
}
function selectFilm(id){const selected=findFilm(id);if(!selected)return false;film=selected;roles=film.roles||[];return true;}
const durationWords=d=>{const whole=displaySeconds(d);return `${Math.floor(whole/60)} 分 ${(whole%60).toString().padStart(2,'0')} 秒`;};
const keyboardReader=new FocusReader({enabled:()=>prefs.focusReadout!==false&&!prefs.reader&&!voiceCapturing(),beforeSpeak:()=>{stopGuide();pauseMedia();},status:$('#focus-readout'),rate:()=>prefs.promptRates.focus,audioSource:(text,signal)=>liveSpeech()?speech.guide(text,signal,prefs.voice):null});
keyboardReader.start();
const stageNames={roles:'认识角色',short:'第 1 个场景',medium:'连续场景确认',full:'完整制作',complete:'制作完成','full-review':'完整视频复看'};
const stageTitle=owner=>{
 if(owner?.mediaPlan){
  if(owner.stage==='short')return '试听';
  if(owner.stage==='medium')return isSecondScene(owner)?'连续场景':'首个场景';
  if(['full','complete'].includes(owner.stage))return '完成整片';
 }
 return sceneStageLabel(owner)||stageNames[owner?.stage]||'准备素材';
};
const playbackScope=()=>hasStageMedia(film)&&route==='short'?'人物出场试听':hasStageMedia(film)&&route==='medium'?(isSecondScene(task)?'第 2 个场景':'首个场景'):['short','medium'].includes(route)?sceneScopeLabel(film,scenePreviewCount(task)):'完整视频';
const activeTask=()=>route==='full-review'?revision:task;
const playerSettings=()=>route==='watch'?watching?.settings:activeTask()?.candidate;
const guideContext=()=>{
 const libraryTotal=library.filter(item=>isListedVideo(item)&&findFilm(item.assetId)).length;
 return {film,task:activeTask(),filmCount:films.length,libraryTotal,libraryCount:route==='library'?main.querySelectorAll('#cards .film-card').length:libraryTotal,libraryQuery:route==='library'?($('#search')?.value||''):'',shortcuts:prefs.shortcuts};
};
const currentGuideText=(key=currentGuide,{detailed=false}={})=>{
 if(['analyzing','generating','full'].includes(key)&&main.querySelector('.task-continue:not([hidden])'))return main.querySelector('.task-status')?.textContent||'';
 const words=detailed?(pageGuide(key,guideContext())||film?.guides?.[key]||''):briefPageGuide(key,guideContext());
 return words+(task?.assistantMockApproved&&key==='complete'?' 修改意见已记录，当前仍使用原有配音。':'');
};
function persist(){try{localStorage.setItem(KEY,JSON.stringify({prefs,library,draft:task,revision,assistant:assistantStore}));return true;}catch{announce('这台设备暂时无法保存数据，请释放浏览器存储后重试。');return false;}}
function announce(text){$('#status').textContent='';queueMicrotask(()=>$('#status').textContent=text);}
function toast(text,{live=true}={}){clearTimeout(toastId);$('#toast').hidden=false;$('#toast').textContent=text;if(live)announce(text);toastId=setTimeout(()=>$('#toast').hidden=true,5000);}
function focusTitle(){requestAnimationFrame(()=>{const h=main.querySelector('h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}window.scrollTo({top:0,behavior:'instant'});});}
function stopGuide(preserveSequence=false){if(!preserveSequence)roleTour.cancel();guideToken++;guideAbort?.abort();guideAbort=null;if(guideResolver){guideResolver(false);guideResolver=null;}guide.pause();guide.currentTime=0;window.speechSynthesis?.cancel();if(!preserveSequence)document.querySelectorAll('.role-card.speaking').forEach(x=>x.classList.remove('speaking'));}
function pauseMedia(){if(player)player.pause();narration.pause();playing=false;cancelAnimationFrame(raf);updatePlayButtons();}
function voiceCapturing(){return !!assistant?.voice.active;}
function stopAll(){extraAudio?.pause();assistant?.cancelVoice();keyboardReader.stop();stopGuide();pauseMedia();}
function updateGuideUI(){
 $('#guide-status').textContent=prefs.reader?'读屏优先':prefs.guide?'引导已开启':prefs.focusReadout?'Tab 朗读开启':'未开启';if(!prefs.focusReadout||prefs.reader)$('#focus-readout').hidden=true;$('[data-action="pref-focus"]')?.setAttribute('aria-checked',String(prefs.focusReadout&&!prefs.reader));
 const notice=document.querySelector('.demo-notice>span:nth-of-type(2)');if(notice)notice.textContent='听见人物、动作与故事';const voiceSource=document.querySelector('.notice-right');if(voiceSource)voiceSource.textContent=hasStageMedia(film)?'口述影像':liveSpeech()?'豆包配音':'本地配音';
}
async function say(key,text,force=false,{sequence=false}={}){
 if(voiceCapturing()){if(!force)return false;assistant.cancelVoice();}const words=promptText(text||currentGuideText(key));if(!words)return false;
 if(prefs.reader||(!prefs.guide&&!force)){announce(words);return false;}
 keyboardReader.stop();pauseMedia();stopGuide(sequence);const token=guideToken;guideAbort=new AbortController();
 const rate=rateForGuide(key,prefs.promptRates);let src=null;
 if(liveSpeech()){
  try{src=await speech.guide(words,guideAbort.signal,prefs.voice);}catch(e){if(token!==guideToken||e.name==='AbortError')return false;toast('在线语音暂时不可用，正在使用本地提示音。');}
 }
 if(token!==guideToken)return false;
 if(!src&&film?.guideFiles?.[key]&&film.guides[key]===words)src=assetURL(film.guideFiles[key]);
 if(src){guide.src=src;applyPromptAudioRate(guide,rate);return new Promise(resolve=>{guideResolver=resolve;const finish=ok=>{if(guideResolver===resolve)guideResolver=null;resolve(ok&&token===guideToken);};guide.onended=()=>finish(true);guide.onerror=()=>{if(token===guideToken)toast('语音提示暂时无法播放，请重试。');finish(false);};guide.play().catch(()=>{if(token===guideToken)toast('请点击“再听提示”开始播放。');finish(false);});});}
 if(!window.speechSynthesis){toast('当前浏览器不支持这段语音，请使用文字提示。');return false;}
 return new Promise(resolve=>{guideResolver=resolve;const finish=ok=>{if(guideResolver===resolve)guideResolver=null;resolve(ok&&token===guideToken);};const utterance=promptUtterance(words,rate);utterance.onend=()=>finish(true);utterance.onerror=()=>finish(false);window.speechSynthesis.speak(utterance);});
}
function clearPlayer(){mediaAbort?.abort();mediaAbort=null;activeNarrationCues=null;mediaGeneration++;regenerationBusy=false;pauseMedia();if(player){player.removeAttribute('src');player.load();player=null;}narration.removeAttribute('src');narration.load();playerReady=false;}
function page(html,guideKey,focus=true,options={}){
 document.body.classList.toggle('intro-page',route==='home');
 processingView?.dispose();processingView=null;main.classList.remove('process-page');assistant.hide();stopAll();clearPlayer();main.innerHTML=html;const heading=main.querySelector('h1');if(heading)heading.tabIndex=-1;fillIcons();
 $('.main-nav [data-action="home"]').classList.toggle('active',route==='home');$('.main-nav [data-action="library"]').classList.toggle('active',route==='library');
 currentGuide=guideKey||route;guideDetailPrefix=options.introPrefix||'';if(focus)focusTitle();updateGuideUI();mountAssistant();
 const pageKey=JSON.stringify([currentGuide,film.id,['short','medium'].includes(route)?task?.sceneCount:'',route==='watch'?watching?.id:'',route==='library'?[guideContext().libraryCount,guideContext().libraryQuery]:null]);
 const words=currentGuideText(),speak=options.guide!==false&&pageKey!==lastAutoPage;lastAutoPage=pageKey;announce(words);
 return speak?say(currentGuide,words):Promise.resolve(false);
}
function goHome(isLibrary=false){runId++;stopAll();route=isLibrary?'library':'home';renderHome();}
function filmCard(item,i,featured){const source=findFilm(item.assetId);if(!source)return '';const media=stageFilm(source,item);const pos=item.position>1&&item.position<media.duration-2?item.position:0;const cover=media.covers[i%media.covers.length];return `<article class="film-card ${featured?'featured':''}"><div class="film-cover"><img src="${mediaAsset(cover.file)}" alt="${esc(cover.alt)}" loading="${i?'lazy':'eager'}"><span class="corner-tag">${icon('headphones')}${hasNarration(media)?'中文口述影像':'原片'}</span><span class="duration">${time(media.duration)}</span></div><div class="film-info"><div class="film-meta"><span class="index">${i+1}</span>${item.public?'公开视频':'本机口述版本'} · ${esc(media.kind||'影视片段')}</div><h3>${esc(item.title)}</h3><p>${esc(media.shortDescription||media.description||'')}</p><span class="status-label">${icon('check')}${pos?'已听到 '+time(pos):hasNarration(media)?'已添加口述影像':'原声视频'}</span><button class="btn primary" data-action="watch" data-id="${esc(item.id)}" data-focus-label="${pos?'继续播放':'播放'}《${esc(item.title)}》" aria-label="${pos?'继续播放':'播放'}《${esc(item.title)}》，${durationWords(media.duration)}">${icon('play')}${pos?'继续播放':'播放视频'}</button></div></article>`;}
function renderHome(query=''){
 if(route==='home'){page(openingPage(icon),'home',true,{guide:false});return;}
 const all=true,source=library.filter(item=>isListedVideo(item)&&findFilm(item.assetId)),items=visibleLibrary(source,{query,all});
 page(`<div class="container library-page"><div class="page-heading"><div class="title-line"><h1>${all?'我的视频':'示例视频'}</h1><span class="count">${items.length} 部</span></div><button class="btn primary" data-action="create">${icon('plus')}创建新视频<kbd>空格</kbd></button></div>${all?`<label class="search-box">${icon('search')}<input type="search" id="search" placeholder="搜索视频" aria-label="搜索我的视频" value="${esc(query)}"></label>`:''}${task&&!task.completed?`<div class="draft-strip">${icon('file')}<span>制作中 · ${stageTitle(task)}</span><button class="text-btn" data-action="resume">继续制作 ${icon('arrow')}</button></div>`:''}${revision&&!revision.completed?`<div class="draft-strip">${icon('file')}<span>${esc(revision.title)}</span><button class="text-btn" data-action="resume-revision">继续修改 ${icon('arrow')}</button></div>`:''}<div class="library-tools"><span>${all?'按名称查找':'最近添加'}</span>${!all&&library.length>6?`<button class="text-btn" data-action="library">查看全部 ${icon('arrow')}</button>`:''}</div><div class="library-grid" id="cards">${items.length?items.map((x,i)=>filmCard(x,i,false)).join(''):'<div class="empty-state"><h3>没有找到视频</h3></div>'}</div></div>`,all?'library':'home',false);
 if(all)$('#search').addEventListener('input',e=>{const matches=visibleLibrary(source,{query:e.target.value,all:true});$('#cards').innerHTML=matches.map((x,i)=>filmCard(x,i,false)).join('')||'<div class="empty-state"><h3>没有找到视频</h3></div>';main.querySelector('.count').textContent=matches.length+' 部';announce(currentGuideText());});
}
function stageNav(active){const labels=hasStageMedia(film)?['上传视频','认识角色','试听','首个场景','连续场景','完成整片']:['上传视频','认识角色','首个场景','连续场景','完成整片'];return `<nav class="stage-nav" aria-label="制作阶段">${labels.map((name,i)=>`${i?'<span class="stage-line" aria-hidden="true"></span>':''}<button class="stage-button ${active===i?'active':active>i?'completed':''}" data-action="view-stage" data-stage="${i}" data-focus-label="${name}" ${i>active?'disabled':''} ${i===active?'aria-current="step"':''}><span class="num">${i<active?icon('check'):i+1}</span><span>${name}</span></button>`).join('')}</nav>`;}
function shell(content,active){const duration=hasStageMedia(film)&&['upload','analyzing','roles'].includes(route)?MEDIA_PLANS[film.id].extension.initial.duration:hasStageMedia(film)&&route==='short'?stageRange(film,task,1).duration:film.duration;return `<div class="container"><div class="back-row"><button class="text-btn" data-action="exit">${icon('back')}返回我的视频</button><span class="task-name">${active===0?'新建口述影像':film.title}<span aria-hidden="true"> · </span>${active===0?'从一段视频开始':time(duration)+' · '+(film.kind||'影视片段')}</span></div>${stageNav(active)}${content}</div>`;}
function renderUpload(){route='upload';page(shell(`<div class="stage-header"><div class="eyebrow">01 / 选择素材</div><h1>从一部电影开始</h1><p>上传本地视频，或粘贴视频链接，开始认识这个故事。</p></div><div class="upload-layout" style="display:block"><form class="upload-box" id="link-form">${icon('link')}<h2>你想听哪部电影？</h2><label class="field-label" for="video-url">视频链接</label><input class="text-input" id="video-url" name="url" type="text" placeholder="粘贴视频链接" autocomplete="off" maxlength="4096" required><div class="dialog-error" id="link-error" role="status"></div><div class="upload-actions"><button type="button" class="btn" data-action="upload">${icon('plus')}上传本地视频</button><button type="submit" class="btn primary">解析并继续 ${icon('arrow')}</button></div></form></div><div id="local-preview"></div>`,0),'upload');$('#link-form').addEventListener('submit',submitSource);const zone=$('#link-form');zone.addEventListener('dragover',e=>e.preventDefault());zone.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});}
function submitSource(e){e.preventDefault();try{const source=resolveSource($('#video-url').value);selectFilm(defaultFilm.id);startDemo(source);}catch(error){$('#link-error').textContent=error.message;announce(error.message);}}

function beginCreate(){stopAll();selectFilm(defaultFilm.id);if(task&&!task.completed){showModal('继续上次制作？',`<p class="dialog-copy">你还有一份停在「${stageTitle(task)||'认识角色'}」的草稿。</p><div class="dialog-actions"><button class="btn" data-action="new-task">重新开始</button><button class="btn primary" data-action="resume">继续上次制作</button></div>`);return;}task=null;renderUpload();}
function startDemo(source){if(!source)return renderUpload();closeModal();task=newTask(film);task.sourceInput=source;task.mediaPlan=hasStageMedia(film);task.candidate.voice=task.mediaPlan?DEFAULT_VOICE:liveSpeech()?prefs.voice:DEFAULT_VOICE;persist();processing('analyzing','正在认识这个故事',['读取视频','整理出场人物',`整理 ${storySceneTotal()} 个完整场景`,'整理旁白的插入位置'],()=>{renderRoles();},0);}
function mediaTransitionCopy(kind){
 if(!hasStageMedia(film))return null;
 if(kind==='analyzing')return {scope:`${roles.length} 位主要人物 · ${storySceneTotal()} 个场景`,pending:'正在核对人物与场景资料',readyTitle:'人物与场景已整理',readyDetail:'接下来认识主要人物。',status:'人物与场景已整理，按空格认识人物。',next:'认识人物'};
 if(kind==='full')return {scope:'两个场景的完整成片',pending:'正在检查完整成片的播放资源',readyTitle:'完整成片已就绪',readyDetail:'两个场景已组成完整视频，接下来查看成片。',status:'完整成片已就绪，按空格查看完整成片。',next:'查看完整成片',progress:'准备完整成片'};
 if(task?.stage==='short')return {scope:'人物出场片段',pending:'正在检查人物出场片段的播放资源',readyTitle:'人物出场片段已就绪',readyDetail:'接下来试听 10 秒的人物出场片段。',status:'人物出场片段已就绪，按空格进入试听。',next:'进入试听',progress:'准备人物出场试听'};
 if(isSecondScene(task))return {scope:`第 2 个场景 · ${film.scenes[0].title}`,pending:'正在检查第 2 个场景的播放资源',readyTitle:'第 2 个场景已就绪',readyDetail:'接下来在连续场景中试听第 2 个场景。',status:'第 2 个场景已就绪，按空格进入连续场景。',next:'进入连续场景',progress:'准备第 2 个场景试听'};
 return {scope:`首个场景 · ${film.scenes[0].title}`,pending:'正在检查首个场景的播放资源',readyTitle:'首个场景已就绪',readyDetail:'接下来试听完整的首个场景。',status:'首个场景已就绪，按空格进入首个场景。',next:'进入首个场景',progress:'准备首个场景试听'};
}
function processing(kind,title,steps,done,active){
 route=kind;stopAll();const id=++runId;
 const analysis=kind==='analyzing',full=kind==='full';
 const transition=mediaTransitionCopy(kind);
 const labels=analysis?['读取视频信息','加载人物资料','核对镜头与场景','读取旁白时间轴']:['绑定旁白参数','构建审校样片','媒体完整性校验'];
 if(full)labels[1]='准备完整旁白版本';
 if(!analysis&&film.audioMode==='mixed-narration')labels.splice(0,labels.length,...(transition?['核对当前视频范围','检查播放资源',transition.progress]:['核对场景范围','读取成片媒体信息','准备场景试听']));
 const contentDuration=hasStageMedia(film)?analysis?MEDIA_PLANS[film.id].extension.initial.duration:full?film.duration:stageRange(film,task,scenePreviewCount(task)).duration:film.duration;
 const context=transition?`《${esc(film.title)}》 · ${esc(transition.scope)} · ${time(contentDuration)}<br><span id="processing-detail">${esc(transition.pending)}</span>`:`《${esc(film.title)}》 · 内容时长 ${time(contentDuration)}<br>${analysis?'正在读取影片资料与播放资源':'正在检查场景范围与播放资源'}`;
 page(shell(`<section class="processing"><div class="process-icon">${icon('spark')}</div><h1>${title}</h1><p>${context}</p><div id="task-progress"></div></section>`,analysis?1:active),kind);
 main.classList.add('process-page');
 const heading=main.querySelector('.processing h1');
 const view=createTaskProgress($('#task-progress'),{steps:labels,mode:'media',completeLabel:transition?.status||(analysis?'解析已完成，按空格继续。':full?'整片已就绪，按空格继续下一步。':'样片已就绪，按空格继续下一步。'),nextLabel:transition?.next,onReady:()=>{heading.textContent=transition?.readyTitle||(analysis?'内容解析已完成':full?'完整口述成片已就绪':'审校样片已就绪');if(transition)$('#processing-detail').textContent=transition.readyDetail;void say(kind);},onRetry:()=>processing(kind,title,steps,done,active)});
 processingView=view;
 const range=analysis||full?{start:0,duration:film.duration}:stageRange(film,task,scenePreviewCount(task));
 const {start,duration}=range;
 const plan=demoPlan({kind,film,start,duration,settings:task.candidate,videoURL:hasStageMedia(film)?assetURL(stageVideo(film,task,assistantStore)):(window.__TINGJIAN_ASSETS__||location.protocol==='file:')?assetURL(film.video):'/api/media/'+film.fileName,prepareNarration:async signal=>{
  if(liveSpeech())return speech.narration(start,duration,task.candidate,signal,film);
  if(task.candidate.voice!==DEFAULT_VOICE)throw new Error('当前音色需要在线语音服务');
  const key=task.candidate.speed+'-'+task.candidate.density;
  if(!film.fallbackAudio?.[key])throw new Error(hasStageMedia(film)?'缺少当前旁白音频':'缺少本地演示音频');
  return {url:assetURL(film.fallbackAudio[key]),cues:film.narration?.[key]||[],provider:'local-preset'};
 }});
 void runTaskPlan(view,plan).then(ok=>{if(!ok||id!==runId||processingView!==view)return;stopGuide();done();});
}

const storySceneTotal=()=>hasStageMedia(film)?MEDIA_PLANS[film.id].extension.scenes.length:film.scenes.length;
function rolesHTML(){return `<div class="role-grid">${roles.map((r,i)=>`<article class="role-card" data-role="${i}"><div class="role-portrait" role="img" aria-label="${r.name}的人物画面" style="background-image:url('${mediaAsset(r.image)}');background-size:${r.size};background-position:${r.pos};${hasStageMedia(film)?'':'filter:grayscale(1)'}"></div><div class="role-card-body"><div class="role-index">角色 ${String(i+1).padStart(2,'0')} · ${r.nameSource}</div><h3>${r.name}</h3><p>${r.detail}</p><button class="text-btn" data-action="role" data-index="${i}" data-focus-label="再听${esc(r.name)}介绍">${icon('volume')}再听这个角色 <kbd>${i+1}</kbd></button></div></article>`).join('')}</div>`;}
function renderRoles(){route='roles';page(shell(`<div class="stage-header"><div class="eyebrow">02 / 认识角色</div><h1>认识人物</h1><p>${roles.length} 位主要人物 · ${storySceneTotal()} 个场景</p></div>${rolesHTML()}<div class="action-bar"><span class="hint" id="role-hint">${icon('volume')}${prefs.shortcuts?'数字 1—'+Math.min(roles.length,9)+' 再听人物 · ':''}空格继续</span><div class="actions"><button class="btn" data-action="roles-all">${icon('replay')}再听全部</button><button class="btn primary" data-action="confirm">${hasStageMedia(film)?'进入试听':'继续到首个场景'} <kbd>空格</kbd> ${icon('arrow')}</button></div></div>`,1),'roles',true,{guide:false});enterRoles();}
const roleReviewOpen=()=>modal.open&&modal.dataset.kind==='roles';
function enterRoles(){if(prefs.guide&&!prefs.reader)return playRoles();announce(roleIntroduction(roles,{sceneCount:storySceneTotal()})+roleChoices(roles,{shortcuts:prefs.shortcuts,completed:false}));}
function playRole(index){if(roles[index])return playRoles({index});}
async function playRoles({index,review=roleReviewOpen()}={}){
 stopAll();const currentFilm=film;
 const current=()=>film===currentFilm&&!chat.open&&(review?roleReviewOpen():route==='roles'&&!modal.open);
 const steps=roleTourSteps(film,{index,review,shortcuts:prefs.shortcuts});
 const result=await roleTour.play(steps,step=>say(step.key,step.text,true,{sequence:true}),{current,onStep:step=>{
  document.querySelectorAll('.role-card.speaking').forEach(x=>x.classList.remove('speaking'));
  if(step.roleIndex!==undefined)document.querySelector(`[data-role="${step.roleIndex}"]`)?.classList.add('speaking');
  const hint=$('#role-hint');if(hint)hint.textContent=step.roleIndex===undefined?step.text:`正在介绍第 ${step.roleIndex+1} 位，共 ${roles.length} 位：${roles[step.roleIndex].name}`;
  announce(step.text);
 }});
 if(!roleTour.running)document.querySelectorAll('.role-card.speaking').forEach(x=>x.classList.remove('speaking'));
 return result;
}
function repeatCurrentGuide(){
 const detail=modal.open?modal.dataset.guideText:guideDetailPrefix+currentGuideText(currentGuide,{detailed:true});
 if(prefs.reader)return announce(detail+(route==='roles'?roleChoices(roles,{shortcuts:prefs.shortcuts,completed:false}):''));
 if(roleReviewOpen()||route==='roles'&&!modal.open&&!chat.open)return playRoles();
 return say(modal.open?'dialog':currentGuide,detail,true);
}
const stageIndex=stage=>hasStageMedia(film)?stage==='roles'?1:stage==='short'?2:stage==='medium'?(isSecondScene(task)?4:3):5:stage==='roles'?1:stage==='short'?2:stage==='medium'?3:4;
function settingsHTML(settings,version,owner=task){return `<aside class="setting-card"><h3>这次的旁白设置</h3><div class="version">${owner?.stage==='full-review'?'完整视频版本':'场景版本'} ${version} · ${owner?.confirmed?.version===version?'已确认设置':'等待你试听确认'}</div><dl class="settings-summary"><div class="setting-item"><dt>旁白音色</dt><dd class="current-voice-name">${voiceInfo(settings.voice).label}</dd></div><div class="setting-item"><dt>旁白语速</dt><dd>${settings.speed==='slow'?'稍慢，更从容':'自然语速'}</dd></div><div class="setting-item"><dt>旁白音量</dt><dd>${settings.gain===1?'更清晰':'标准'}</dd></div><div class="setting-item"><dt>描述重点</dt><dd>${settings.density==='concise'?'关键画面，少说一点':'人物与关键动作'}</dd></div></dl><p class="footnote">设置只用于本次视频。<br>原片对白、音乐和播放速度保持不变。</p>${owner?.assistantMockApproved?'<p class="assistant-approved-note">已确认标签修改方案；当前播放原有配音，方案保存在旁白助手中。</p>':''}<button class="btn small" data-action="settings">${icon('volume')}切换音色</button><button class="btn small" data-action="chat">${icon('chat')}${owner?.stage==='full-review'?'修改并重新生成':'和 AI 说说问题'}</button></aside>`;}
function playerHTML(label){return `<div class="player-shell"><div class="video-wrap"><video id="film-player" preload="metadata" playsinline poster="${mediaAsset(film.covers[0].file)}" aria-label="${esc(film.title)}，${esc(film.kind||'影片')}"></video><span class="video-label">${icon('headphones')}<span id="video-label-text">${label}</span></span><div class="play-overlay" id="play-overlay"><button data-action="play" aria-label="播放视频">${icon('play')}</button></div><div class="subtitle" id="subtitle" aria-hidden="true"></div></div><div class="scene-playback" id="scene-playback" aria-live="off"></div><div class="player-controls"><input type="range" id="seek" class="seek" min="0" max="${film.duration}" value="0" step="0.1" aria-label="视频播放进度"><div class="control-row"><button class="icon-btn" data-action="play" id="play-button" aria-label="播放">${icon('play')}</button><button class="icon-btn" data-action="back10" aria-label="后退 10 秒">${icon('back10')}</button><button class="icon-btn" data-action="forward10" aria-label="前进 10 秒">${icon('forward10')}</button><span class="time" id="player-time">00:00 / ${time(film.duration)}</span><span class="spacer"></span><button class="narration-toggle" data-action="narration" aria-pressed="true">${icon('headphones')}<span>旁白开启</span></button><button class="icon-btn" data-action="fullscreen" aria-label="全屏播放">${icon('fullscreen')}</button></div></div><div class="media-error" id="media-error" hidden></div></div>`;}
function sceneOverview(count){
 const range=stageRange(film,task,count),confirmed=task.confirmed?.version===task.version?task.confirmedSceneCount||0:0;
 const mediaPlan=hasStageMedia(film),scenes=mediaPlan?MEDIA_PLANS[film.id].extension.scenes:film.scenes;
 const activeStory=isSecondScene(task)?2:1,opening=mediaPlan&&task.stage==='short';
 return `<section class="scene-scope" aria-label="本次场景范围"><div class="scene-scope-heading"><h2>${opening?'人物出场 · '+esc(range.scenes[0].title):count===1?`第 ${range.scenes[0].storyNumber||1} 个场景 · `+esc(range.scenes[0].title):sceneScopeLabel(film,count)}</h2><span>${time(range.duration)}</span></div>${count>1?`<p class="scene-route">${range.scenes.map((s,i)=>`${i+1}. ${esc(s.title)}`).join(' / ')}</p>`:''}<details><summary>${isSecondScene(task)?'当前试听场景':'场景列表'} · 已确认 ${confirmed}/${mediaPlan?scenes.length:film.storySceneCount||film.scenes.length}</summary><ol class="scene-order">${scenes.map((s,i)=>{const number=s.storyNumber||i+1,included=mediaPlan?number===activeStory:i<count;return `<li class="${included?'included':''}"><strong>${number}. ${esc(s.title)}</strong><span>${time(s.end-s.start)} · ${number<=confirmed?'已确认':included?opening?'片段试听':'本次试听':'待制作'}</span></li>`;}).join('')}</ol></details></section>`;
}
function renderSample({introPrefix='',regenerating=false}={}){
 const stage=task.stage;route=stage;const first=stage==='short',count=scenePreviewCount(task),range=stageRange(film,task,count);if(!isSecondScene(task))task.sceneCount=count;
 const scope=sceneScopeLabel(film,count),target=Math.min(3,film.scenes.length);
 const heading=isSecondScene(task)?'接着试听第 2 个场景':hasStageMedia(film)?(first?'先试听人物出场':'试听完整的首个场景，再调整细节'):first?'先确认第一个完整场景':`确认${scope}的连续效果`;
 const sub=isSecondScene(task)?'继续观看山间练习，听完后可以提出修改意见。':hasStageMedia(film)?(first?'先听人物出场的片段，满意后进入首个完整场景。':'听完这个完整场景，可以说出修改意见，试听新版后继续。'):first?`从“${film.scenes[0].title}”开始，听完整个场景再决定是否扩展。`:'按原片顺序连续播放，确认叙述、音色与场景衔接是否合适。';
 const primary=isSecondScene(task)?'满意，完成整片':hasStageMedia(film)?(first?'满意，进入首个场景':'满意，进入连续场景'):first&&film.scenes.length>1?`满意，生成前 ${target} 个场景`:'这些场景满意，生成整片';
 const extend=!first&&count<film.scenes.length?`<button class="btn" data-action="extend-scenes" data-scene-confirm disabled>满意，再扩展到 ${count+1} 个场景</button>`:'';
 const prefix=introPrefix+(task.sceneMigrationNotice||'')+(regenerating?`正在重新生成${scope}，完成后会提示你试听。`:'');
 const entrance=page(shell(`<div class="stage-header"><div class="eyebrow">${hasStageMedia(film)?isSecondScene(task)?'05 / 连续场景':first?'03 / 试听':'04 / 首个场景':first?'03 / 首个场景':'04 / 连续场景'}</div><h1>${heading}</h1><p>${esc(sub)}</p></div>${sceneOverview(count)}<div class="sample-layout"><div>${playerHTML((hasStageMedia(film)&&first?'人物出场试听':scope)+' · 口述版')}<details class="transcript"><summary>${icon('chevron')}查看本次场景的旁白</summary><div id="transcript-text"></div></details></div>${settingsHTML(task.candidate,task.version)}</div><div class="action-bar"><span class="hint"><kbd>空格</kbd> 播放 / 暂停 · <kbd>Enter</kbd> ${first&&hasStageMedia(film)?'确认当前片段':'确认当前场景'}</span><div class="actions"><button class="btn" data-action="replay">${icon('replay')}${first&&hasStageMedia(film)?'再听这段':'再听本次场景'}</button>${extend}<button class="btn primary" data-action="confirm" data-scene-confirm id="confirm-sample" disabled title="等待场景准备完成">${primary} ${icon('arrow')}</button></div></div>`,stageIndex(stage)),stage,true,{introPrefix:prefix});
 delete task.sceneMigrationNotice;const owner=task,version=task.version;if(regenerating)showRegeneration(version);const ready=initPlayer(range.start,range.duration,task.candidate);persist();
 return settleRegeneration(ready,entrance,{current:()=>task===owner&&task.version===version&&scenePreviewCount(task)===count&&route===stage,version,regenerating,full:false});
}
function showRegeneration(version,full=false){
 regenerationBusy=true;pauseMedia();const shell=$('.player-shell');if(!shell)return;
 shell.setAttribute('aria-busy','true');$('#regeneration-status')?.remove();
 $('.video-wrap').insertAdjacentHTML('beforeend',`<div class="regeneration-overlay" id="regeneration-status" role="status"><span class="regeneration-spinner" aria-hidden="true"></span><strong>${full?'正在重新生成完整视频':'正在重新生成'+playbackScope()}</strong><p>第 ${esc(version)} 版 · 正在应用你的修改</p><p>准备好后会提示你试听。</p></div>`);
 main.querySelectorAll('[data-action="play"],[data-action="replay"],[data-action="back10"],[data-action="forward10"],[data-action="narration"],[data-action="fullscreen"],.setting-card button,#seek,#confirm-full').forEach(el=>el.disabled=true);
}
function finishRegeneration(ok){
 regenerationBusy=false;$('#regeneration-status')?.remove();$('.player-shell')?.setAttribute('aria-busy','false');
 main.querySelectorAll('[data-action="play"],[data-action="replay"],[data-action="back10"],[data-action="forward10"],[data-action="narration"],[data-action="fullscreen"],#seek').forEach(el=>el.disabled=!ok);
 main.querySelectorAll('.setting-card button').forEach(el=>el.disabled=false);
}
async function settleRegeneration(ready,entrance,{current,version,regenerating,full}){
 const speechVersion=guideToken;let ok=false;
 try{ok=await ready;}catch(e){if(current())mediaError(e);}
 if(!current())return false;
 if(regenerating)finishRegeneration(ok);
 if(full){
  if(ok)ok=markFullRevisionReady(revision,version);
  if($('#confirm-full'))$('#confirm-full').disabled=!ok;
  if($('#full-review-state'))$('#full-review-state').textContent=ok?`第 ${version} 版已准备好，请试听后保存。`:'生成尚未完成，可以重试或继续修改。';
  persist();
 }
 if(regenerating&&ok){
  const words=full?'新版已就绪，请试听。':'场景已就绪，请试听。';
  announce(words);await entrance;
  if(current()&&guideToken===speechVersion&&!playing&&!modal.open&&!chat.open)say('regeneration-ready',words);
 }
 return ok;
}
function renderFullRevision({introPrefix=''}={}){
 if(!revision||!selectFilm(revision.assetId))return Promise.resolve(false);
 const owner=revision,version=revision.version;revision.renderedVersion=null;revision.confirmed=null;route='full-review';
 const entrance=page(`<div class="container"><div class="back-row"><button class="text-btn" data-action="home">${icon('back')}保存草稿并返回</button><span>完整视频修改 · 第 ${version} 版</span></div><div class="stage-header"><div class="eyebrow">${hasStageMedia(film)?'06':'05'} / 完整视频复看</div><h1>完整视频，也可以继续调整</h1><p>${esc(revision.title)} · 原版保留，新版满意后再保存。</p></div><div class="sample-layout"><div>${playerHTML('正在重新生成完整视频')}<p class="sample-context" id="full-review-state">正在应用你的修改。</p><details class="transcript"><summary>${icon('chevron')}查看新版口述旁白</summary><div id="transcript-text"></div></details></div>${settingsHTML(revision.candidate,version,revision)}</div><div class="action-bar"><span class="hint"><kbd>空格</kbd> 播放或暂停</span><div class="actions"><button class="btn" data-action="revision-original" ${revision.sourceSnapshot?'':'disabled'}>返回原版</button><button class="btn primary" data-action="save-revision" id="confirm-full" disabled>满意，保存新版 ${icon('save')}</button></div></div></div>`,'full-review',true,{introPrefix});
 showRegeneration(version,true);const ready=initPlayer(0,film.duration,revision.candidate,0);persist();
 return settleRegeneration(ready,entrance,{current:()=>revision===owner&&revision.version===version&&route==='full-review',version,regenerating:true,full:true});
}
function saveFullRevision(){
 if(!revision||!playerReady||regenerationBusy)return toast('请等新版准备好后再保存。');
 const owner=revision;let item;try{item=acceptFullRevision(owner);}catch(e){return toast(e.message);}
 const original=owner.sourceSnapshot&&!library.some(x=>x.id===owner.sourceSnapshot.id)?{...owner.sourceSnapshot,settings:{...owner.sourceSnapshot.settings}}:null;
 const previousSaved=task?.saved;if(original){library.unshift(original);if(task?.id===original.id)task.saved=true;}
 library.unshift(item);owner.saved=true;revision=null;
 if(!persist()){library.shift();if(original)library.splice(library.findIndex(x=>x.id===original.id),1);if(task)task.saved=previousSaved;revision=owner;owner.completed=false;owner.saved=false;owner.confirmed=null;return toast('保存失败，请检查浏览器存储后重试。');}
 openWatch(item,false);toast('新版已保存，原版保留。');
}
function resumeRevision(){closeModal();stopAll();runId++;return renderFullRevision();}
async function confirm(direction='full'){if(film.projectId)return confirmUploaded(direction);if(!task||regenerationBusy||assistant.busy||['analyzing','generating','full'].includes(route)||(!playerReady&&route!=='roles'))return;const session=assistantStore.sessions[task.id+':'+film.scenePlanVersion];if(session&&film.scenes.slice(0,scenePreviewCount(task)).some(s=>session.candidates[s.id])){toast('还有待确认的新配音，请先在旁白助手里确认或放弃新版。');return openChat();}if(hasStageMedia(film)&&task.stage==='medium'){
 task.acceptedS1Id=assistantStore.mediaVersions?.[task.id]?.s1?.id;
 if(isSecondScene(task)&&!assembledMediaReady(film)){task.secondConfirmed=true;persist();toast('完整成片还在准备中。第二场景可以继续观看，你的确认和修改意见已保留。');return;}
 }
 stopAll();let next;
 try{next=confirmStage(task,direction);}catch(e){toast(e.message);return;}
 persist();
 if(next==='full'){
  if(hasStageMedia(film)){task.mediaExtended=true;film=stageFilm(findFilm(task.assetId),task);persist();}
  if(!canComplete(task)){toast('请先确认当前版本的完整场景。');return;}
  processing('full',hasStageMedia(film)?'正在准备完整成片':'按已确认的效果，生成全部场景',['应用已确认的旁白设置','按顺序衔接全部场景','准备完整成片'],()=>{task.completed=true;task.stage='complete';persist();renderComplete();},stageIndex('full'));
 }else{
  film=stageFilm(findFilm(task.assetId)||film,task);
  if(next==='medium')toast(hasStageMedia(film)?isSecondScene(task)?'首个场景已确认，进入连续场景。':'试听已完成，进入首个场景。':`已确认前 ${task.confirmedSceneCount} 个场景的效果`);
  const label=hasStageMedia(film)?next==='short'?'人物出场试听':isSecondScene(task)?'连续场景中的第 2 个场景':'完整的首个场景':sceneScopeLabel(film,scenePreviewCount(task));
  const steps=hasStageMedia(film)?['核对当前视频范围','检查播放资源','准备试听']:['应用本次旁白设置','保留完整场景边界','准备连续场景播放'];
  processing('generating',`正在准备${label}`,steps,renderSample,stageIndex(next));
 }
}
function downloadHTML(owner,classes='btn block'){
 if(!owner?.mediaExtended||!hasStageMedia(film))return '';
 return `<a class="${classes}" data-download="full" href="${esc(assetURL(stageVideo(film,owner,assistantStore)))}" download="听见-哪吒之魔童闹海-双场景口述版.mp4">下载完整视频</a>`;
}
function renderComplete(){film=stageFilm(findFilm(task.assetId)||film,task);route='complete';page(shell(`<div class="stage-header"><div class="eyebrow">${hasStageMedia(film)?'06':'05'} / 制作完成</div><h1>你的故事，现在可以听见了</h1><p>${hasStageMedia(film)?'两个场景的完整视频已准备好，可以连续观看。':task.assistantMockApproved?'整段视频已准备好。新的标签修改方案已保存；当前仍使用原有配音。':'按照你确认的旁白设置，整段视频已准备好。'}</p></div><div class="complete-card"><img src="${mediaAsset(film.covers[Math.min(2,film.covers.length-1)].file)}" alt="${esc(film.covers[Math.min(2,film.covers.length-1)].alt)}"><div><div class="success-line">${icon('check')}完整口述影像已就绪</div><h2>${esc(film.title)}</h2><p>${durationWords(film.duration)} · 中文原声与口述旁白<br>${hasStageMedia(film)?'两个场景 · 完整视频':`${task.candidate.speed==='slow'?'稍慢语速':'自然语速'} · ${task.candidate.density==='concise'?'简洁描述':'适中描述'}`}</p><button class="btn primary block" data-action="watch-new">${icon('play')}播放完整视频</button>${downloadHTML(task)}<button class="btn block" data-action="save" ${task.saved?'disabled':''}>${icon('save')}${task.saved?'已加入我的视频':'加入我的视频'}</button><button class="btn block" data-action="library">打开我的视频</button><button class="btn block" data-action="revise-full">${icon('chat')}修改并重新生成</button></div></div>`,stageIndex('complete')),'complete');}
async function openWatch(item,autoplay=true){stopAll();if(item.sourceProjectId){try{const p=await projectRequest(item.sourceProjectId);updateUploaded(p);if(p.workflow.status!=='complete'){taskFromUploaded(p);if(p.workflow.status==='generating'||['error','paused','interrupted'].includes(p.workflow.status))return showUploadedProgress(p);return p.workflow.stage==='roles'?renderRoles():renderSample();}}catch(e){return toast(e.message);}}if(!selectFilm(item.assetId))return toast('这部影片暂时不可用。');watching=item;film=stageFilm(film,item);route='watch';const guided=page(`<div class="container watch-layout"><div class="back-row"><button class="text-btn" data-action="library">${icon('back')}返回我的视频</button><span class="task-name">${esc(film.kind)} · 完整版</span></div><div class="watch-heading"><div><h1>${esc(item.title)}</h1><p>${esc(film.description)} · ${time(film.duration)}</p></div><button class="btn" data-action="save" ${library.some(x=>x.id===item.id)?'disabled':''}>${icon('save')}${library.some(x=>x.id===item.id)?'已加入我的视频':'加入我的视频'}</button></div>${playerHTML('完整视频 · 口述版')}<div class="action-bar"><div class="actions"><button class="btn small" data-action="replay">${icon('replay')}从头播放</button><button class="btn small" data-action="watch-roles">查看角色介绍</button>${downloadHTML(item,'btn small')}<button class="btn small" data-action="version-history">版本历史</button>${hasNarration(film)?`<button class="btn small" data-action="revise-full">${icon('chat')}修改并重新生成</button>`:''}</div><button class="text-btn" data-action="caption">${icon('check')}口述字幕开启</button></div><details class="transcript"><summary>${icon('chevron')}查看口述旁白文本</summary><div id="transcript-text"></div></details><p class="inline-note">${icon('info')}${esc(film.credits)}</p></div>`,'watch');const ready=initPlayer(0,film.duration,item.settings,item.position<film.duration-2?item.position:0);const autoplaySequence=keyboardReader.sequence;await ready;await guided;if(autoplay&&keyboardReader.sequence===autoplaySequence&&route==='watch'&&watching===item&&!modal.open&&!assistant.touched&&!voiceCapturing())playMedia();}
function saveFilm(){
 const source=route==='watch'?watching:task?.completed?{id:task.id,assetId:task.assetId,title:task.title,mediaExtended:task.mediaExtended,settings:task.confirmed,sourceProjectId:task.sourceProjectId,position:0}:null;
 if(!source||route==='watch'&&!playerReady)return toast('请等视频准备好后再保存。');
 if(library.some(x=>x.id===source.id))return toast('这个视频已经在你的视频库中。');
 const item={...source,settings:{...source.settings},position:source.position||0,created:Date.now()};
 const previousSaved=task?.saved;library.unshift(item);if(task?.id===item.id)task.saved=true;
 if(!persist()){library.shift();if(task)task.saved=previousSaved;return;}
 document.querySelectorAll('[data-action="save"]').forEach(b=>{b.innerHTML=icon('check')+'已加入我的视频';b.disabled=true;});toast('已加入我的视频，下次可以继续播放');say('saved');
}
function freshWatch(){return {id:task.id,assetId:film.id,title:task.title,mediaExtended:task.mediaExtended,settings:{...task.confirmed},sourceProjectId:task.sourceProjectId,position:0};}
function mediaReady(el){return new Promise((resolve,reject)=>{if(el.readyState>=1)return resolve();const timeout=setTimeout(()=>{cleanup();reject(new Error('媒体读取超时，请重试。'));},30000);const cleanup=()=>{clearTimeout(timeout);el.removeEventListener('loadedmetadata',loaded);el.removeEventListener('error',failed);};const loaded=()=>{cleanup();resolve();};const failed=()=>{cleanup();reject(new Error('视频或旁白暂时无法读取，请重试。'));};el.addEventListener('loadedmetadata',loaded,{once:true});el.addEventListener('error',failed,{once:true});});}
async function initPlayer(start,duration,settings,position=0,candidate=null){
 mediaAbort?.abort();mediaAbort=new AbortController();const signal=mediaAbort.signal;
 const generation=++mediaGeneration;player=$('#film-player');if(!player)return false;const v=player;clipStart=start;clipEnd=start+duration;playing=false;playerReady=false;narrationOn=true;captionOn=true;lastSavedPosition=0;
 updatePlayButtons();
 const mediaOwner=route==='watch'?watching:activeTask();
  v.src=hasStageMedia(film)?assetURL(candidate?.videoUrl||stageVideo(film,mediaOwner,assistantStore,{original:candidate?.original})):film.sourceUrl||((window.__TINGJIAN_ASSETS__||location.protocol==='file:')?assetURL(film.video):'/api/media/'+film.fileName);v.playbackRate=1;narration.playbackRate=1;narration.preload='auto';narration.volume=settings.gain;
 $('#seek').max=duration;$('#seek').oninput=e=>seekTo(clipStart+Number(e.target.value));
 $('#media-error').hidden=true;const narrationToggle=$('[data-action="narration"]');narrationToggle.disabled=regenerationBusy;narrationToggle.setAttribute('aria-pressed','true');narrationToggle.innerHTML=icon('headphones')+'<span>旁白开启</span>';const captionToggle=$('[data-action="caption"]');if(captionToggle)captionToggle.innerHTML=icon('check')+'口述字幕开启';
 v.ontimeupdate=updateProgress;v.onended=()=>{pauseMedia();updateProgress();};v.onpause=()=>{if(v!==player)return;narration.pause();playing=false;updatePlayButtons();};
 v.onerror=()=>{if(v===player)mediaError(new Error('视频读取失败，请检查网络后重试。'));};
 audioOffset=0;
 const key=`${settings.speed}-${settings.density}`;activeNarrationCues=film?.narration?.[key]||[];currentAudioSource='local';
 const label=$('#video-label-text');let src=assetURL(film.fallbackAudio?.[key]||'');
 if(film.audioMode==='mixed-narration'){
  narrationOn=false;captionOn=false;narration.pause();narration.removeAttribute('src');narration.load();
  narrationToggle.disabled=true;narrationToggle.setAttribute('aria-pressed','true');narrationToggle.innerHTML='<span>成片内置旁白</span>';narrationToggle.title='电影原声与旁白已混合，不能单独关闭';
  if(captionToggle){captionToggle.disabled=true;captionToggle.textContent='字幕已在成片内';}
  if(label)label.textContent=playbackScope()+' · 口述版';
  const shownCues=candidate?.cues||stageCues(film,mediaOwner,assistantStore,{original:candidate?.original});
   const transcript=$('#transcript-text');if(transcript)transcript.innerHTML=shownCues.filter(c=>c.start<clipEnd&&c.end>clipStart).map(c=>`<p><time>${time(c.start)}</time> ${esc(c.text)}${c.reviewStatus==='pending'?' <small>（这句文字正在核对）</small>':''}</p>`).join('');
  try{await mediaReady(v);if(generation!==mediaGeneration)return false;v.currentTime=Math.max(start,Math.min(clipEnd,position||start));playerReady=true;updatePlayButtons();main.querySelectorAll('[data-scene-confirm]').forEach(b=>{b.disabled=false;b.removeAttribute('title');});updateProgress();return true;}catch(e){if(generation===mediaGeneration)mediaError(e);return false;}
 }
 if(!hasNarration(film)){narrationOn=false;narration.removeAttribute('src');const toggle=$('[data-action="narration"]');toggle.disabled=true;toggle.setAttribute('aria-pressed','false');toggle.innerHTML='原片声音';if(label)label.textContent='原声视频';$('[data-action="watch-roles"]')?.remove();main.querySelector('.transcript')?.setAttribute('hidden','');try{await mediaReady(v);if(generation!==mediaGeneration)return false;v.currentTime=position||0;playerReady=true;updatePlayButtons();main.querySelectorAll('[data-scene-confirm]').forEach(b=>b.disabled=false);updateProgress();return true;}catch(e){mediaError(e);return false;}}
 if(!liveSpeech()&&!film.projectId&&(settings.voice||DEFAULT_VOICE)!==DEFAULT_VOICE){mediaError(new Error('所选音色需要在线合成，请开启在线语音或切换默认音色。'));return false;}
 let current=null;
 if(!candidate){
  const owner=route==='watch'?watching:activeTask();
  try{current=await backendAssistant.current(owner?.id);if(generation!==mediaGeneration)return false;}
  catch(error){if(generation===mediaGeneration)mediaError(error);return false;}
 }
 if(liveSpeech()&&!candidate&&!film.projectId&&!current?.originalNarrationUrl){
  if(label)label.textContent='正在合成中文旁白…';announce('正在通过豆包语音合成本段旁白。');
  try{const result=await speech.narration(start,duration,settings,signal,film);if(generation!==mediaGeneration)return false;src=result.url;activeNarrationCues=result.cues;currentAudioSource='volcengine';}
  catch(e){if(signal.aborted||generation!==mediaGeneration)return false;if((settings.voice||DEFAULT_VOICE)!==DEFAULT_VOICE){mediaError(new Error(e.message+' 可以重试或切换默认音色。'));return false;}toast(e.message+(hasStageMedia(film)?' 已使用现有旁白音频。':' 已使用本地演示音频。'));}
 }
 if(current?.originalNarrationUrl){src=current.originalNarrationUrl;activeNarrationCues=current.film.scenes.flatMap(s=>s.cues);currentAudioSource='revision';}
 if(candidate?.narrationUrl){src=candidate.narrationUrl;activeNarrationCues=candidate.cues;audioOffset=candidate.start;currentAudioSource='revision';narration.volume=Math.min(1,candidate.masterGain||settings.gain);}
 if(generation!==mediaGeneration)return false;
 narration.src=src;if(label)label.textContent=`${playbackScope()} · ${currentAudioSource==='revision'?'新版旁白':currentAudioSource==='volcengine'?'豆包 · '+voiceInfo(settings.voice).name:'本地默认旁白'}`;
 const relevant=activeNarrationCues.filter(c=>c.start>=start&&c.start<clipEnd);$('#transcript-text')&&($('#transcript-text').innerHTML=relevant.map(c=>`<p><span class="film-meta">${time(c.start)}</span>${esc(c.text)}</p>`).join(''));
 try{await Promise.all([mediaReady(v),mediaReady(narration)]);if(generation!==mediaGeneration)return false;v.currentTime=Math.max(start,Math.min(clipEnd,position||start));narration.currentTime=Math.max(0,v.currentTime-audioOffset);playerReady=true;updatePlayButtons();main.querySelectorAll('[data-scene-confirm]').forEach(b=>{b.disabled=false;b.removeAttribute('title');});updateProgress();announce((playbackScope()+'旁白')+'已准备好，'+(currentAudioSource==='revision'?'使用实际生成的新版配音。':film.projectId?'使用已生成的配音。':currentAudioSource==='volcengine'?'由豆包语音合成。':hasStageMedia(film)?'使用现有旁白音频。':'使用本地演示音频。'));return true;}catch(e){if(generation===mediaGeneration)mediaError(e);return false;}
}
function mediaError(e){pauseMedia();const box=$('#media-error');if(box){box.hidden=false;box.innerHTML=`${esc(e?.message||'播放未开始，请重试。')} <button class="text-btn" data-action="retry-media">重新加载</button>`;}announce('播放未开始，请重试。');}
function updatePlayButtons(){main.querySelectorAll('[data-action="play"]').forEach(b=>{b.disabled=!playerReady;b.setAttribute('aria-label',playerReady?(playing?'暂停':'播放'):'正在准备视频与旁白');});const btn=$('#play-button');if(btn){btn.innerHTML=icon(playing?'pause':'play');btn.setAttribute('aria-label',playerReady?(playing?'暂停':'播放'):'正在准备视频与旁白');}const overlay=$('#play-overlay');if(overlay)overlay.style.display=playing?'none':'grid';}
async function playMedia(){
 assistant.cancelVoice();
 if(!playerReady){toast('视频正在准备，请稍候再播放。');return;}
 keyboardReader.stop();stopGuide();if(!player)return;const v=player;const generation=mediaGeneration;
 if(v.currentTime>=clipEnd-.08||v.currentTime<clipStart)v.currentTime=clipStart;
 if(narration.src)narration.currentTime=Math.max(0,v.currentTime-audioOffset);playing=true;$('#media-error').hidden=true;updatePlayButtons();
 try{await v.play();if(generation!==mediaGeneration||v!==player||!playing)return;if(narrationOn){narration.currentTime=Math.max(0,v.currentTime-audioOffset);await narration.play();}if(generation!==mediaGeneration||v!==player||!playing)return;raf=requestAnimationFrame(syncFrame);}catch{if(generation===mediaGeneration&&v===player&&playing)mediaError(new Error('播放未开始，请再次点击播放。'));}
}
function syncFrame(){if(!playing||!player)return;if(player.currentTime>=clipEnd-.015){player.currentTime=Math.max(clipStart,clipEnd-.001);pauseMedia();updateProgress();return;}if(narrationOn&&Math.abs(narration.currentTime+audioOffset-player.currentTime)>.20)if(narration.src)narration.currentTime=Math.max(0,player.currentTime-audioOffset);updateProgress();raf=requestAnimationFrame(syncFrame);}
function updateProgress(){if(!player)return;const at=player.currentTime;const elapsed=Math.max(0,Math.min(clipEnd-clipStart,at-clipStart));if($('#seek')){$('#seek').value=elapsed;$('#seek').setAttribute('aria-valuetext',durationWords(elapsed)+'，共'+durationWords(clipEnd-clipStart));}$('#player-time')&&($('#player-time').textContent=`${time(elapsed)} / ${time(clipEnd-clipStart)}`);
 const sceneIndex=film.scenes?.findIndex(s=>Math.min(at,clipEnd-.001)>=s.start&&Math.min(at,clipEnd-.001)<s.end)??-1;
 if(sceneIndex>=0)assistant.syncPlayhead(film.scenes[sceneIndex].id,at);
 const sceneLabel=$('#scene-playback');if(sceneLabel){sceneLabel.hidden=sceneIndex<0;const text=sceneIndex>=0?hasStageMedia(film)&&route==='short'?`人物出场片段 · ${film.scenes[sceneIndex].title}`:`场景 ${film.scenes[sceneIndex].storyNumber||sceneIndex+1}/${hasStageMedia(film)?storySceneTotal():film.storySceneCount||film.scenes.length} · ${film.scenes[sceneIndex].title}`:'';if(sceneLabel.textContent!==text)sceneLabel.textContent=text;}
 const settings=playerSettings();const key=settings?`${settings.speed}-${settings.density}`:'normal-balanced';let cue=film?.dialogues?.find(x=>at>=x.start&&at<x.end);if(!cue&&narrationOn)cue=(activeNarrationCues||film?.narration?.[key])?.find(x=>at>=x.start&&at<x.end);if($('#subtitle'))$('#subtitle').innerHTML=captionOn&&cue?`<span>${cue.kind==='narration'||!cue.speaker?'口述 · ':esc(cue.speaker)+'：'}${esc(cue.text)}</span>`:'';
 if(route==='watch'&&watching){watching.position=at;const entry=library.find(x=>x.id===watching.id);if(entry)entry.position=at;if(Math.abs(at-lastSavedPosition)>4){persist();lastSavedPosition=at;}}
}
function seekTo(at){if(!playerReady)return;const keep=playing;player.currentTime=Math.max(clipStart,Math.min(clipEnd-.001,at));if(narration.src)narration.currentTime=Math.max(0,player.currentTime-audioOffset);updateProgress();if(keep&&player.currentTime<clipEnd&&!playing)playMedia();}
function replay(){if(!playerReady)return;pauseMedia();seekTo(clipStart);playMedia();}
function toggleNarration(){if(film.audioMode==='mixed-narration')return;narrationOn=!narrationOn;const b=$('[data-action="narration"]');b.setAttribute('aria-pressed',String(narrationOn));b.innerHTML=icon('headphones')+`<span>${narrationOn?'旁白开启':'原片声音'}</span>`;$('#video-label-text').textContent=narrationOn?(route==='watch'?`完整视频 · ${currentAudioSource==='volcengine'?'豆包合成旁白':(hasStageMedia(film)?'口述旁白':'本地演示旁白')}`:`${playbackScope()} · ${currentAudioSource==='volcengine'?'豆包合成旁白':(hasStageMedia(film)?'口述旁白':'本地演示旁白')}`):'原片 · 口述旁白已关闭';if(!narrationOn)narration.pause();else if(playing){narration.currentTime=Math.max(0,player.currentTime-audioOffset);narration.play().catch(mediaError);}updateProgress();announce(narrationOn?'口述旁白已开启':'口述旁白已关闭，正在播放原片声音');}
async function showVersionHistory(){
 stopAll();const owner=route==='watch'?watching:activeTask(),source=assistantStore.sources[owner?.id];
 if(hasStageMedia(film)){
  const versions=mediaHistory(film,owner,assistantStore);showModal('版本历史',`<p class="dialog-copy">选择一个版本试听，已采用版本保持不变。</p>${versions.map((v,i)=>`<p><button class="btn" data-media-history="${i}">${esc(v.label)}</button></p>`).join('')}`);
  modal.querySelectorAll('[data-media-history]').forEach(b=>b.onclick=()=>{const v=versions[Number(b.dataset.mediaHistory)];closeModal();void initPlayer(0,film.duration,playerSettings(),0,{videoUrl:v.video});});return;
 }
 if(!source?.projectId){showModal('版本历史','<p class="dialog-copy">当前为原始版本，生成并采用新配音后会在这里保留历史。</p>');return;}
 try{const p=await projectRequest(source.projectId),versions=[...(p.workflow.history||[]),p.workflow.current].filter(v=>v?.result?.narrationUrl);
 showModal('版本历史',`<p class="dialog-copy">历史配音保留。选择一个版本试听，不会覆盖当前配音。</p>${versions.map((v,i)=>`<p><button class="btn" data-history="${i}">${i===versions.length-1?'当前版本':'历史版本 '+(i+1)} · ${time(v.end-v.start)}</button></p>`).join('')}`);
 modal.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{const v=versions[Number(b.dataset.history)];closeModal();void initPlayer(v.start,v.end-v.start,playerSettings(),v.start,{start:v.start,end:v.end,narrationUrl:v.result.narrationUrl,cues:v.result.cues.map(c=>({...c,start:c.start+v.start,end:c.end+v.start})),masterGain:v.settings.gain});});
 }catch(e){toast(e.message);}
}
function showModal(title,content,options={}){stopAll();returnFocus=document.activeElement;modal.dataset.kind=options.kind||'';modal.innerHTML=`<div class="dialog-heading"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div>${content}`;modal.showModal();const detail=modal.querySelector('.dialog-copy')?.textContent||'';modal.dataset.guideText=`当前打开${title}。${detail}按 Tab 选择操作，按 Shift 加 Tab 返回上一个操作，按 Esc 关闭。`;if(options.guide!==false)say('dialog',title+(/[。！？?]$/.test(title)?'':'。'));}
function closeModal(){if(!modal.open)return;stopGuide();modal.close();if(returnFocus?.isConnected)returnFocus.focus();}
function showRoleReview(title='故事里的主要人物'){
 showModal(title,rolesHTML()+`<p class="dialog-copy">${esc(roleChoices(roles,{shortcuts:prefs.shortcuts,review:true,completed:false}))}</p><div class="dialog-actions"><button class="btn primary" data-action="close-modal">${route==='watch'?'返回观看':'返回当前步骤'}</button></div>`,{kind:'roles',guide:false});
 modal.classList.add('wide-modal');if(prefs.guide&&!prefs.reader)playRoles({review:true});else announce(roleIntroduction(roles,{review:true}));
}
function promptRateSettings(){return `<fieldset class="voice-picker prompt-rate-picker"><legend>分别设置语速</legend><p class="voice-hint">三项独立保存，均支持 1—5 倍。视频与口述旁白按各自设置播放。</p>${PROMPT_CHANNELS.map(({id,label,hint})=>`<div class="prompt-rate-control"><div class="prompt-rate-heading"><label for="prompt-rate-${id}">${label}</label><output id="prompt-rate-${id}-value" for="prompt-rate-${id}" aria-hidden="true">${promptRateLabel(prefs.promptRates[id])}</output></div><input id="prompt-rate-${id}" data-prompt-rate="${id}" type="range" min="1" max="5" step="0.5" value="${prefs.promptRates[id]}" aria-label="${label}" aria-valuetext="${promptRateLabel(prefs.promptRates[id])}" aria-describedby="prompt-rate-${id}-help"><div class="prompt-rate-scale" aria-hidden="true"><span>1 倍</span><span>3 倍</span><span>5 倍</span></div><p class="voice-hint" id="prompt-rate-${id}-help">${hint}用左右方向键调节。</p><div class="voice-buttons"><button class="btn small" data-action="preview-prompt-rate" data-channel="${id}" aria-label="试听${label}">${icon('play')}试听</button><button class="btn small" data-action="reset-prompt-rate" data-channel="${id}" aria-label="${label}恢复 1 倍">恢复 1 倍</button></div><p id="prompt-rate-${id}-status" class="voice-hint prompt-rate-status" role="status"></p></div>`).join('')}</fieldset>`;}
function setPromptRate(channel,value){
 stopAll();prefs.promptRates=setChannelRate(prefs.promptRates,channel,value);persist();const rate=prefs.promptRates[channel];
 const slider=$('#prompt-rate-'+channel);if(slider){slider.value=rate;slider.setAttribute('aria-valuetext',promptRateLabel(rate));}
 $('#prompt-rate-'+channel+'-value').textContent=promptRateLabel(rate);
 $('#prompt-rate-'+channel+'-status').textContent='已保存为 '+promptRateLabel(rate)+'。';
}
function showSettings(){const current=route==='full-review'?revision?.candidate.voice:route==='watch'?watching?.settings.voice:task&&['roles','short','medium'].includes(route)?task.candidate.voice:prefs.voice;showModal('语音、音色与快捷键',`<p class="dialog-copy">选择喜欢的旁白声音。Tab 前进，Shift + Tab 后退，选中操作即朗读名称。</p><fieldset class="voice-picker"><legend>豆包音色</legend><label class="field-label" for="voice-select">选择音色</label><select id="voice-select" class="text-input">${VOICES.map(v=>`<option value="${v.id}" ${(current||DEFAULT_VOICE)===v.id?'selected':''}>${v.label}</option>`).join('')}</select><div class="voice-buttons"><button class="btn small" data-action="preview-voice">${icon('play')}试听音色</button><button class="btn primary small" data-action="apply-voice">使用此音色</button></div><p class="voice-hint" id="voice-preview-status" role="status">用于操作引导、当前观看或试听，以及后续新任务。已保存的口述版本保留各自设置。</p>${!liveSpeech()?'<p class="voice-hint">当前使用本地音频。可试听各个音色；应用其他音色需要开启在线合成。</p>':''}</fieldset>${promptRateSettings()}<div class="preference-row"><div><strong>Tab 焦点播报</strong><p>每次切换按钮立即读名称；会先暂停视频，避免声音重叠。</p></div><button class="switch" role="switch" aria-label="Tab 焦点播报" aria-checked="${prefs.focusReadout&&!prefs.reader}" data-action="pref-focus"></button></div><div class="preference-row"><div><strong>在线语音合成</strong><p>${speech.available?'豆包语音 · 支持多种音色':'在线服务未连接，使用本地默认旁白'}</p></div><button class="switch" role="switch" aria-label="在线语音合成" aria-checked="${liveSpeech()}" data-action="pref-online" ${speech.available?'':'disabled'}></button></div><div class="preference-row"><div><strong>产品语音引导</strong><p>听取当前步骤和操作提示</p></div><button class="switch" role="switch" aria-label="产品语音引导" aria-checked="${prefs.guide&&!prefs.reader}" data-action="pref-guide"></button></div><div class="preference-row"><div><strong>读屏优先</strong><p>关闭站内引导与焦点播报，避免重复朗读</p></div><button class="switch" role="switch" aria-label="读屏优先" aria-checked="${prefs.reader}" data-action="pref-reader"></button></div><div class="preference-row"><div><strong>数字与语音快捷键</strong><p>1—9 选择影片或角色；O 启动语音输入</p></div><button class="switch" role="switch" aria-label="数字与语音快捷键" aria-checked="${prefs.shortcuts}" data-action="pref-shortcuts"></button></div><div class="dialog-actions"><button class="btn" data-action="stop-guide">停止提示</button><button class="btn primary" data-action="close-modal">完成</button></div>`);modal.querySelectorAll('[data-prompt-rate]').forEach(el=>el.addEventListener('input',e=>setPromptRate(el.dataset.promptRate,e.target.value)));}
async function playVoiceSample(id,rate,status){stopAll();guide.src=assetURL('assets/voice-preview-'+id+'.wav');applyPromptAudioRate(guide,rate);$(status).textContent='正在以 '+promptRateLabel(rate)+' 试听：'+voiceInfo(id).label;guide.onended=()=>{if($(status))$(status).textContent='试听结束。';};try{await guide.play();}catch{toast('试听未开始，请再点击一次。');}}
function previewVoice(){return playVoiceSample($('#voice-select').value,1,'#voice-preview-status');}
function previewPromptRate(channel){
 if(!PROMPT_CHANNELS.some(({id})=>id===channel))return;
 const rate=prefs.promptRates[channel],status='#prompt-rate-'+channel+'-status';
 if(channel!=='focus')return playVoiceSample(prefs.voice,rate,status);
 stopAll();if(!window.speechSynthesis)return toast('当前浏览器暂不支持焦点语音。');
 const utterance=promptUtterance('创建新视频。再听提示。再听角色介绍。',rate);
 $(status).textContent='正在以 '+promptRateLabel(rate)+' 试听 Tab 播报。';
 utterance.onend=()=>{if($(status))$(status).textContent='试听结束。';};window.speechSynthesis.speak(utterance);
}
async function applyVoice(){const id=$('#voice-select').value;if(!isVoice(id))return;if(hasStageMedia(film)&&['short','medium'].includes(route)){toast('当前视频已内置旁白；请在旁白助手中修改视频音色。');return;}if(id!==DEFAULT_VOICE&&!liveSpeech()){toast('请先开启在线语音，再应用这个音色。');return;}stopAll();prefs.voice=id;if(route!=='full-review')for(const item of library)if(item.public)item.settings.voice=id;let remake=false;
 if(task&&['roles','short','medium'].includes(route))remake=changeNarrationVoice(task,id);if(route==='full-review'&&revision)remake=changeNarrationVoice(revision,id);
 if(route==='watch'&&watching)watching.settings.voice=id;
 persist();closeModal();
 if(remake&&['short','medium'].includes(route)){await renderSample();toast('已选择'+voiceInfo(id).name+'，请试听新版再确认。');}
 else if(route==='full-review'&&revision&&remake){await renderFullRevision({introPrefix:'已切换音色。'});}else if(route==='watch'&&watching){const at=player?.currentTime||0;await initPlayer(0,film.duration,watching.settings,at);if(playerReady)toast('当前影片已切换为'+voiceInfo(id).name+'。');}
 else toast('已选择'+voiceInfo(id).name+'，后续引导和新任务使用这个声音。');
}
function showHelp(){showModal('用你习惯的方式操作',`<p class="dialog-copy">所有操作都可以用键盘完成。人物介绍页按空格继续、按数字键再听人物。输入框内保留正常输入。</p><table class="help-table"><tbody><tr><td><kbd>空格</kbd></td><td>首页创建 · 人物页继续 · 试听页播放或暂停</td></tr><tr><td><kbd>1—9</kbd></td><td>按当前编号播放视频、再听角色</td></tr><tr><td><kbd>Tab</kbd></td><td>移动到下一个操作，并朗读按钮名称</td></tr><tr><td><kbd>Shift + Tab</kbd></td><td>返回上一个操作，并朗读名称</td></tr><tr><td><kbd>O</kbd></td><td>非输入区域开始语音输入；录音中再按 O 结束识别</td></tr><tr><td><kbd>Enter</kbd></td><td>输入框发送文字；录音中结束识别并发送最终文字</td></tr><tr><td><kbd>Shift + Enter</kbd></td><td>输入框内换行</td></tr><tr><td><kbd>Esc</kbd></td><td>停止录音或播报；关闭提示词预览；助手保持展开</td></tr></tbody></table><p class="inline-note">中文语音输入由浏览器识别，首次需允许麦克风。录音期间暂停影片和播报；发送文字不会直接执行修改。侧栏右上角“使用帮助”可查看快捷键和播报规则。</p><div class="dialog-actions"><button class="btn" data-action="reset-confirm">${hasStageMedia(film)?'重置当前制作':'重置演示'}</button><button class="btn primary" data-action="close-modal">知道了</button></div>`);}
function showLink(){renderUpload();$('#video-url').focus();}
async function handleFile(file){
 if(!file)return;if(file.size>500*1024*1024)return toast('文件超过 500 MB');stopAll();
 const zone=$('#local-preview');if(zone)zone.innerHTML='<p role="status">正在上传视频…</p>';
 try{const p=await uploadVideo(file,prefs.voice);taskFromUploaded(p);showUploadedProgress(p);}catch(e){if(zone)zone.textContent=e.message;toast(e.message);}
}
function showExit(){if(route==='upload'||!task||task.completed){goHome();return;}showModal('这次制作，下次接着来',`<p class="dialog-copy">你目前在「${stageTitle(task)||'整理素材'}」。保存草稿后返回首页，下次可以从这里继续。</p><div class="dialog-actions"><button class="btn" data-action="close-modal">继续制作</button><button class="btn primary" data-action="save-exit">保存草稿并返回</button></div>`);}
function resume(){closeModal();if(task?.sourceProjectId){void projectRequest(task.sourceProjectId).then(p=>{taskFromUploaded(p);if(['generating','error','paused','interrupted'].includes(p.workflow.status))showUploadedProgress(p);else if(p.workflow.stage==='roles')renderRoles();else if(p.workflow.status==='complete')renderComplete();else renderSample();}).catch(e=>toast(e.message));return;}closeModal();stopAll();runId++;if(!task)return renderUpload();selectFilm(task.assetId);film=stageFilm(film,task);if(task.completed)return renderComplete();if(task.stage==='roles')renderRoles();else if(['short','medium'].includes(task.stage))renderSample();else if(task.stage==='full'){if(canComplete(task)){processing('full','继续准备完整视频',['加载已确认设置','检查完整视频','准备成片'],()=>{task.completed=true;task.stage='complete';persist();renderComplete();},stageIndex('full'));}else{task.stage='medium';task.sceneCount=Math.min(3,task.totalScenes);renderSample();}}}
function editTarget(){
 if(route==='full-review'&&revision)return {scope:'full',source:revision,owner:revision,settings:copySettings(revision.candidate),version:revision.version,history:revision.chat};
 if(route==='complete'&&task?.completed&&task.assetId===film.id)return {scope:'full',source:task,owner:task,settings:copySettings(task.confirmed),version:task.version,history:task.chat};
 if(route==='watch'&&watching&&hasNarration(film))return {scope:'full',source:{...watching,settings:{...watching.settings}},owner:null,settings:copySettings(watching.settings),version:watching.version||watching.settings.version||1,history:[]};
 if(task&&task.assetId===film.id&&['roles','short','medium'].includes(route))return {scope:'sample',source:task,owner:task,settings:copySettings(task.candidate),version:task.version,history:task.chat};
 return null;
}
let assistantHost=null;
function sameAssistantHost(){return assistantHost&&route===assistantHost.route&&film.id===assistantHost.filmId;}
function assistantNotice(text,failed=false,label='新配音已就绪'){
 $('#assistant-result-banner')?.remove();const host=main.querySelector('.sample-layout')||main.querySelector('.complete-card')||main.querySelector('.player-shell');if(!host)return;
 host.insertAdjacentHTML('afterend',`<section class="assistant-result-banner" id="assistant-result-banner" aria-label="旁白修改结果"><div><strong>${failed?'修改未完成':label}</strong><p>${esc(text)}</p></div><button class="btn" data-action="assistant-result">${failed?'检查草稿并重试':'查看修改结果'}</button></section>`);
}
function finishAssistantGeneration(){
 $('#assistant-progress')?.remove();regenerationBusy=false;main.querySelectorAll('[data-scene-confirm]').forEach(b=>b.disabled=!playerReady);
}
const assistant=new NarrationAssistant(chat,{
 services:backendAssistant,
 audition:async candidate=>{stopAll();await initPlayer(candidate.start,candidate.end-candidate.start,playerSettings(),candidate.start,candidate);},
 store:assistantStore,save:persist,stop:stopAll,announce:text=>toast(text,{live:false}),say,shortcuts:()=>prefs.shortcuts,speechOptions:()=>({guide:prefs.guide,reader:prefs.reader}),
 pauseForInput:()=>{stopGuide();pauseMedia();},
 focusVideo:()=>{const target=$('#play-button')||main.querySelector('h1');target?.focus();},
 inputCue(){if(!prefs.guide&&!prefs.reader)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const audio=new C(),osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.value=660;gain.gain.value=.035;osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.09);osc.onended=()=>audio.close();}catch{}},
 onStart(context){assistantHost={route,filmId:film.id};regenerationBusy=true;pauseMedia();$('#assistant-result-banner')?.remove();main.querySelectorAll('[data-scene-confirm]').forEach(b=>b.disabled=true);const host=main.querySelector('.video-wrap')||main.querySelector('.complete-card');host?.insertAdjacentHTML('beforeend',`<div class="regeneration-overlay" id="assistant-progress" role="status"><span class="regeneration-spinner" aria-hidden="true"></span><strong>正在应用修改指令</strong><p>${esc(context.scene.title)} · ${hasStageMedia(film)?'准备视频供试听':'改写旁白并生成新配音'}</p></div>`);},
 onResult(context,result){if(!sameAssistantHost())return;finishAssistantGeneration();const unchanged=result.candidates.length>0&&result.candidates.every(c=>c.mediaUnchanged);assistantNotice(unchanged?'修改意见已记录，可在原播放器试听当前视频，满意后继续。':'新版本已就绪，请在原播放器试听，满意后采用。',false,unchanged?'修改方案已就绪':hasStageMedia(film)?'新版视频已就绪':'新配音已就绪');const candidate=result.candidates[0];if(candidate)void initPlayer(candidate.start,candidate.end-candidate.start,playerSettings(),candidate.start,candidate);},
 onFailure(){if(!sameAssistantHost())return;finishAssistantGeneration();$('#assistant-result-banner')?.remove();},
 onCancel(){if(sameAssistantHost()){$('#assistant-result-banner')?.remove();finishAssistantGeneration();}},
 onDiscard(){if(sameAssistantHost()){$('#assistant-result-banner')?.remove();const duration=['short','medium'].includes(route)?stageRange(film,task,scenePreviewCount(task)).duration:film.duration;void initPlayer(0,duration,playerSettings());}},
 reviewOriginal(context){stopAll();void initPlayer(context.scene.start,context.scene.end-context.scene.start,playerSettings(),context.scene.start,{original:true});},
 async onAccepted(context,session,candidates){
  if(!sameAssistantHost()&&assistantHost)return;$('#assistant-result-banner')?.remove();
  if(task&&session.taskId===task.id){task.assistantSessionId=session.taskId+':'+film.scenePlanVersion;delete task.assistantMockApproved;persist();}
  const duration=['short','medium'].includes(route)?stageRange(film,task,scenePreviewCount(task)).duration:film.duration;
  if(!await initPlayer(0,duration,playerSettings()))return;
  if(['short','medium'].includes(route)&&task?.id===session.taskId){confirm();return;}
  toast('新配音已采用，原版保留在版本历史中。');
 }

});
function openChat({quiet=false}={}){
  if(hasStageMedia(film)&&route==='complete')return openWatch(freshWatch(),false).then(()=>openChat({quiet}));
 if(film.audioMode==='mixed-narration'&&!hasStageMedia(film))return toast('本样片的电影原声与旁白已混合，暂不支持单独修改旁白。');
 if(regenerationBusy||assistant.busy)return toast('正在执行这次修改，请等结果准备好。');
 const target=editTarget();if(!target)return toast('这部影片暂时没有可调整的旁白。');
 if(route==='roles')return toast('请先继续到首个场景，再调整旁白。');
 const at=player?.currentTime||0,scene=film.scenes.find(s=>at>=s.start&&at<s.end)||film.scenes[0];
 assistantHost={route,filmId:film.id};
 assistant.open({film,taskId:target.source.id,settings:target.settings,sceneId:scene.id,playhead:at,phase:route,canContinue:['short','medium'].includes(route),quiet});
}
function mountAssistant(){
 if(!['short','medium','watch','complete','full-review'].includes(route)||!film.scenes?.length)return;
 const target=editTarget(),container=main.querySelector('.container');if(!target||!container)return;
 const oldBack=container.querySelector(':scope > .back-row'),oldHeading=container.querySelector(':scope > .stage-header, :scope > .watch-heading'),nav=container.querySelector(':scope > .stage-nav');
 const header=document.createElement('header');header.className='workbench-header';
 const top=document.createElement('div');top.className='workbench-titlebar';
 const back=oldBack?.querySelector('button');if(back){back.setAttribute('aria-label',back.textContent.trim());back.innerHTML=icon('back')+'我的视频';back.classList.add('workbench-back');top.append(back);}
 const titleBlock=document.createElement('div');titleBlock.className='workbench-project';
 const title=document.createElement('h1');title.tabIndex=-1;title.textContent=route==='watch'?watching.title:route==='full-review'?revision.title:film.title;
 const meta=document.createElement('span');meta.className='workbench-meta';const mediaStage=hasStageMedia(film)?route==='short'?'人物出场试听':route==='medium'?isSecondScene(task)?'第 2 个场景':'首个场景':route==='complete'||route==='full-review'?'完整成片':storySceneTotal()+' 个场景':film.mediaScene==='s2'?'第 2 个场景':film.scenes.length+' 个场景';meta.textContent=time(hasStageMedia(film)&&['upload','analyzing','roles'].includes(route)?MEDIA_PLANS[film.id].extension.initial.duration:hasStageMedia(film)&&route==='short'?stageRange(film,task,1).duration:film.duration)+' · '+mediaStage;
 titleBlock.append(title,meta);top.append(titleBlock);
 const save=oldHeading?.querySelector('[data-action="save"]');if(save){if(save.disabled){const saved=document.createElement('span');saved.className='workbench-saved';saved.textContent='已在视频库';top.append(saved);}else{save.innerHTML=icon('save')+'保存视频';top.append(save);}}
 header.append(top);if(nav)header.append(nav);oldBack?.remove();oldHeading?.remove();
 const inner=container.querySelector('.sample-layout');if(inner){inner.querySelector(':scope > .setting-card')?.remove();inner.classList.add('preview-column');}
 const layout=document.createElement('div');layout.className='assistant-workspace';
 const workspace=document.createElement('div');workspace.className='assistant-main-column';while(container.firstChild)workspace.append(container.firstChild);
 const sceneActions=workspace.querySelector(':scope > .action-bar');if(sceneActions?.querySelector('[data-scene-confirm]'))workspace.querySelector('.player-shell')?.after(sceneActions);
 if(route==='complete'&&task?.assistantMockApproved){const note=document.createElement('p');note.className='assistant-approved-note';note.textContent='修改方案已保存，当前仍使用原有配音。';workspace.prepend(note);}
 if(!workspace.querySelector('.scene-scope')){const section=document.createElement('div');section.className='workspace-section-heading';const h=document.createElement('h2');h.textContent=route==='complete'?'制作完成':route==='full-review'?'新版预览':'视频预览';section.append(h);workspace.prepend(section);}
 workspace.querySelectorAll('.transcript').forEach(el=>{el.open=false;const summary=el.querySelector('summary');if(summary)summary.innerHTML=icon('chevron')+'口述旁白';});
 const credit=workspace.querySelector(':scope > .inline-note');if(credit){const info=document.createElement('details');info.className='film-information';const summary=document.createElement('summary');summary.textContent='影片信息';const description=document.createElement('p');description.textContent=film.description;info.append(summary,description,credit);workspace.append(info);}
 const mount=document.createElement('div');mount.className='assistant-mount';mount.append(chat);layout.append(workspace,mount);container.append(header,layout);container.classList.add('assistant-container');
 if(film.audioMode==='mixed-narration'&&!hasStageMedia(film)){
  workspace.querySelectorAll('[data-action="revise-full"]').forEach(b=>b.remove());
  if(route==='complete'){const detail=workspace.querySelector('.complete-card p');if(detail)detail.textContent='S1 预制样片 · 原声与旁白已混合';}
  const note=document.createElement('section');note.className='setting-card';note.innerHTML='<h2>S1 预制样片</h2><p>按一个完整场景试听，电影原声与旁白已包含在视频里。</p><p>本样片暂不支持单独关闭或修改旁白。</p>';mount.append(note);return;
 }
 const savedAt=Number(target.source.position)||0,at=savedAt>=film.duration-2?0:Math.max(0,savedAt),scene=film.scenes.find(s=>at>=s.start&&at<s.end)||film.scenes[0];assistantHost={route,filmId:film.id};
 assistant.open({film,taskId:target.source.id,settings:target.settings,sceneId:scene.id,playhead:at,phase:route,canContinue:['short','medium'].includes(route),quiet:true});
}
function closeChat(){assistant.close();}
function viewStage(n){
 if(route==='upload'||!task)return;
 const active=stageIndex(task.stage);
 if(n>=active)return;
 if(n===0){showModal('本次视频',`<div class="source-top"><img src="${mediaAsset(film.covers[0].file)}" alt="${esc(film.title)}的封面"><div><h3>${esc(film.title)}</h3><p>${time(hasStageMedia(film)?MEDIA_PLANS[film.id].extension.initial.duration:film.duration)} · 当前影片</p></div></div><p class="dialog-copy">当前制作继续使用这段素材。人物介绍、样片和完整影片均来自同一视频。</p><div class="dialog-actions"><button class="btn primary" data-action="close-modal">返回当前步骤</button></div>`);return;}
 if(n===1){showRoleReview('回看角色介绍');return;}
 const stage=hasStageMedia(film)?['','','人物出场片段','首个场景','连续场景'][n]:n===2?'第一个场景':'前面连续场景';
 showModal('已确认的试听阶段',`<p class="dialog-copy">${stage}的试听已经完成。当前正在「${stageTitle(task)}」。继续试听当前版本，就可以沿着这次制作往下走。</p><div class="dialog-actions"><button class="btn primary" data-action="close-modal">返回当前步骤</button></div>`);
}
function handleAction(action,b){
 if(film.audioMode==='mixed-narration'&&(['caption','narration'].includes(action)||action==='revise-full'&&!hasStageMedia(film)))return;
 switch(action){
 case 'home':case 'library':if(!['home','library','watch','complete','upload','full-review'].includes(route)){showExit();}else goHome(action==='library');break;
 case 'prompt-library':stopAll();void promptLibrary.open();break;
 case 'create':beginCreate();break;
 case 'new-task':closeModal();task=null;selectFilm(defaultFilm.id);persist();renderUpload();break;
 case 'resume':resume();break;
 case 'resume-revision':resumeRevision();break;
 case 'upload':keyboardReader.stop();stopGuide();$('#file-input').click();break;
 case 'demo':if($('#catalog-source'))selectFilm($('#catalog-source').value);startDemo();break;
 case 'intro-read':void say('home',pageGuide('home',guideContext()),true);break;
 case 'link':showLink();break;

 case 'exit':showExit();break;
 case 'save-exit':if(persist()){closeModal();goHome();}break;
 case 'view-stage':viewStage(Number(b.dataset.stage));break;
 case 'confirm':confirm();break;
 case 'extend-scenes':confirm('next');break;
 case 'role':playRole(Number(b.dataset.index));break;
 case 'roles-all':playRoles();break;
 case 'watch':{const item=library.find(x=>x.id===b.dataset.id);if(item)openWatch(item);break;}
 case 'watch-new':openWatch(freshWatch());break;
 case 'save':saveFilm();break;
 case 'play':if(playing)pauseMedia();else playMedia();break;
 case 'replay':replay();break;
 case 'back10':seekTo(player.currentTime-10);break;
 case 'forward10':seekTo(player.currentTime+10);break;
 case 'narration':toggleNarration();break;
 case 'caption':captionOn=!captionOn;b.innerHTML=icon(captionOn?'check':'close')+(captionOn?'口述字幕开启':'口述字幕关闭');updateProgress();break;
 case 'fullscreen':$('.video-wrap')?.requestFullscreen?.().catch(()=>toast('当前浏览器不支持全屏显示。'));break;
 case 'retry-media':route==='full-review'?renderFullRevision():initPlayer(clipStart,clipEnd-clipStart,playerSettings(),player?.currentTime);break;
 case 'watch-roles':showRoleReview();break;
 case 'chat':openChat();break;
 case 'version-history':void showVersionHistory();break;
 case 'revise-full':openChat();break;
 case 'assistant-result':assistant.showResult();break;
 case 'save-revision':saveFullRevision();break;
 case 'revision-original':if(revision?.sourceSnapshot)openWatch(revision.sourceSnapshot,false);break;
 case 'close-chat':closeChat();break;
 case 'settings':showSettings();break;
 case 'preview-voice':previewVoice();break;
 case 'preview-prompt-rate':previewPromptRate(b.dataset.channel);break;
 case 'reset-prompt-rate':setPromptRate(b.dataset.channel,1);break;
 case 'apply-voice':applyVoice();break;
 case 'pref-focus':prefs.focusReadout=!(prefs.focusReadout&&!prefs.reader);if(prefs.focusReadout)prefs.reader=false;else keyboardReader.stop();b.setAttribute('aria-checked',String(prefs.focusReadout));$('[data-action="pref-reader"]').setAttribute('aria-checked',String(prefs.reader));persist();updateGuideUI();break;
 case 'help':showHelp();break;
 case 'close-modal':closeModal();break;
 case 'enable-guide':prefs.guide=true;prefs.reader=false;persist();updateGuideUI();if(route==='home')renderHome();else if(route==='roles')playRoles();else say(currentGuide);break;
 case 'pref-online':{prefs.ttsMode=liveSpeech()?'local':'online';b.setAttribute('aria-checked',String(liveSpeech()));stopAll();persist();updateGuideUI();if(player){if(route==='full-review')renderFullRevision();else initPlayer(clipStart,clipEnd-clipStart,playerSettings(),player.currentTime)};break;}
 case 'pref-guide':prefs.guide=!prefs.guide;if(prefs.guide)prefs.reader=false;b.setAttribute('aria-checked',String(prefs.guide));$('[data-action="pref-reader"]').setAttribute('aria-checked',String(prefs.reader));persist();updateGuideUI();if(prefs.guide)say('dialog','语音引导已开启。');else stopGuide();break;
 case 'pref-reader':prefs.reader=!prefs.reader;if(prefs.reader){prefs.guide=false;keyboardReader.stop();stopGuide();}b.setAttribute('aria-checked',String(prefs.reader));$('[data-action="pref-guide"]').setAttribute('aria-checked',String(prefs.guide));$('[data-action="pref-focus"]')?.setAttribute('aria-checked',String(prefs.focusReadout&&!prefs.reader));persist();updateGuideUI();break;
 case 'pref-shortcuts':prefs.shortcuts=!prefs.shortcuts;b.setAttribute('aria-checked',String(prefs.shortcuts));persist();break;
 case 'repeat-guide':repeatCurrentGuide();break;
 case 'stop-guide':keyboardReader.stop();stopGuide();break;
 case 'reset-confirm':closeModal();showModal(hasStageMedia(film)?'重置当前制作？':'重置这次演示？',`<p class="dialog-copy">将清除当前设备保存的草稿、观看进度和新作品，恢复内置示例视频。这个操作无法撤销。</p><div class="dialog-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn primary" data-action="reset">确认重置</button></div>`);break;
 case 'reset':stopAll();try{localStorage.removeItem(KEY);location.reload();}catch{toast('无法重置，请检查浏览器存储权限。');}break;
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled){handleAction(b.dataset.action,b);if(keyboardReader.keyboard&&b.isConnected&&(b.dataset.action.startsWith('pref-')||['narration','caption'].includes(b.dataset.action)))keyboardReader.read(b);}});
document.addEventListener('keydown',e=>{
 if(!modal.open&&!e.target.closest('#chat')&&['short','medium','watch','complete','full-review'].includes(route)){
  const action=assistantKeyAction(e,{enabled:prefs.shortcuts,editable:!!e.target.closest('input,textarea,select,[contenteditable="true"]'),recording:voiceCapturing()});
  if(action){e.preventDefault();if(action==='voice'){openChat({quiet:true});assistant.startVoice();}else if(action==='finish-send')assistant.voice.finish(true);else if(action==='finish')assistant.voice.finish(false);else if(action==='cancel')assistant.voice.cancel();return;}
 }
 if(e.isComposing||e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;
 if(e.key==='Escape'){keyboardReader.stop();if(chat.open){e.preventDefault();closeChat();}else if(modal.open){e.preventDefault();closeModal();}else stopGuide();return;}
 const review=roleReviewOpen();
 const roleAction=roleKeyAction(e,{active:!chat.open&&(review||route==='roles'&&!modal.open),editable:!!e.target.closest('input,textarea,select,video,[contenteditable="true"],[role="textbox"],[role="slider"]'),shortcuts:prefs.shortcuts,count:roles.length,review});
 if(roleAction){e.preventDefault();if(roleAction.action==='role')playRole(roleAction.index);else if(roleAction.action==='continue')confirm();else closeModal();return;}
 if(modal.open||e.target.closest('#chat,input,textarea,select,button,summary,a,video,.task-inline-stream,[contenteditable="true"]'))return;
 if(route==='home'&&(e.key==='Enter'||e.code==='Space')){e.preventDefault();goHome(true);return;}
 if(e.code==='Space'){e.preventDefault();if(route==='library'){if(!prefs.reader){prefs.guide=true;persist();}beginCreate();}else if(route==='upload')$('#file-input').click();else if(['short','medium','watch','full-review'].includes(route)){playing?pauseMedia():playMedia();}}
 else if(e.key==='Enter'&&['roles','short','medium'].includes(route)){e.preventDefault();confirm();}
 else if(prefs.shortcuts&&/^[1-9]$/.test(e.key)){const i=Number(e.key)-1;if(route==='home'||route==='library'){const visible=[...main.querySelectorAll('[data-action="watch"]')];if(visible[i])visible[i].click();}}
});
$('#file-input').addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value='';});
modal.addEventListener('close',()=>{modal.classList.remove('wide-modal');});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
chat.addEventListener('cancel',e=>{e.preventDefault();closeChat();});modal.addEventListener('cancel',e=>{e.preventDefault();closeModal();});
window.addEventListener('pagehide',()=>{persist();stopAll();assistant.voice.discardPrepared();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){assistant.cancelVoice();assistant.voice.discardPrepared();keyboardReader.stop();pauseMedia();stopGuide();persist();}});
async function boot(){renderHome();await speech.discover();
 installAudioPreload({speech,enabled:()=>liveSpeech()&&!prefs.reader&&(prefs.guide||prefs.focusReadout),voice:()=>prefs.voice,guides:()=>{
  const context=guideContext();return [currentGuideText(),currentGuideText(currentGuide,{detailed:true}),
   ...['home','library','upload','roles','short','medium','complete','watch','saved'].map(key=>briefPageGuide(key,context)),
   '解析已完成，按空格继续。','样片已就绪，按空格继续下一步。','整片已就绪，按空格继续下一步。',
   ...roleTourSteps(film,{shortcuts:prefs.shortcuts}).map(step=>step.text)];
 }});
 await loadUploaded();updateGuideUI();if(route==='library'&&!modal.open)renderHome($('#search')?.value||'');registerTools();}
function registerTools(){const context=document.modelContext;if(!context?.registerTool)return;const life=new AbortController();const tools=[{name:'get_audio_description_state',title:'查看口述影像状态',description:'Read the current visible stage, saved videos and candidate narration settings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{if(Object.keys(input||{}).length)throw new Error('No parameters accepted');return{page:route,stage:task?.stage||null,sceneCount:task?.sceneCount||null,totalScenes:film.scenes?.length||0,settings:task?.candidate||null,videos:library.map(x=>({id:x.id,title:x.title,duration:findFilm(x.assetId)?.duration||0}))};}},{name:'start_audio_description',title:'开始制作口述影像',description:'Open the upload stage, or offer to resume the existing draft. This does not confirm a sample or save a film.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{if(Object.keys(input||{}).length)throw new Error('No parameters accepted');beginCreate();return{page:route,draftChoiceOpen:modal.open};}}];for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>life.abort(),{once:true});}
boot();
