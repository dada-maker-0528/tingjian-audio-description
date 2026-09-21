import {VOICES} from './voices.js';
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHTML;
const labels={speed:'旁白语速',gain:'旁白音量',density:'描述详略',voice:'旁白音色'};
const choices={speed:[[.8,'稍慢'],[1,'自然']],gain:[[.65,'较轻'],[.88,'适中'],[1,'较响']],density:[['concise','精简'],['balanced','均衡'],['detailed','详细']],voice:VOICES.map(v=>[v.id,v.label])};
const directives=[['position','人物位置','优先交代人物位置、朝向与相对关系。','focus'],['action','关键动作','优先描述理解剧情必需的关键动作。','focus'],['transition','场景转换','清楚交代必要的场景转换，不提前透露后续剧情。','focus'],['continuity','动作衔接','交代相邻动作之间有画面依据的衔接关系。','focus'],['short','短句直述','采用简短直述句，减少冗长并列句。','style'],['plain','减少修饰','减少装饰性形容词，保留必要事实。','style'],['camera','减少镜头术语','减少镜头术语，以人物与事件组织描述。','style']];
const valueLabel=(key,value)=>choices[key].find(x=>x[0]===value)?.[1]||value;
export function changePreview(before,after){return Object.entries(after).filter(([k,v])=>before[k]!==v).map(([k,v])=>`${labels[k]||k}：${valueLabel(k,before[k])} → ${valueLabel(k,v)}`);}
export function promptDiff(before,after){return before===after?'<p>此项未修改</p>':`<div class="revision-diff"><div><small>修改前</small><pre>${esc(before)}</pre></div><div><small>本次草稿</small><pre>${esc(after)}</pre></div></div>`;}
export function createRevisionEditor(root,{demo=false,settings,loadContext,preview,submit,textId='live-text',initial,recordHTML=''}={}){
 let disposed=false,busy=false,context=null,state=null,promptBase=null,selected=new Set(),textApplied='',controller=new AbortController();
 const q=s=>root.querySelector(s),status=text=>{q('.revision-status').textContent=text;};
 root.innerHTML=`<form class="revision-form"><label for="${textId}">修改意见</label><textarea id="${textId}" rows="3" maxlength="1500" placeholder="例如：旁白慢一点，减少服饰细节，多交代人物位置"></textarea><div class="revision-conversation"><button type="button" class="btn small" data-revision="interpret">${demo?'整理修改意见':'AI 整理修改意见'}</button>${recordHTML}</div><div class="revision-quick" aria-label="常用调整"><button type="button" data-quick="speed">旁白放慢</button><button type="button" data-quick="gain">提高旁白音量</button><button type="button" data-quick="concise">精简描述</button>${demo?'':'<button type="button" data-quick="detailed">增加描述</button>'}</div><details class="revision-categories"><summary>更多调整 · 按修改方向选择</summary><div class="revision-tabs" role="group" aria-label="修改方向">${[['voice','语音表现'],['density','描述详略'],['focus','叙述重点'],['style','表达风格']].map(([id,name])=>`<button type="button" data-category="${id}" aria-pressed="${id==='voice'}">${name}</button>`).join('')}</div><div class="revision-options-grid"></div></details><div class="revision-summary"><h3>本次修改</h3><div data-summary></div><p>${demo?'预设演示素材 · 仅调整已有音频版本和播放参数':'当前样片修订，确认后用于后续制作；成片修订先生成复核样片。'}</p></div>${demo?'<p class="revision-hint">叙述提示词用于真实上传任务；演示旁白为预设内容。</p>':`<details class="revision-technical"><summary>查看并编辑实际提示词与参数</summary><p class="revision-hint">以下是本次任务实际采用的可配置内容。系统另行组合素材信息与固定的事实、原声保护、输出结构约束。</p><pre data-parameters></pre>${[['narration','场景与旁白编排'],['shorten','旁白精简与适配']].map(([id,name])=>`<label for="revision-${id}">${name}</label><textarea id="revision-${id}" data-prompt="${id}" rows="5" maxlength="6000"></textarea><div data-diff="${id}"></div>`).join('')}<p>人物解析不在本次样片重制范围；修改人物解析模板用于新建项目。</p></details><fieldset class="revision-scope"><legend>生效范围</legend><label><input type="radio" name="revision-scope" value="project" checked>仅用于当前项目</label><label><input type="radio" name="revision-scope" value="library">同时更新提示词库</label><p data-scope-note></p><div data-library-diff></div></fieldset>`}<details class="revision-options"><summary>提示词库与模板版本</summary>${demo?'':`<label><input id="live-use-prompts" type="checkbox">载入提示词库最新版到本次草稿</label>`}<button class="btn small" type="button" data-action="prompt-library">打开提示词库 / AI 辅助编辑</button></details><p class="revision-status" role="status"></p><div class="revision-submit"><button class="btn primary" type="submit" disabled>生成修订样片</button></div></form>`;
 const text=q('#'+textId),form=q('form');form.id=demo?'chat-form':'live-feedback';
 function update(){
  if(!state)return;
  const changes=changePreview(settings,state.settings),changedPrompts=demo?[]:['narration','shorten'].filter(k=>context.profile.entries[k]!==state.entries[k]);
  q('[data-summary]').innerHTML=changes.map(c=>`<p>${esc(c)}</p>`).join('')+changedPrompts.map(k=>`<p>${k==='narration'?'场景与旁白编排':'旁白精简与适配'}：已修改 <a href="#revision-${k}" data-open-prompt="${k}">查看差异</a></p>`).join('')||'<p>尚未调整，提交将按当前配置重新生成。</p>';
  qAll('[data-open-prompt]').forEach(b=>b.onclick=e=>{e.preventDefault();q('.revision-technical').open=true;q('#revision-'+b.dataset.openPrompt).focus();});
  if(!demo){
   if(!changedPrompts.length)state.scope='project';
   q('[name="revision-scope"][value="library"]').disabled=busy||!changedPrompts.length;
   q(`[name="revision-scope"][value="${state.scope}"]`).checked=true;
   q('[data-parameters]').textContent=JSON.stringify(state.settings,null,2);
   for(const k of ['narration','shorten']){const input=q(`[data-prompt="${k}"]`);if(input!==document.activeElement)input.value=state.entries[k];q(`[data-diff="${k}"]`).innerHTML=promptDiff(context.profile.entries[k],state.entries[k]);}
   q('[data-scope-note]').textContent=state.scope==='library'?`保存为提示词库 v${context.library.revision+1}，仅更新本次改变的模板；其他运行中项目保持原版本。`:`基于模板 v${context.profile.revision} 创建项目专属快照，提示词库保持不变。`;
   q('[data-library-diff]').innerHTML=state.scope==='library'?'<p>将写入提示词库的实际差异：</p>'+changedPrompts.map(k=>promptDiff(context.library.entries[k],state.entries[k])).join(''):'';
  }
  q('[data-quick="speed"]').textContent=state.settings.speed===.8?'恢复自然语速':'旁白放慢';
  q('[data-quick="gain"]').textContent=state.settings.gain===1?'恢复适中音量':'提高旁白音量';
  q('[type="submit"]').disabled=busy||!!text.value.trim()&&text.value.trim()!==textApplied;
 }
 function qAll(s){return [...root.querySelectorAll(s)];}
 const disabledBefore=new WeakMap();
 function lock(value){busy=value;qAll('button,textarea,input').forEach(x=>{if(value){disabledBefore.set(x,x.disabled);x.disabled=true;}else x.disabled=disabledBefore.get(x)||false;});update();}
 function renderCategory(id='voice'){
  qAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===id)));
  const keys=id==='voice'?['speed','gain','voice']:id==='density'?['density']:[];
  q('.revision-options-grid').innerHTML=keys.map(k=>`<fieldset><legend>${labels[k]}</legend>${choices[k].filter(([v])=>!demo||k==='speed'||k==='voice'||k==='gain'&&v!==.65||k==='density'&&v!=='detailed').map(([v,label])=>`<button type="button" data-setting="${k}" data-value="${v}" aria-pressed="${state?.settings[k]===v}">${label}</button>`).join('')}</fieldset>`).join('')+(keys.length?'':demo?'<p>此类修改需要真实上传任务。演示素材不模拟提示词改写结果。</p>':directives.filter(x=>x[3]===id).map(([key,label])=>`<button type="button" data-directive="${key}" aria-pressed="${selected.has(key)}">${label}</button>`).join(''));
  qAll('[data-setting]').forEach(b=>b.onclick=()=>{const k=b.dataset.setting;state.settings[k]=['speed','gain'].includes(k)?Number(b.dataset.value):b.dataset.value;renderCategory(id);update();});
  qAll('[data-directive]').forEach(b=>b.onclick=()=>{const key=b.dataset.directive;selected.has(key)?selected.delete(key):selected.add(key);state.entries.narration=promptBase.narration+(selected.size?'\n本次制作重点：\n'+directives.filter(x=>selected.has(x[0])).map(x=>x[2]).join('\n'):'');renderCategory(id);update();});
 }
 qAll('[data-category]').forEach(b=>b.onclick=()=>renderCategory(b.dataset.category));
 qAll('[data-quick]').forEach(b=>b.onclick=()=>{if(!state)return;const k=b.dataset.quick;if(k==='speed')state.settings.speed=state.settings.speed===.8?1:.8;else if(k==='gain')state.settings.gain=state.settings.gain===1?.88:1;else state.settings.density=k;renderCategory();update();});
 text.oninput=()=>{update();status(text.value.trim()!==textApplied?'请先整理文字意见，再检查修改摘要。':'');};
 qAll('[data-prompt]').forEach(input=>input.oninput=()=>{state.entries[input.dataset.prompt]=input.value;promptBase={...state.entries};selected.clear();update();});
 qAll('[name="revision-scope"]').forEach(input=>input.onchange=()=>{state.scope=input.value;update();});
 if(!demo)q('#live-use-prompts').onchange=e=>{for(const k of ['narration','shorten'])state.entries[k]=(e.target.checked?context.library.entries:context.profile.entries)[k];promptBase={...state.entries};selected.clear();update();};
 q('[data-revision="interpret"]').onclick=async()=>{
  if(!state||!text.value.trim())return;const instruction=text.value.trim();lock(true);status('正在整理修改草稿，尚未提交制作。');
  try{const value=await preview({versionId:context?.versionId,baseHash:context?.profile.hash,settings:state.settings,entries:state.entries,instruction},controller.signal);if(disposed)return;
   if(value.clarification){status(value.clarification);return;}
   state.settings=value.settings;if(value.entries){state.entries=value.entries;promptBase={...value.entries};selected.clear();}textApplied=instruction;renderCategory();update();status(value.summary||'修改草稿已整理，请核对后生成修订样片。');
  }catch(e){if(!disposed)status(e.message);}finally{if(!disposed)lock(false);}
 };
 form.onsubmit=async e=>{e.preventDefault();if(!state||busy)return;if(text.value.trim()&&text.value.trim()!==textApplied){status('请先整理文字意见。');return;}lock(true);status('正在提交当前配置…');
  try{await submit({...state,versionId:context?.versionId,baseHash:context?.profile.hash,libraryRevision:context?.library.revision,note:text.value.trim()});}catch(e){if(!disposed)status(e.message);}finally{if(!disposed)lock(false);}
 };
 lock(true);
 const ready=(async()=>{try{context=demo?null:await loadContext(controller.signal);if(disposed)return;
  state={settings:{...settings},entries:context?{...context.profile.entries}:null,scope:'project'};
  if(initial&&initial.versionId===(context?.versionId||'demo')){state=structuredClone(initial.state);text.value=initial.text;textApplied=initial.textApplied||'';}
  promptBase=state.entries?{...state.entries}:null;if(!demo)q(`[name="revision-scope"][value="${state.scope}"]`).checked=true;
  renderCategory();lock(false);status('选择或编辑后统一提交，不会在点击标签时启动重制。');
 }catch(e){if(!disposed){status(e.message);qAll('button:not([data-action])').forEach(b=>b.disabled=true);}}})();
 return {ready,getDraft:()=>state?{versionId:context?.versionId||'demo',state:structuredClone(state),text:text.value,textApplied}:null,dispose(){disposed=true;controller.abort();}};
}
