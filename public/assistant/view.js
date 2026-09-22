import {FIELDS,FIELD_MAP,GROUPS,SCOPE_LABELS,formatValue,clone} from './schema.js';
import {createSession,openDraft,makeContext,editDraft,valueFor,differences,undoCategory,compileDraft,applyInterpretation,beginRun,finishRun,failRun,acceptCandidate,discardCandidates} from './model.js';
import {assistantServices} from './services.js';
import {VoiceInput,recognitionConstructor} from './voice-input.js';
import {assistantKeyAction,shouldAutoSpeak,spokenChanges,resultGuidance,automaticMessage,SPEECH_RULES} from './speech-policy.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,attrs='',kind='')=>`<button type="button" class="btn ${kind}" data-assistant="${action}" ${attrs}>${label}</button>`;
const toolIcon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${{help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 16v1"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',video:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',speaker:'<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 010 8M18 5a10 10 0 010 14"/>'}[name]||''}</svg>`;
const sceneLabel=(film,id)=>{const s=film.scenes.find(s=>s.id===id);return s?`场景 ${film.scenes.indexOf(s)+1} · ${s.title}`:id;};
export class NarrationAssistant{
 constructor(dialog,hooks){this.el=dialog;this.hooks=hooks;this.mode='ordinary';this.category=null;this.view=null;this.parseId=0;this.busy=false;this.voiceMessage='';this.composing=false;
  this.voice=new VoiceInput({
   beforeStart:()=>{this.hooks.stop();},
   onText:text=>{if(!this.draft)return;this.draft.input=text;const input=this.el.querySelector('#assistant-input');if(input)input.value=text;this.hooks.save();},
   onState:(state,message)=>{this.voiceMessage=message;if(!this.draft)return;if(state==='listening'){const status=this.el.querySelector('#assistant-voice-state');if(status){status.hidden=false;status.textContent=message;}this.hooks.inputCue?.();}else this.render();if(state==='error'||state==='idle')this.notify(message,state==='error'?'voice-error':'voice-ended');},
   onSubmit:text=>{if(!this.el.hidden)this.generate(text);}
  });
  dialog.addEventListener('click',e=>{const b=e.target.closest('[data-assistant]');if(b&&!b.disabled){e.preventDefault();this.action(b.dataset.assistant,b);}});
  dialog.addEventListener('input',e=>this.input(e));dialog.addEventListener('change',e=>this.change(e));
  dialog.addEventListener('focusin',e=>{this.touched=true;if(e.target.id==='assistant-input')this.hooks.pauseForInput?.();});
  dialog.addEventListener('compositionstart',()=>this.composing=true);dialog.addEventListener('compositionend',()=>this.composing=false);
  dialog.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(this.voice.active){this.voice.cancel();this.render('assistant-input');}else if(this.view==='help'){this.action('close-help');}else if(this.view==='prompt'){this.view='card';this.category=null;this.render('assistant-show-prompt');}else{this.hooks.stop();this.hooks.focusVideo();}return;}
   const action=assistantKeyAction({...e,key:e.key,code:e.code,keyCode:e.keyCode,isComposing:e.isComposing||this.composing,repeat:e.repeat,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey},{enabled:this.hooks.shortcuts(),editable:!!e.target.closest('textarea,input,select,[contenteditable="true"]'),inputFocused:e.target.id==='assistant-input',inputEmpty:!e.target.value?.trim(),retryReady:!!this.voice.retrySession,recording:this.voice.active});
   if(action){e.preventDefault();e.stopPropagation();if(action==='voice')this.startVoice();else if(action==='finish')this.voice.finish(false);else if(action==='finish-send')this.voice.finish(true);else if(action==='submit')this.generate();return;}
   if(e.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();this.mode=e.key==='Home'?'ordinary':e.key==='End'?'advanced':e.target.dataset.mode==='ordinary'?'advanced':'ordinary';this.category=null;this.view=this.mode==='ordinary'&&this.plan.valid?'card':null;this.render('assistant-tab-'+this.mode);this.notify(this.mode==='ordinary'?'普通模式，可以用自然语言补充修改要求。':'高级编辑，共六类标签，可以查看和修改。','mode');}
   if(e.target.closest('textarea,input,select'))e.stopPropagation();
  });
 }
 get visible(){return !this.el.hidden&&this.el.isConnected;}
 open({film,taskId,settings,sceneId,playhead,phase,canContinue,quiet=false}){
  this.cancelVoice();if(!quiet)this.hooks.stop();this.invoker=document.activeElement;this.origin={film,taskId,settings,phase,canContinue};this.mode='ordinary';this.category=null;this.view=null;this.person='';this.pinnedScene=false;this.touched=!quiet;this.parseId++;
  const key=taskId+':'+film.scenePlanVersion;let session=this.hooks.store.sessions[key];if(!session)session=this.hooks.store.sessions[key]=createSession(taskId,film,settings);this.session=session;
  this.useScene(sceneId,playhead);if(this.plan.valid)this.view='card';this.el.hidden=false;this.el.classList.add('assistant-docked');this.render();
  if(!quiet){this.el.querySelector('#assistant-input, #chat-title')?.focus();this.notify('当前是旁白助手，'+sceneLabel(film,sceneId)+'。按 O 开始语音输入，输入完成后按回车发送。先整理修改指令，再确认执行。','enter');}
 }
 useScene(id,playhead){this.cancelVoice();this.parseId++;this.context=makeContext(this.origin.film,id,playhead??this.origin.film.scenes.find(s=>s.id===id).start,this.origin.taskId);this.draft=openDraft(this.session,this.context);this.person='';this.hooks.save();}
 syncPlayhead(sceneId,at){if(!this.visible||this.busy||this.voice.active||this.pinnedScene||this.el.contains(document.activeElement)||this.draft?.input?.trim()||this.draft?.revision||this.draft?.status!=='editing')return;if(sceneId!==this.context.sceneId){this.useScene(sceneId,at);this.view=this.plan.valid?'card':null;this.render();}else this.context.playhead=at;}
 hide(){this.cancelVoice();this.parseId++;this.el.hidden=true;if(this.el.parentNode!==document.body)document.body.append(this.el);}
 cancelVoice(){if(this.voice?.cancel({silent:true})){this.voiceMessage='语音输入已停止，文字已保留。';if(this.visible)this.render();}}
 close(){this.hooks.stop();this.hooks.focusVideo();}
 get plan(){return compileDraft(this.session,this.draft,this.context);}
 confirmationText(plan=this.plan){return spokenChanges(plan,{characters:this.context.registry,real:!!this.hooks.services});}
 resultText(){return resultGuidance(this.draft.result,{canContinue:this.origin.canContinue,acceptedIds:Object.values(this.session.accepted).map(c=>c.id)});}
 notify(message,event='status'){
  const spoken=automaticMessage(event,message);
  if(!['ready','result'].includes(event))this.hooks.announce(message);this.message=message;const live=this.el.querySelector('#assistant-live');if(live)live.textContent=spoken;
  const typing=document.activeElement?.id==='assistant-input'&&!!this.draft?.input?.trim()&&!['voice-ended','voice-error'].includes(event);
  if(spoken&&this.visible&&!document.hidden&&shouldAutoSpeak(event,{...this.hooks.speechOptions(),recording:this.voice.active,typing}))this.hooks.say('assistant-'+event,spoken);
 }
 prepareInput(){if(this.draft.status==='result')this.draft=openDraft(this.session,this.context,{fresh:true});this.mode='ordinary';this.category=null;this.view=null;this.render('assistant-input');}
 startVoice(){if(this.busy)return;if(this.voice.active){this.voice.finish(false);return;}this.prepareInput();this.voice.start(this.draft.input);this.render('assistant-input');this.el.querySelector('#assistant-input')?.scrollIntoView({block:'nearest'});}
 scopeHTML(includeTargets=true){const d=this.draft;return `<div class="assistant-scope"><label for="assistant-scope">应用范围</label><select id="assistant-scope" ${this.busy?'disabled':''}>${Object.entries(SCOPE_LABELS).map(([value,label])=>`<option value="${value}" ${d.scope===value?'selected':''}>${label}</option>`).join('')}</select></div>${includeTargets?this.targetsHTML():''}`;}
 targetsHTML(){const d=this.draft;return d.scope==='specified'?`<fieldset class="assistant-targets"><legend>本次修改哪些场景</legend>${this.origin.film.scenes.map(s=>`<label><input type="checkbox" id="assistant-target-${esc(s.id)}" data-scene-target="${esc(s.id)}" ${d.targetIds.includes(s.id)?'checked':''}><span>${esc(sceneLabel(this.origin.film,s.id))}</span></label>`).join('')}</fieldset>`:'';}
 cardHTML(plan){
  const d=this.draft;if(!plan.changes.length&&d.clarification)return '';if(!plan.changes.length)return `<p class="assistant-note">${esc(d.message||'当前设置无需修改。')}</p>`;
  return `<article class="assistant-command" aria-label="本次修改指令"><div class="assistant-card-title"><h3 id="assistant-command-title" tabindex="-1">本次修改 <span>· ${plan.changes.length} 项</span></h3><span class="assistant-badge">${plan.valid?'待确认':'待补充'}</span></div>${plan.valid?`<p class="assistant-confirmation">${esc(this.confirmationText(plan))}</p>`:""}<p class="assistant-command-target">${plan.targets.map(t=>esc(sceneLabel(this.origin.film,t.sceneId))).join('、')}</p><ul class="assistant-changes">${plan.changes.map(p=>`<li><strong>${esc(FIELD_MAP[p.field].label)}${p.targetCharacterId?' · '+esc(this.context.registry.find(c=>c.id===p.targetCharacterId)?.name||p.targetCharacterId):''}</strong><span>${esc(formatValue(p.field,p.before))}<span aria-hidden="true"> → </span><span class="sr-only">改为</span><b>${esc(formatValue(p.field,p.value))}</b></span></li>`).join('')}</ul>${plan.errors.length?`<p class="assistant-notice">${esc(plan.errors.join(' '))}</p>`:''}<details class="assistant-execution-details"><summary>执行与保留内容</summary><dl><dt>执行内容</dt><dd>${esc(plan.execution||'等待有效修改')}</dd><dt>保持不变</dt><dd>未修改的标签、原片画面和原声。</dd><dt>应用范围</dt><dd>${esc(SCOPE_LABELS[d.scope])}${d.scope==='current_and_following'?'；先确认本场景，满意后再沿用。':'；不更改其他场景。'}</dd></dl></details><div class="assistant-card-actions">${button('speak','听修改指令')}${button('prompt','查看完整提示词','id="assistant-show-prompt"')}</div><p class="assistant-meta">${this.hooks.services?'本次生成真实配音，确认前不会执行。':'本次生成模拟结果，确认前不会执行。'}</p></article>${this.targetsHTML()}`;
 }
 examplesHTML(){return `<div class="assistant-examples" aria-label="修改要求示例">${['旁白慢一点','动作讲清楚','少讲环境'].map(text=>button('example',text,`data-text="${text}"`)).join('')}</div>`;}
 ordinaryHTML(plan){
  const d=this.draft,history=d.history||[],hasChanges=plan.changes.length>0;
  return `${!hasChanges&&!d.clarification?`<div class="assistant-welcome"><p>可一次提出多项修改，确认后再应用。</p></div>`:''}${history.length?`<details class="assistant-history"><summary>之前的对话 · ${history.length} 条</summary>${history.map(h=>`<div class="assistant-message ${h.who==='user'?'is-user':''}"><strong>${h.who==='user'?'你':'旁白助手'}</strong><p>${esc(h.text)}</p>${h.card?'<span class="assistant-meta">历史记录 · 已被当前指令替代</span>':''}</div>`).join('')}</details>`:''}${d.clarification?`<section class="assistant-notice" aria-label="需要补充的信息"><strong>先确认一下</strong><p>${esc(d.clarification.message)}</p>${d.clarification.choices?.map(c=>button('clarify',esc(c.name),`data-person="${esc(c.id)}"`)).join('')||''}</section>`:''}${hasChanges?this.cardHTML(plan):''}${d.message?`<p class="assistant-note">${esc(d.message)}</p>`:''}`;
 }
 overviewHTML(plan){return `<div class="assistant-section-heading"><h3>查看已填入的标签</h3><p>按类别查看；也可以继续用自然语言补充。</p></div><div class="assistant-categories">${GROUPS.map(g=>{const fields=FIELDS.filter(f=>f.group===g.id),count=plan.changes.filter(p=>FIELD_MAP[p.field].group===g.id).length;return `<button type="button" id="assistant-group-${g.id}" data-assistant="category" data-group="${g.id}" data-focus-label="${g.name}${count?'，已修改 '+count+' 项':''}" aria-label="${g.name}${count?'，已修改 '+count+' 项':''}" class="assistant-category"><span><strong>${g.name}</strong><span aria-hidden="true">↗</span></span><small>${fields.length} 个字段${count?' · 已修改 '+count+' 项':''}</small><span class="assistant-category-hint">${g.hint}</span></button>`;}).join('')}</div><div class="assistant-overview-summary"><strong>${plan.changes.length?'已修改 '+plan.changes.length+' 项':'所有字段沿用当前设置'}</strong><p>${plan.changes.slice(0,4).map(p=>esc(FIELD_MAP[p.field].label)+'：'+esc(formatValue(p.field,p.value))).join(' · ')}${plan.changes.length>4?'…':''}</p></div>${this.scopeHTML()}${button('natural','用自然语言填充标签','','block')}`;}
 fieldHTML(f){const tags=this.draft.effective,id=f.group==='people'?this.person:'',value=valueFor(tags,f.key,id),base=valueFor(this.draft.base,f.key,id);if(f.type==='alias')return `<fieldset class="assistant-field"><legend>${f.label}</legend>${id?`<label for="assistant-alias">${esc(this.context.registry.find(c=>c.id===id)?.name)}的用户别名</label><input class="text-input" id="assistant-alias" maxlength="30" value="${esc(value)}" placeholder="输入别名，留空恢复原称呼"><p>${esc(f.help)}仅对 ${esc(id)} 生效。</p>`:'<p>先在上方选择指定人物，再填写别名。</p>'}</fieldset>`;
 const options=f.options.filter(o=>!(f.key==='naming_mode'&&!id&&o.value==='用户别名'));
 return `<fieldset class="assistant-field"><legend>${f.label}${JSON.stringify(value)!==JSON.stringify(base)?'<span class="assistant-changed">已修改</span>':''}</legend><div class="assistant-options ${f.type==='set'?'is-multi':''}">${options.map((o,i)=>{const checked=f.type==='set'?value.includes(o.value):value===o.value;return `<label class="assistant-option ${checked?'is-selected':''}"><input aria-label="${esc(f.label+'，'+o.label)}" id="assistant-field-${f.key}-${i}" type="${f.type==='set'?'checkbox':'radio'}" name="assistant-${f.key}" data-field="${f.key}" data-index="${i}" value="${esc(JSON.stringify(o.value))}" ${checked?'checked':''}><span>${esc(o.label)}</span></label>`;}).join('')}</div><p>${esc(f.help)}</p>${JSON.stringify(value)!==JSON.stringify(base)?`<p class="assistant-diff">${esc(formatValue(f.key,base))} → ${esc(formatValue(f.key,value))}</p>`:''}</fieldset>`;}
 categoryHTML(plan){const group=GROUPS.find(g=>g.id===this.category),changes=plan.changes.filter(p=>FIELD_MAP[p.field].group===group.id);return `${button('back-categories','← 返回分类','','assistant-back')}<h3 tabindex="-1" id="assistant-category-title">${group.name}</h3>${group.id==='people'?`<div class="assistant-person"><label for="assistant-person">人物规则作用对象</label><select id="assistant-person"><option value="">所有人物的默认规则</option>${this.context.registry.map(c=>`<option value="${esc(c.id)}" ${c.id===this.person?'selected':''}>${esc(c.id+' · '+c.name)}</option>`).join('')}</select><p>${this.person?'覆盖仅绑定该人物 ID，并在该人物出场时使用。':'指定人物的覆盖规则会优先于默认规则。'}</p><details><summary>查看原片人物资料（只读）</summary>${this.context.registry.filter(c=>!this.person||c.id===this.person).map(c=>`<p><strong>${esc(c.id+' · '+c.name)}</strong> ${esc(c.detail)}</p>`).join('')}</details></div>`:''}${FIELDS.filter(f=>f.group===group.id).map(f=>this.fieldHTML(f)).join('')}<section class="assistant-group-summary"><h4>本组修改</h4><p>${changes.map(p=>esc(p.text)).join('<br>')||'本组没有修改'}</p><h4>执行方式</h4><p>${group.id==='sound'?'仅调整声音时保留文案，按参数处理旁白并检查同步。原片与原声不变。':'修改相关表达，重新配音并检查同步。仅使用已确认画面信息。'}</p>${button('undo-group','撤销本组修改',changes.length?'':'disabled')}${button('back-categories','返回分类')}</section>`;}
 promptHTML(plan){return `${button('back','← 返回修改指令','','assistant-back')}<h3 tabindex="-1" id="assistant-prompt-title">完整提示词</h3><p class="assistant-note">根据当前场景、标签和应用范围生成；只读预览。</p><textarea class="assistant-prompt" id="assistant-prompt" readonly aria-label="完整提示词" rows="18">${esc(plan.fullPrompt)}</textarea>${button('copy','复制完整提示词','','block')}<p class="assistant-note" id="assistant-copy-state" role="status"></p>`;}
 resultHTML(){const result=this.draft.result,items=result?.candidates||[];return `<section class="assistant-result"><span class="assistant-badge">${result.mediaKind==='audio'?'新版配音':'模拟结果'}</span><h3 tabindex="-1" id="assistant-result-title">${result.mediaKind==='audio'?'新配音已就绪':'修改方案已就绪'}</h3><p class="assistant-result-guidance">${esc(this.resultText())}</p>${items.map(c=>{const pending=this.session.candidates[c.sceneId]?.id===c.id,accepted=this.session.accepted[c.sceneId]?.id===c.id;return `<article class="assistant-result-item"><h4>${esc(sceneLabel(this.origin.film,c.sceneId))}</h4><span class="assistant-meta">${accepted?'已确认方案':pending?'待你检查':'已被更新的版本替代'}</span><ul>${c.changes.map(p=>`<li>${esc(FIELD_MAP[p.field].label)}：${esc(formatValue(p.field,p.before))} → <strong>${esc(formatValue(p.field,p.value))}</strong></li>`).join('')}</ul><details><summary>对比原版文案与参数</summary><p>同一原片范围：${c.start}—${c.end} 秒。</p>${c.candidateText.length?c.candidateText.map(n=>`<p><strong>${esc(n.status)}</strong><br>${esc(n.text)}</p>`).join(''):'<p>本场景暂无已标注旁白，不能编造文案或试听音轨。</p>'}<p>${c.audioGenerated&&c.timingVerified?'新配音已生成，已通过时长和原声窗口检查。':'未测量音频时长，未完成同步验证。'}</p></details>${c.narrationUrl?button('audition','试听新版',`data-scene="${esc(c.sceneId)}"`):''}${pending&&items.length>1?button('accept-one','确认这个场景的方案',`data-scene="${esc(c.sceneId)}"`):''}</article>`;}).join('')}<div class="assistant-card-actions">${button('review-original','查看原片')}${button('continue-edit','继续修改')}${button('discard','放弃新版')}</div></section>`;}
 helpHTML(){return `<section class="assistant-help"><h3 id="assistant-help-title" tabindex="-1">使用帮助</h3><h4>键盘操作</h4><dl class="assistant-key-help"><dt>O</dt><dd>在空白输入框或非输入区域开始语音输入；录音中再按一次结束识别。</dd><dt>Enter</dt><dd>发送文字；录音中先结束识别，再发送最终文字。</dd><dt>Shift + Enter</dt><dd>在输入框中换行。</dd><dt>Esc</dt><dd>停止录音或播报，退出提示词或帮助。</dd></dl><h4>示例要求</h4>${this.examplesHTML()}<h4>麦克风</h4><p>中文语音通过百炼实时识别，边说边填入文字，结束后确认最终结果。首次使用需允许麦克风并保持网络可用。录音期间暂停影片与站内播报。</p><h4>哪些内容会播报</h4><dl class="assistant-rule-list">${SPEECH_RULES.map(([label,text])=>`<dt>${label}</dt><dd>${text}</dd>`).join('')}</dl></section>`;}
 voiceStatusHTML(){const show=this.voice.active||this.voice.state==='error';return `<div class="assistant-voice-state" id="assistant-voice-state" ${show?'':'hidden'}>${esc(this.voiceMessage)}</div>`;}
 inputHTML(){
  const active=this.voice.active,waiting=this.voice.state==='stopping';
  return `<div class="assistant-composer"><label class="sr-only" for="assistant-input">你的修改要求</label><textarea id="assistant-input" rows="3" maxlength="1200" ${active?'readonly':''} placeholder="例如：旁白慢一点，动作讲细一点…">${esc(this.draft.input)}</textarea><div class="assistant-compose-toolbar"><div class="assistant-compose-tools">${button('voice',active?'结束语音 <kbd>O</kbd>':'语音 <kbd>O</kbd>',`aria-label="${active?'结束语音输入':'语音输入'}" aria-pressed="${active}" ${waiting?'disabled':''}`,'assistant-text-button')}${button('read-input',toolIcon('speaker'),`aria-label="听输入文字" title="听输入文字" ${active||!this.draft.input.trim()?'disabled':''}`,'assistant-tool')}</div>${button('generate',waiting?'等待文字…':active?'结束并发送':this.draft.status==='parsing'?'正在整理…':'发送 <kbd>↵</kbd>',`aria-label="发送修改要求" title="Enter 发送，Shift+Enter 换行" ${this.busy||waiting||(!active&&!this.draft.input.trim())?'disabled':''}`,'primary')}</div></div>${this.plan.changes.length?button('execute','确认执行',!this.plan.valid||this.busy||active||this.draft.status==='parsing'||this.draft.input.trim()?'disabled':'','block'):''}`;
 }
 footerHTML(plan,result,allAccepted){
  const d=this.draft;
  if(this.busy)return '<p class="assistant-meta">正在执行，请等待结果。</p>';
  if(this.view==='help')return button('close-help','返回助手','','block');
  if(this.view==='prompt')return button('back','返回修改指令','','block');
  if(result)return `${button('speak-result','听结果摘要')}${allAccepted?button('continue-flow',this.origin.canContinue?'满意并继续':'满意并完成','','primary block'):button('accept-all',d.result.candidates.length===1?(this.origin.canContinue?'满意并继续':'满意并完成'):'请逐个确认场景方案',d.result.candidates.length===1?'':'disabled','primary block')}<p class="assistant-meta">${d.result.mediaKind==='audio'?'采用后更新旁白，原版保留。':'确认的是模拟方案；原有配音保留。'}</p>`;
  if(this.category)return `${button('show-card','查看修改指令','','primary block')}${button('natural','用自然语言补充','','block')}`;
  if(this.view==='card')return `${this.scopeHTML(false)}<div class="assistant-confirm-actions">${button('supplement','继续补充要求')}${button('execute',d.status==='failed'?'重试执行':'确认执行',!plan.valid||d.status==='parsing'||d.input.trim()?'disabled':'','primary')}</div>`;
  if(this.mode==='advanced')return `${button('show-card','查看修改指令','','primary block')}<p class="assistant-meta">${plan.changes.length} 项修改 · 未执行</p>`;
  return this.inputHTML();
 }
 render(focusId){
  if(!this.draft)return;const d=this.draft,plan=this.plan,result=d.status==='result';
  const panelKey=[this.session.taskId,this.context.sceneId,this.mode,this.view,this.category,d.status,d.scope,this.busy,this.voice.state].join(':');
  const scroll=panelKey===this.lastPanelKey?this.el.querySelector('.assistant-scroll')?.scrollTop||0:0;this.lastPanelKey=panelKey;
  const active=focusId||this.el.contains(document.activeElement)&&document.activeElement.id;this.el.setAttribute('aria-busy',String(this.busy));
  const content=this.busy?'<section class="assistant-running" aria-label="正在执行"><span class="regeneration-spinner" aria-hidden="true"></span><h3>正在应用修改</h3><p>完成后，结果会显示在这里。</p></section>':this.view==='help'?this.helpHTML():this.view==='prompt'?this.promptHTML(plan):result?this.resultHTML():this.view==='card'?this.cardHTML(plan):this.mode==='advanced'?(this.category?this.categoryHTML(plan):this.overviewHTML(plan)):this.ordinaryHTML(plan);
  const allAccepted=result&&d.result.candidates.every(c=>this.session.accepted[c.sceneId]?.id===c.id),locked=this.busy||this.voice.active;
  this.el.innerHTML=`<div class="assistant-shell"><div id="assistant-live" class="sr-only" role="status" aria-live="polite"></div><header class="assistant-header"><div class="assistant-headline"><h2 id="chat-title" tabindex="-1">旁白助手</h2></div><div class="assistant-context-row"><label class="sr-only" for="assistant-scene">修改场景</label><select id="assistant-scene" title="${esc(sceneLabel(this.origin.film,this.context.sceneId))}" ${locked?'disabled':''}>${this.origin.film.scenes.map(s=>`<option value="${esc(s.id)}" ${s.id===this.context.sceneId?'selected':''}>${esc(sceneLabel(this.origin.film,s.id))}</option>`).join('')}</select><div role="tablist" aria-label="旁白助手模式" class="assistant-tabs">${['ordinary','advanced'].map(m=>`<button role="tab" id="assistant-tab-${m}" aria-controls="assistant-panel" aria-selected="${this.mode===m}" tabindex="${this.mode===m?0:-1}" data-assistant="mode" data-mode="${m}" ${locked?'disabled':''}>${m==='ordinary'?'普通模式':'高级编辑'}</button>`).join('')}</div></div></header><div class="assistant-scroll" id="assistant-panel" role="tabpanel" aria-labelledby="assistant-tab-${this.mode}">${this.voiceStatusHTML()}${content}${d.status==='failed'?`<div class="assistant-notice"><strong>本次未完成</strong><p>${esc(d.error)}</p></div>`:''}</div><footer class="assistant-footer">${this.footerHTML(plan,result,allAccepted)}</footer></div>`;
  const scrollEl=this.el.querySelector('.assistant-scroll');if(!focusId)scrollEl.scrollTop=scroll;
  if(this.voice.active){this.el.querySelectorAll('input,select,[data-assistant]').forEach(control=>{if(!['voice','generate','stop-speaking','focus-video'].includes(control.dataset.assistant))control.disabled=true;});}
  if(active&&this.visible)this.el.querySelector('#'+CSS.escape(active))?.focus({preventScroll:!focusId});
 }
 input(e){const el=e.target;if(el.id==='assistant-input'){this.voice.retrySession=null;this.draft.input=el.value;const b=this.el.querySelector('[data-assistant="generate"]');if(b)b.disabled=this.busy||!el.value.trim();const read=this.el.querySelector('[data-assistant="read-input"]');if(read)read.disabled=!el.value.trim();const execute=this.el.querySelector('[data-assistant="execute"]');if(execute)execute.disabled=!!el.value.trim()||this.draft.status==='parsing'||!this.plan.valid;this.hooks.save();}else if(el.id==='assistant-alias'&&this.person){try{editDraft(this.draft,[{field:'character_alias',targetCharacterId:this.person,value:el.value},...(el.value.trim()?[{field:'naming_mode',targetCharacterId:this.person,value:'用户别名'}]:[])],this.context);this.hooks.save();}catch(err){this.notify(err.message);}}}
 change(e){const el=e.target;if(this.busy)return;
  try{
   if(el.id==='assistant-scene'){this.pinnedScene=true;this.useScene(el.value);this.category=null;this.view=null;this.render('assistant-scene');this.notify('已切换到'+sceneLabel(this.origin.film,el.value)+'，已恢复这个场景的草稿。','scene');return;}
   if(el.id==='assistant-person'){this.person=el.value;this.context.selectedCharacterId=el.value||null;this.render('assistant-person');return;}
   if(el.id==='assistant-scope')editDraft(this.draft,[],this.context,{scope:el.value});
   else if(el.dataset.sceneTarget){const ids=new Set(this.draft.targetIds);el.checked?ids.add(el.dataset.sceneTarget):ids.delete(el.dataset.sceneTarget);editDraft(this.draft,[],this.context,{targetIds:[...ids]});}
   else if(el.dataset.field){const f=FIELD_MAP[el.dataset.field];editDraft(this.draft,[{field:f.key,value:JSON.parse(el.value),...(f.type==='set'?{op:el.checked?'add':'remove'}:{}),...(f.group==='people'&&this.person?{targetCharacterId:this.person}:{})}],this.context);}
   else if(el.id!=='assistant-alias')return;
   this.parseId++;this.hooks.save();this.render(el.id||undefined);if(el.id==='assistant-scope'&&el.value==='specified')this.el.querySelector('.assistant-targets input')?.focus();
  }catch(error){this.notify(error.message);}
 }
 async generate(text=this.draft.input){
  if(this.busy||this.voice.active||this.composing||!text.trim())return;this.hooks.stop();if(this.draft.clarification?.pendingText&&!this.context.selectedCharacterId&&!text.includes(this.draft.clarification.pendingText))text=this.draft.clarification.pendingText+'。'+text;const d=this.draft,context=this.context,revision=d.revision,id=++this.parseId;d.history.push({who:'user',text});d.status='parsing';d.input='';this.hooks.save();this.render();this.notify('正在整理修改要求。');
  try{
   const result=await (this.hooks.services||assistantServices).parse(text,context,clone(d),this);if(id!==this.parseId||this.draft!==d||d.revision!==revision||d.status==='running')return;
   applyInterpretation(d,result,context);const plan=this.plan,ready=plan.valid&&result.kind!=='explain';
   const message=ready?this.confirmationText(plan):result.message||d.message||plan.errors.join(' ');
   d.history.push({who:'assistant',text:message,card:ready});d.history=d.history.slice(-24);
   if(ready&&!d.input.trim())this.view='card';else if(result.kind==='explain')this.view=null;
   this.hooks.save();this.render(ready&&!d.input.trim()?'assistant-command-title':undefined);
   this.notify(message,result.kind==='explain'?'answer':ready?'ready':d.clarification?'clarify':'error');
  }
  catch(e){if(id===this.parseId){d.status='failed';d.error='整理失败，请重新输入。';this.render();this.notify(d.error,'error');}}
 }
 async execute(){
  if(this.busy||this.voice.active||this.draft.status==='parsing')return;
  if(this.draft.input.trim())return this.notify('还有未发送的修改要求，请先发送并检查新方案，再确认执行。','error');
  const d=this.draft,context=this.context,session=this.session,plan=this.plan;let run;try{run=beginRun(d,plan);}catch(e){return this.notify(e.message,'error');}
  this.busy=true;this.parseId++;this.hooks.save();this.hooks.stop();this.view=null;this.render();this.hooks.onStart(context,run);this.notify('正在执行修改指令，助手保持展开。','running');
  let succeeded=false,errorMessage='';
  try{const result=await (this.hooks.services||assistantServices).run(run,this);if(!finishRun(session,d,result))throw new Error(d.error||'结果已过期，当前版本未改变。');this.hooks.save();this.hooks.onResult(context,result);succeeded=true;}
  catch(error){failRun(d,run,error);this.hooks.save();this.hooks.onFailure(context,error);errorMessage=error.message;}
  finally{this.busy=false;this.draft=d;this.context=context;this.render(succeeded?'assistant-result-title':undefined);this.notify(succeeded?this.resultText():errorMessage,succeeded?'result':'error');}
 }
 showResult(){if(!this.draft)return;this.view=null;this.el.hidden=false;this.render('assistant-result-title');this.el.scrollIntoView({block:'nearest'});}
 async action(action,b){
  if(this.busy&&!['stop-speaking','focus-video'].includes(action))return;
  if(this.voice.active&&!['voice','generate','stop-speaking','focus-video'].includes(action))return;
  if(action==='focus-video'){this.hooks.stop();this.hooks.focusVideo();return;}
  if(action==='stop-speaking'){this.hooks.stop();return;}
  if(action==='help'){if(this.view==='help')return this.action('close-help');this.helpReturn=this.view;this.view='help';this.hooks.stop();this.render('assistant-help-title');return this.notify('当前是使用帮助，包含快捷键和播报规则。看完后选择返回助手。','enter');}
  if(action==='close-help'){this.hooks.stop();this.view=this.helpReturn||null;return this.render('assistant-help-button');}
  if(action==='mode'){this.mode=b.dataset.mode;this.category=null;this.view=this.mode==='ordinary'&&this.plan.valid?'card':null;this.render('assistant-tab-'+this.mode);return this.notify(this.mode==='ordinary'?'普通模式，可以直接描述修改要求。':'高级编辑，可以查看六类标签。','mode');}
  if(action==='category'){this.category=b.dataset.group;this.view=null;this.render('assistant-category-title');return this.notify(GROUPS.find(g=>g.id===this.category).name+'类别，可以逐项选择，未修改的设置会保留。','category');}
  if(action==='back-categories'){const group=this.category;this.category=null;return this.render('assistant-group-'+group);}
  if(action==='audition'){const c=this.draft.result?.candidates.find(c=>c.sceneId===b.dataset.scene);if(c)return this.hooks.audition?.(c);return;}
  if(action==='voice')return this.startVoice();
  if(action==='read-input'){this.hooks.stop();this.hooks.say('assistant-input',this.draft.input,true);return;}
  if(action==='example'){this.prepareInput();this.draft.input=b.dataset.text;this.hooks.save();this.render('assistant-input');return;}
  if(action==='natural'||action==='supplement'){this.mode='ordinary';this.category=null;this.view=null;this.render('assistant-input');return;}
  if(action==='generate'){if(this.voice.active)return this.voice.finish(true);return this.generate();}
  if(action==='clarify'){const pending=this.draft.clarification?.pendingText;if(pending){this.context.selectedCharacterId=b.dataset.person;this.draft.clarification=null;return this.generate(pending.replace(/短发男子|这个人|白衣中年男子|戴眼镜的男子/,b.dataset.person));}}
  if(action==='undo-group'){undoCategory(this.draft,this.category,this.context);this.hooks.save();this.render();return this.notify('已撤销本组修改，其他类别保持不变。');}
  if(action==='show-card'){this.hooks.stop();this.category=null;this.view='card';this.render('assistant-command-title');const plan=this.plan;return this.notify(this.confirmationText(plan),plan.valid?'ready':'error');}
  if(action==='prompt'){this.view='prompt';return this.render('assistant-prompt-title');}
  if(action==='back'){this.view='card';return this.render('assistant-show-prompt');}
  if(action==='copy'){const text=this.plan.fullPrompt;try{if(!text)throw new Error();await navigator.clipboard.writeText(text);this.el.querySelector('#assistant-copy-state').textContent='已复制完整提示词。';}catch{const area=this.el.querySelector('#assistant-prompt');area.focus();area.select();this.el.querySelector('#assistant-copy-state').textContent='复制未成功，已选中文字，请使用系统复制。';}return;}
  if(action==='speak'||action==='speak-result'){this.hooks.stop();this.hooks.say('assistant-summary',action==='speak'?spokenChanges(this.plan,{full:true,characters:this.context.registry,real:!!this.hooks.services}):this.resultText(),true);return;}
  if(action==='execute')return this.execute();
  if(action==='continue-edit'){this.prepareInput();this.hooks.save();return;}
  if(action==='discard'){const ids=this.draft.result?.candidates.filter(c=>this.session.candidates[c.sceneId]?.id===c.id).map(c=>c.sceneId)||[this.context.sceneId];discardCandidates(this.session,ids);this.draft=openDraft(this.session,this.context,{fresh:true});this.hooks.onDiscard(this.context);this.hooks.save();this.view=null;this.render();return this.notify('已放弃未接受的新版，恢复已接受设置。');}
  if(action==='review-original'){this.hooks.stop();return this.hooks.reviewOriginal(this.context);}
  if(action==='accept-one'||action==='accept-all'){
   if(action==='accept-all'&&this.draft.result?.candidates.length!==1)return;
   const id=action==='accept-one'?b.dataset.scene:this.draft.result.candidates[0].sceneId;
   this.busy=true;this.render();this.notify(this.draft.scope==='current_and_following'?'正在采用，并将设置用于已有的后续场景。':'正在保存采用的配音。');
   try{if(this.session.candidates[id]){await this.hooks.services?.accept?.(this,id);acceptCandidate(this.session,id);}this.hooks.save();this.busy=false;this.render();if(action==='accept-all')return this.continueFlow();this.notify('已采用这个场景的新配音。');}
   catch(e){this.busy=false;this.render();this.notify(e.message,'error');}return;
  }
  if(action==='continue-flow')return this.continueFlow();
 }
 continueFlow(){const candidates=this.draft.result?.candidates||[];if(!candidates.length||!candidates.every(c=>this.session.accepted[c.sceneId]?.id===c.id))return;this.hooks.stop();this.hooks.onAccepted(this.context,this.session,candidates);}
}
