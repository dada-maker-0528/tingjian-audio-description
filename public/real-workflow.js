import {createRevisionEditor} from './revision-editor.js';
import {executionRecord} from './execution-record.js';
import {LocalAPI} from './local-api.js';
import {createTaskProgress} from './task-progress.js';
import {SPOKEN_STAGE_LABELS,workflowIndex} from './workflow-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=n=>`${Math.floor(n/60)}分${Math.floor(n%60)}秒`;
const names={analyzing:'分析视频',roles:'认识角色',short:'试听短片',medium:'试听长一点',verify:'短片复验',full:'完整口述影像'};
const summary=s=>`${s.speed===.8?'稍慢':'自然'}语速，${s.gain===1?'较响':s.gain===.65?'较轻':'适中'}旁白音量，${s.density==='concise'?'简洁':s.density==='detailed'?'详细':'均衡'}描述`;

export function createRealWorkflow(host){
  const api=new LocalAPI();let active=false,available=false,capabilities=null,p=null,epoch=0,timer=null,busy=false,lastKey='',lastMessage='',video=null,track=null,narrationOn=true,recorder=null,stream=null,recordingBlob=null,recordingId=null,recordTimer=null,returnFocus=null,uploadFile=null,uploadId=null,recordEpoch=0;
  let progressView=null,progressId=null,progressComplete=null,reviewIndex=null,parkedProgress=null,viewVersion=null,revisionDraft=null,revisionEditor=null;
  const main=host.main,dialog=document.querySelector('#chat');
  function announce(message,speak=true){host.announce(message);if(speak&&!document.hidden)void host.say(message);}
  function pause(){video?.pause();track?.pause();}
  function stopRecording(discard=false){recordEpoch++;clearTimeout(recordTimer);if(recorder&&recorder.state!=='inactive'){if(discard)recorder.onstop=null;recorder.stop();}stream?.getTracks().forEach(t=>t.stop());stream=null;const button=dialog.querySelector('[data-live-action="record"]');if(button)button.textContent='开始录音';}
  function clearMedia(){pause();video=null;viewVersion=null;if(track){track.removeAttribute('src');track.load();}track=null;}
  function leave(){revisionEditor?.dispose();revisionEditor=null;reviewIndex=null;parkedProgress=null;progressView?.dispose();progressView=null;progressId=null;progressComplete=null;active=false;epoch++;clearTimeout(timer);clearMedia();stopRecording(true);if(dialog.open&&dialog.dataset.live==='1')dialog.close();delete dialog.dataset.live;}
  function key(){const w=p.workflow;return [p.id,w.stage,w.status,w.current?.id,w.saved].join(':');}
  function setup(){host.stop();active=true;host.activate();host.notice('本地真实处理 · AI内容未经人工核验');}
  function page(html){clearMedia();host.page(`<div class="container live-project"><div class="back-row"><button class="text-btn" data-live-action="home">返回我的视频</button><span class="task-name">${esc(p?.title||'上传视频')}</span></div>${html}</div>`);host.notice('本地真实处理 · AI内容未经人工核验');}
  function stageNav(selected){
    const reached=workflowIndex(p.workflow.stage);
    return `<nav class="stage-nav" aria-label="制作阶段">${SPOKEN_STAGE_LABELS.map((name,i)=>`${i?'<span class="stage-line" aria-hidden="true"></span>':''}<button class="stage-button ${i===selected?'active':i<reached?'completed':''}" data-live-action="stage" data-stage="${i}" data-focus-label="${name}" ${i>reached?'disabled':''} ${i===selected?'aria-current="step"':''}><span class="num">${i<reached?'✓':i+1}</span><span>${name}</span></button>`).join('')}</nav>`;
  }
  function returnCurrent(){
    host.stop();reviewIndex=null;
    if(parkedProgress&&progressId===p.workflow.progress?.id&&!['error','paused','interrupted'].includes(p.workflow.status)){
      clearMedia();main.replaceChildren(parkedProgress);parkedProgress=null;syncProgress();main.querySelector('h1')?.focus();return;
    }
    parkedProgress=null;render();
  }
  function viewStage(index){
    if(!p||index<0||index>workflowIndex(p.workflow.stage))return;
    if(index===workflowIndex(p.workflow.stage)){if(reviewIndex!==null)returnCurrent();return;}
    host.stop();
    if(reviewIndex===null&&progressView){parkedProgress=document.createDocumentFragment();while(main.firstChild)parkedProgress.append(main.firstChild);}
    reviewIndex=index;const w=p.workflow;
    const intro=stageNav(index)+'<div class="stage-review-note"><span>阶段回看 · 已有结果保留，当前制作进度不变</span><button class="btn small" data-live-action="current">返回当前进度</button></div>';
    let content='',version=null;
    if(index===0)content=`<div class="stage-header"><h1>源素材信息</h1><p>${esc(p.title)} · ${stamp(p.duration)}</p></div><video class="source-review" controls playsinline preload="metadata" src="${esc(p.sourceUrl)}" aria-label="源视频预览"></video>`;
    else if(index===1)content=`<div class="stage-header"><h1>人物信息与内容解析</h1></div><div class="role-grid">${w.roles.map((role,i)=>`<article class="role-card"><div class="role-card-body"><h2>${esc(role.name)}</h2><p>${esc(role.detail)}</p><button class="btn" data-live-action="role" data-index="${i}">重听${esc(role.name)}</button></div></article>`).join('')}</div>`;
    else{
      version=[...(w.history||[]),w.current].filter(Boolean).findLast(v=>workflowIndex(v.stage)===index&&v.result);
      content=version?`<div class="stage-header"><h1>${index===2?'7 秒样片审校':'连续性复核'}</h1><p>已生成版本 ${version.settingsVersion} · ${stamp(version.start)}—${stamp(version.end)}</p></div><section class="player-card"><video id="live-video" controls playsinline preload="metadata" src="${esc(p.sourceUrl)}" aria-label="已生成样片回看"></video><audio id="live-narration" preload="metadata" src="${esc(version.result.narrationUrl)}"></audio><div class="live-controls"><button class="btn primary" data-live-action="play">播放／暂停</button><button class="btn" data-live-action="replay">重听本段</button><button class="btn" data-live-action="retry-media">重试加载媒体</button></div><p id="live-time"></p><details><summary>查看本版旁白文字</summary>${version.result.cues.map(c=>`<p>${esc(c.text)}</p>`).join('')}</details></section>`:'<p>此阶段暂无可回看的生成版本，当前任务已保留。</p>';
    }
    page(intro+content);if(version)bindPlayer(version,true);
    if(index===0)video=main.querySelector('.source-review');
  }
  function actions(w){
    if(w.status==='generating')return '<button class="btn" data-live-action="pause">暂停制作</button>';
    if(['error','paused','interrupted'].includes(w.status))return '<button class="btn primary" data-live-action="retry">重试／继续制作</button>';
    if(w.stage==='roles')return '<button class="btn" data-live-action="roles">重听人物介绍</button><button class="btn primary" data-live-action="accept">角色介绍清楚，继续制作</button>';
    if(w.status==='complete')return `<button class="btn" data-live-action="chat">提交修订意见</button><button class="btn primary" data-live-action="save" ${w.saved?'disabled':''}>${w.saved?'已加入我的视频':'加入我的视频'}</button>`;
    const label=w.stage==='short'?'满意，继续制作45秒':w.stage==='verify'?'复验满意，制作完整视频':w.mediumEdited?'修改满意，进行短片复验':'满意，制作完整视频';
    return `<button class="btn" data-live-action="chat">和 AI 说说问题</button><button class="btn primary" data-live-action="accept">${label}</button>`;
  }
  function syncProgress(){
    const w=p.workflow,trace=w.progress;
    if(!progressView||!trace||progressId!==trace.id)return;
    for(const event of trace.events)progressView.event(event);
    if(['error','paused','interrupted'].includes(w.status)){
      progressView.fail(w.status==='error'?'本次处理未完成，已保留内容，请重试。':'制作已停止，已完成的内容会保留。',trace.events.findLast(e=>e.type==='start')?.stage);return;
    }
    if(w.status!=='generating'){
      const pauseButton=main.querySelector('[data-live-action="pause"]');if(pauseButton)pauseButton.disabled=true;
      void progressView.complete();
    }
  }
  function render(){
    if(!active||!p||reviewIndex!==null)return;const w=p.workflow,c=w.current;
    // Preserve the processing page until recorded events and the final hold finish.
    if(progressView&&progressId===w.progress?.id&&!['error','paused','interrupted'].includes(w.status)&&progressComplete!==progressId){syncProgress();return;}
    progressView?.dispose();progressView=null;
    const head=`<div class="stage-header"><div class="eyebrow">${w.status==='complete'?'可以收听':'当前步骤'}</div><h1>${esc(names[w.stage])}</h1><p>${stamp(p.duration)} · 用户上传 · ${esc(w.confirmed?'已确认：'+summary(w.confirmed):'尚未确认旁白设置')}</p></div>`;
    let content='';
    if(w.status==='generating')content='<div id="live-progress"></div><p>可以暂停，也可以返回首页，任务会保留。内容时长不代表等待时间。</p>';
    else if(['error','paused','interrupted'].includes(w.status))content='<p>原视频、已确认设置和已完成分段均保留。重试会从可恢复的位置继续。</p>';
    else if(w.stage==='roles')content=`<div class="role-grid">${w.roles.length?w.roles.map((r,i)=>`<article class="role-card"><div class="role-card-body"><h2>${i+1}．${esc(r.name)}</h2><p>${esc(r.detail)}</p><p>${esc(r.nameSource)}</p><button class="btn" data-live-action="role" data-index="${i}">重听${esc(r.name)}</button></div></article>`).join(''):'<p>采样中未整理出可确认的主要人物。可以继续试听；这不表示全片一定没有人物。</p>'}</div>`;
    else if(c?.result){
      content=`<section class="player-card"><h2>${w.status==='complete'?'完整视频':`原片${stamp(c.start)}至${stamp(c.end)}，实际${(c.end-c.start).toFixed(1)}秒`}</h2><p>当前版本${w.settingsVersion}：${esc(summary(c.settings))}</p><video id="live-video" controls playsinline preload="metadata" aria-label="${esc(p.title)}，原片播放器" src="${esc(p.sourceUrl)}"></video><audio id="live-narration" preload="metadata" src="${esc(c.result.narrationUrl)}"></audio><div class="live-controls"><button class="btn primary" data-live-action="play">播放／暂停</button><button class="btn" data-live-action="replay">重听本段</button><button class="btn" data-live-action="back">后退10秒</button><button class="btn" data-live-action="forward">前进10秒</button><button class="btn" data-live-action="narration" aria-pressed="true">口述旁白：开启</button><button class="btn" data-live-action="retry-media">重试加载媒体</button></div><p id="live-time">尚未开始播放</p><details><summary>查看本版旁白文字</summary>${c.result.cues.map(x=>`<p>${esc(x.text)}</p>`).join('')||'<p>这段没有生成旁白，请结合内容检查是否符合预期。</p>'}</details></section>`;
    }
    if(c&&w.status!=='generating')content+=executionRecord(c,w.history.findLast(v=>v.result));
    page(stageNav(workflowIndex(w.stage))+head+`<p id="live-state" class="guide-banner">${esc(w.message)}</p>`+content+`<div class="action-bar live-actions">${actions(w)}</div><p>随时可重听或停止提示。制作结果未经人工审听；遇到问题可以返回或重试。</p>`);
    if(w.status==='generating'){
      const trace=w.progress||{id:p.id+':legacy',steps:['等待实际任务返回'],events:[]};progressId=trace.id;progressComplete=null;
      const token=epoch;
      progressView=createTaskProgress(main.querySelector('#live-progress'),{steps:trace.steps,completeLabel:w.stage==='analyzing'?'人物与试听范围已准备好':w.stage==='full'?'完整旁白已准备好':'样片已准备好',onComplete:()=>{if(!active||token!==epoch)return;progressComplete=trace.id;render();}});
      syncProgress();
    }
    lastKey=key();lastMessage=w.message;host.guide(`${names[w.stage]}。${w.message}`);announce(`${names[w.stage]}。${w.message}`);
    if(c?.result&&!['generating','error','paused','interrupted'].includes(w.status))bindPlayer();
    if(w.stage==='roles'&&w.status==='review')void speakRoles();
  }
  async function speakRoles(index){if(!p)return;const id=epoch,roles=index===undefined?p.workflow.roles:[p.workflow.roles[index]];for(const role of roles){if(!role||id!==epoch||!active)break;const done=await host.say(`${role.name}。${role.detail}`);if(!done)break;}}
  async function poll(){
    const id=epoch;if(!active||!p)return;
    try{
      const fresh=await api.project(p.id);if(id!==epoch||!active)return;p=fresh;syncProgress();
      if(reviewIndex!==null){lastMessage=p.workflow.message;}
      else if(key()!==lastKey&&!dialog.open&&!busy)render();
      else if(lastMessage!==p.workflow.message&&(!progressView||p.workflow.status==='generating')){lastMessage=p.workflow.message;const el=main.querySelector('#live-state');if(el)el.textContent=lastMessage;host.guide(`${names[p.workflow.stage]}。${lastMessage}`);if(!dialog.open)announce(lastMessage);}
    }catch{if(id===epoch)announce('暂时无法连接本地服务。页面和已完成的任务保留，恢复连接后会继续更新。',false);}
    if(active&&id===epoch)timer=setTimeout(poll,1200);
  }
  async function open(id){leave();setup();const token=epoch;page('<h1>正在读取保存的任务</h1>');try{p=await api.project(id);if(token!==epoch)return;recordingId=p.workflow.recording?.status==='error'?p.workflow.recording.id:null;render();timer=setTimeout(poll,1200);}catch(e){if(token!==epoch)return;page(`<h1>任务暂时无法打开</h1><p>${esc(e.message)}</p><button class="btn" data-live-action="open" data-id="${esc(id)}">重试打开任务</button>`);announce(e.message);}}
  async function upload(file,retry=false){
    leave();setup();p=null;if(!retry){uploadFile=file;uploadId=crypto.randomUUID();}const token=epoch;
    page('<h1>正在上传视频</h1><p>文件上传完成后自动开始分析。请保持页面打开。</p>');announce('正在上传视频，完成后会自动分析。');
    try{const result=await api.upload(uploadFile,uploadId,host.voice());if(token!==epoch)return;p=result;uploadFile=null;render();timer=setTimeout(poll,1200);}
    catch(e){if(token!==epoch)return;page(`<h1>上传未完成</h1><p>${esc(e.message)}</p><button class="btn primary" data-live-action="retry-upload">重试上传</button><button class="btn" data-live-action="home">返回查看已上传任务</button>`);announce(e.message);}
  }
  async function act(action,extra={}){
    if(busy||!p||reviewIndex!==null)return;busy=true;pause();host.stop();const token=epoch;main.querySelectorAll('[data-live-action]').forEach(b=>b.disabled=true);
    try{const result=await api.action(p,action,extra);if(token!==epoch)return;p=result;render();}
    catch(e){if(token!==epoch)return;try{p=await api.project(p.id);}catch{}if(token!==epoch)return;render();announce(e.message);}
    finally{busy=false;if(token===epoch)main.querySelectorAll('[data-live-action]').forEach(b=>b.disabled=(b.dataset.liveAction==='save'&&p.workflow.saved)||(b.dataset.liveAction==='stage'&&Number(b.dataset.stage)>workflowIndex(p.workflow.stage)));}
  }
  function bindPlayer(c=p.workflow.current,readOnly=false){
    video=main.querySelector('#live-video');track=main.querySelector('#live-narration');narrationOn=true;viewVersion=c;const mediaEpoch=epoch;track.volume=c.settings.gain;let ready=false,playToken=0,positionTimer=null;
    const boundVideo=video,boundTrack=track,current=()=>active&&epoch===mediaEpoch&&video===boundVideo&&track===boundTrack&&boundVideo.isConnected;
    const on=(element,event,handler)=>element.addEventListener(event,(...args)=>{if(current())void handler(...args);});
    const position=()=>{if(!readOnly&&p?.workflow.status==='complete'&&video){const at=video.currentTime;clearTimeout(positionTimer);positionTimer=setTimeout(()=>{if(current())api.action(p,'position',{position:at}).then(fresh=>{if(current())p=fresh;}).catch(()=>{});},600);}};
    on(video,'loadedmetadata',()=>{video.currentTime=!readOnly&&p.workflow.status==='complete'?Math.min(Math.max(p.workflow.position||0,c.start),c.end-.1):c.start;ready=true;});
    on(video,'play',async()=>{
      const mine=++playToken;host.stopGuide();video.playbackRate=1;video.volume=1;
      if(!ready){pause();announce('媒体仍在准备，请稍后重试播放。');return;}
      if(video.currentTime>=c.end-.08||video.currentTime<c.start)video.currentTime=c.start;
      if(narrationOn){track.currentTime=Math.max(0,video.currentTime-c.start);try{await boundTrack.play();if(!current()||mine!==playToken)boundTrack.pause();}catch{if(!current())return;pause();announce('旁白未能播放，已暂停原片。请重试加载媒体，或关闭旁白听原片。');}}
    });
    on(video,'pause',()=>{playToken++;track?.pause();position();});
    on(video,'waiting',()=>track?.pause());
    on(video,'playing',()=>{if(narrationOn&&track.paused)boundTrack.play().catch(()=>{if(!current())return;pause();announce('旁白播放中断，请重试。');});});
    on(video,'seeking',()=>{if(video.currentTime<c.start||video.currentTime>c.end)video.currentTime=Math.max(c.start,Math.min(c.end,video.currentTime));track.currentTime=Math.max(0,video.currentTime-c.start);});
    on(video,'ratechange',()=>{if(video.playbackRate!==1)video.playbackRate=1;});
    on(video,'timeupdate',()=>{if(video.currentTime>=c.end-.06){pause();announce('本段播放结束，可以重听、修改或确认。',false);}else if(narrationOn&&!video.paused&&Math.abs(track.currentTime-(video.currentTime-c.start))>.25)track.currentTime=Math.max(0,video.currentTime-c.start);const label=main.querySelector('#live-time');if(label)label.textContent=`原片位置${stamp(video.currentTime)}，本段到${stamp(c.end)}`;});
    for(const el of [video,track])on(el,'error',()=>{pause();announce('媒体加载失败，选择“重试加载媒体”可重新读取。');});
  }
  function closeChat(){if(dialog.dataset.live!=='1')return;revisionDraft=revisionEditor?.getDraft();revisionEditor?.dispose();revisionEditor=null;stopRecording(true);host.stopGuide();dialog.close();delete dialog.dataset.live;if(returnFocus?.isConnected)returnFocus.focus();}
  function openChat(){
    pause();host.stopGuide();returnFocus=document.activeElement;dialog.dataset.live='1';
    if(p.workflow.recording?.versionId!==p.workflow.current.id){recordingBlob=null;recordingId=null;}
    dialog.innerHTML=`<div class="chat-inner"><div class="dialog-heading"><h2 id="chat-title">修订${esc(names[p.workflow.stage])}</h2><button class="btn" data-live-action="close-chat">关闭对话</button></div><p>${esc(p.title)} · 项目修订 ${p.workflow.settingsVersion}</p><div id="revision-editor"></div><p id="live-feedback-status" role="status">可直接选择标签，或用文字、语音描述要求。</p></div>`;
    dialog.showModal();
    const taskEpoch=epoch,projectId=p.id;
    const editor=createRevisionEditor(dialog.querySelector('#revision-editor'),{settings:p.workflow.candidate,initial:revisionDraft,
      loadContext:signal=>api.request(`/api/projects/${p.id}/revision-context`,{signal}),
      preview:(input,signal)=>api.request(`/api/projects/${p.id}/revision-preview`,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),
      recordHTML:`<button type="button" class="btn small" data-live-action="record">开始录音</button><button type="button" class="btn small" data-live-action="retry-voice" ${recordingBlob||recordingId?'':'disabled'}>重试转写已有录音</button>`,
      submit:async draft=>{
        if(recorder?.state==='recording')throw new Error('请先停止录音并整理修改意见');
        const fresh=await api.action(p,'revise',draft);if(!active||epoch!==taskEpoch||p?.id!==projectId)return;p=fresh;if(revisionEditor!==editor)return;revisionDraft=null;revisionEditor.dispose();revisionEditor=null;stopRecording(true);dialog.close();delete dialog.dataset.live;render();
      }
    });revisionEditor=editor;
  }
  function voiceStatus(text){const el=dialog.querySelector('#live-feedback-status');if(el)el.textContent=text;announce(text);}
  async function transcribe(){
    const token=epoch,version=p.workflow.current.id;voiceStatus('正在转写，录音已保留，请稍候。');
    try{const result=await api.voice(p,recordingBlob,recordingId);if(token!==epoch||!dialog.open||version!==p.workflow.current.id)return;recordingId=result.recordingId;dialog.querySelector('#live-text').value=result.text;dialog.querySelector('#live-text').dispatchEvent(new Event('input'));voiceStatus('识别到：'+result.text+'。选择提交修改并重做，或先编辑文字。');}
    catch(e){if(token!==epoch)return;if(e.recordingId)recordingId=e.recordingId;voiceStatus(e.message||'转写失败，录音已保留。');}
    finally{dialog.querySelector('[data-live-action="retry-voice"]')?.removeAttribute('disabled');}
  }
  async function record(){
    const button=dialog.querySelector('[data-live-action="record"]');
    if(recorder?.state==='recording'){stopRecording();button.textContent='开始录音';return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){voiceStatus('当前浏览器不支持录音，请输入文字。');return;}
    host.stopGuide();pause();button.disabled=true;const token=++recordEpoch;
    try{
      const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token!==recordEpoch||!active||!dialog.open){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;recordingBlob=null;recordingId=null;const chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{recordingBlob=new Blob(chunks,{type:recorder.mimeType});stream?.getTracks().forEach(t=>t.stop());stream=null;void transcribe();};
      recorder.start();button.textContent='停止录音并转写';host.announce('正在录音，最长60秒。选择停止录音并转写结束。');dialog.querySelector('#live-feedback-status').textContent='正在录音，最长60秒。';
      recordTimer=setTimeout(()=>{stopRecording();button.textContent='开始录音';},60000);
    }catch{voiceStatus('麦克风未开启，可以调整浏览器权限后重试，或直接输入文字。');}
    finally{button.disabled=false;}
  }
  async function handle(action,button){
    if(action==='stage'){viewStage(Number(button.dataset.stage));return;}
    if(action==='current'){returnCurrent();return;}
    if(action==='open'){await open(button.dataset.id);return;}
    if(action==='home'){leave();host.home();return;}
    if(action==='retry-upload'){await upload(uploadFile,true);return;}
    if(action==='close-chat'){closeChat();return;}
    if(action==='chat'){if(reviewIndex===null)openChat();return;}
    if(action==='record'){await record();return;}
    if(action==='retry-voice'){await transcribe();return;}
    if(action==='roles'){await speakRoles();return;}
    if(action==='role'){await speakRoles(Number(button.dataset.index));return;}
    if(['accept','retry','pause','save'].includes(action)){await act(action,{versionId:p.workflow.current?.id});return;}
    if(!video)return;const c=viewVersion||p.workflow.current;
    if(action==='play'){if(video.paused)video.play().catch(()=>announce('播放未开始，请再次选择播放。'));else pause();}
    if(action==='replay'){pause();video.currentTime=c.start;video.play().catch(()=>announce('请再次选择播放。'));}
    if(action==='back'||action==='forward')video.currentTime=Math.max(c.start,Math.min(c.end,video.currentTime+(action==='back'?-10:10)));
    if(action==='narration'){narrationOn=!narrationOn;button.setAttribute('aria-pressed',String(narrationOn));button.textContent='口述旁白：'+(narrationOn?'开启':'关闭');if(!narrationOn)track.pause();else if(!video.paused){track.currentTime=video.currentTime-c.start;track.play().catch(()=>{pause();announce('旁白无法播放，请重试。');});}}
    if(action==='retry-media'){pause();video.load();track.load();}
  }
  document.addEventListener('click',e=>{const button=e.target.closest('[data-live-action]');if(button&&!button.disabled)void handle(button.dataset.liveAction,button);});
  document.addEventListener('keydown',e=>{
    if(!active||e.isComposing||e.repeat)return;
    if(dialog.dataset.live==='1'&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeChat();return;}
    if(dialog.open||e.ctrlKey||e.altKey||e.metaKey||e.target.closest('input,textarea,select,button,a,video,[contenteditable]'))return;
    if(e.code==='Space'&&video){e.preventDefault();void handle('play');}
  },true);
  dialog.addEventListener('cancel',e=>{if(dialog.dataset.live==='1'){e.preventDefault();e.stopImmediatePropagation();closeChat();}},true);
  window.addEventListener('pagehide',()=>{pause();stopRecording(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();stopRecording();}});
  return {
    get active(){return active;},get available(){return available;},get recording(){return recorder?.state==='recording';},get voice(){return p?.workflow.candidate.voice;},pause,leave,upload,closeChat,changeVoice:voice=>act('voice',{voice}),
    filterHome(query){const q=query.trim().toLocaleLowerCase();for(const card of main.querySelectorAll('#local-projects .film-card'))card.style.display=card.querySelector('h3').textContent.toLocaleLowerCase().includes(q)?'':'none';},
    async discover(){try{capabilities=await api.request('/api/capabilities');available=capabilities.local===true;}catch{available=false;}return available;},
    async mountHome(){
      if(!available)return;const token=epoch;const node=document.createElement('section');node.id='local-projects';node.className='container';node.innerHTML='<h2>本机制作的口述影像</h2><p>正在读取作品和草稿…</p>';main.append(node);
      try{const {projects}=await api.request('/api/bootstrap');if(token!==epoch||!node.isConnected)return;
        node.innerHTML='<h2>本机制作的口述影像</h2>'+(!capabilities.visionReady||!capabilities.ttsReady?'<p>真实处理服务尚未配置完整。上传会保存素材并说明缺少的服务；演示视频仍可使用。</p>':'')+(projects.length?`<div class="library-grid">${projects.map(item=>`<article class="film-card"><div class="film-info"><h3>${esc(item.title)}</h3><p>${stamp(item.duration)} · ${item.workflow.saved?'已保存作品':item.workflow.status==='complete'?'整片已完成，尚未加入列表':'制作草稿'}</p><p>${esc(item.workflow.message)}</p><button class="btn primary" data-live-action="open" data-id="${item.id}">${item.workflow.status==='complete'?'打开并收听':'继续制作'}《${esc(item.title)}》</button></div></article>`).join('')}</div>`:'<p>还没有本机作品。选择“创建新视频”，上传后会自动开始真实处理。</p>');
      }catch(e){if(node.isConnected)node.innerHTML='<h2>本机作品暂时无法读取</h2><p>'+esc(e.message)+'</p>';}
    }
  };
}
