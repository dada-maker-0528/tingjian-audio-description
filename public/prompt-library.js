import {FIELDS,GROUPS,patchKey,fieldPrompt,fieldValue,validateSelection,previewSelection,selectionText} from './prompt-catalog.js';
import {clone} from './assistant/schema.js';
import {createProductionPrompts} from './production-prompts.js';
import {enterContent} from './ui-motion.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='tingjian-assistant-prompt-presets-v1';
export function createPromptLibrary({modal,show,announce,getAssistant=()=>null,applySelection}){
 let group='sound',person='',source=null,selected=[],values={},presets=[],message='';
 const legacy=createProductionPrompts({modal,show,announce,onBack:()=>open({resume:true})});
 const key=f=>patchKey({field:f.key,...(f.group==='people'&&person?{targetCharacterId:person}:{})});
 const value=f=>Object.hasOwn(values,key(f))?values[key(f)]:fieldValue(source,f,person);
 const say=text=>{message=text;const el=modal.querySelector('#catalog-status');if(el)el.textContent=text;};
 function control(f){
  const v=value(f),id='catalog-'+f.key;
  if(f.type==='alias')return `<label class="sr-only" for="${id}">用户别名</label><input id="${id}" data-value="${f.key}" value="${esc(v)}" maxlength="30" placeholder="先选择人物，再填写称呼" ${person?'':'disabled'}>`;
  if(f.type==='set')return `<fieldset class="catalog-options"><legend class="sr-only">${f.label}</legend>${f.options.map((o,i)=>`<label><input type="checkbox" data-value="${f.key}" value="${i}" ${v.includes(o.value)?'checked':''}>${esc(o.label)}</label>`).join('')}</fieldset>`;
  return `<label class="sr-only" for="${id}">${f.label}</label><select id="${id}" data-value="${f.key}">${f.options.map((o,i)=>`<option value="${i}" ${o.value===v?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
 }
 function render(){
  const meta=GROUPS.find(g=>g.id===group),fields=FIELDS.filter(f=>f.group===group);
  modal.querySelector('#prompt-catalog').innerHTML=`<div class="catalog-intro"><div><p class="catalog-eyebrow">旁白编辑 · 6 类 / ${FIELDS.length} 个字段</p><p>选好表达要求，组合后加入旁白助手草稿。</p></div><button type="button" class="text-btn" id="catalog-legacy">制作模板与历史 ↗</button></div><div class="catalog-context">${source?`当前：${esc(source.context.film.title||'当前影片')} · 场景 ${source.context.number} ${esc(source.context.scene.title)}<span>沿用助手当前的应用范围</span>`:'尚未打开编辑场景。可以浏览、复制和保存组合；打开影片的旁白助手后再加入草稿。'}</div><div class="catalog-layout"><nav class="catalog-nav" aria-label="旁白提示词分类">${GROUPS.map(g=>`<button type="button" data-group="${g.id}" aria-current="${g.id===group?'true':'false'}"><span>${g.name}</span><small>${FIELDS.filter(f=>f.group===g.id).length}</small></button>`).join('')}<div class="catalog-nav-note">分类、字段和选项与旁白助手一致。</div></nav><section class="catalog-fields" aria-label="${meta.name}提示词"><div class="catalog-section-heading"><h3>${meta.name}</h3><p>${meta.hint}</p></div>${group==='people'?`<label class="catalog-person">适用人物<select id="catalog-person"><option value="">通用规则</option>${(source?.context.registry||[]).map(c=>`<option value="${esc(c.id)}" ${person===c.id?'selected':''}>${esc(c.visualName||c.name)} · ${esc(c.id)}</option>`).join('')}</select></label>`:''}${fields.map(f=>`<article class="catalog-field" data-field-card="${f.key}"><div class="catalog-field-title"><h4>${f.label}</h4><button type="button" class="btn small" data-add="${f.key}" aria-label="${selected.some(p=>patchKey(p)===key(f))?'更新':'加入'}${f.label}到组合" ${f.type==='alias'&&!person?'disabled':''}>${selected.some(p=>patchKey(p)===key(f))?'更新组合':'加入组合'}</button></div><p>${esc(f.help)}</p>${control(f)}<details><summary>对应提示词</summary><p class="catalog-fragment" data-fragment="${f.key}">${esc(fieldPrompt(f.key,f.type==='alias'?(person?{[person]:value(f)}:{}):value(f)))}</p></details></article>`).join('')}</section><aside class="catalog-selection" aria-label="本次组合"><h3>本次组合 <span>${selected.length} 项</span></h3><p class="catalog-muted">只加入明确选中的字段，其他设置沿用助手草稿。</p><div class="catalog-selected">${selected.map((p,i)=>`<div><span>${esc(selectionText([p],source?.context))}</span><button type="button" data-remove="${i}" aria-label="移除${esc(selectionText([p],source?.context))}">×</button></div>`).join('')||'<p class="catalog-empty">从左侧挑选需要调整的字段。</p>'}</div><button type="button" class="btn" id="catalog-preview">${source?'预览完整提示词':'查看组合提示词'}</button><button type="button" class="btn" id="catalog-copy" ${selected.length?'':'disabled'}>复制组合要求</button><details class="catalog-presets"><summary>常用组合 <span>仅此浏览器</span></summary><label for="catalog-preset-name">组合名称</label><input id="catalog-preset-name" maxlength="30" placeholder="例如：清楚交代人物动作"><button class="btn small" type="button" id="catalog-save" ${selected.length?'':'disabled'}>保存本次组合</button>${presets.map((p,i)=>`<div class="catalog-preset-row"><button type="button" data-load="${i}">${esc(p.name)}</button><button type="button" data-delete="${i}" aria-label="删除组合${esc(p.name)}">删除</button></div>`).join('')}</details><div class="catalog-apply"><button type="button" class="btn primary" id="catalog-apply" ${selected.length&&source?.canApply?'':'disabled'}>加入助手草稿</button><p>${esc(source?(source.canApply?'加入后检查修改方案，确认前不会生成配音。':source.reason):'打开影片的旁白助手后可使用。')}</p></div><p id="catalog-status" role="status" aria-live="polite">${esc(message)}</p></aside></div><section id="catalog-full-preview" hidden><div class="catalog-preview-heading"><h3>完整提示词预览</h3><button type="button" class="btn small" id="catalog-hide-preview">收起预览</button></div><p id="catalog-preview-note"></p><textarea id="catalog-prompt" readonly rows="16" aria-label="提示词预览"></textarea></section>`;
  modal.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{if(group===b.dataset.group)return;group=b.dataset.group;render();modal.querySelector(`[data-group="${group}"]`).focus();enterContent(modal.querySelector('.catalog-fields'));});
  modal.querySelector('#catalog-person')?.addEventListener('change',e=>{person=e.target.value;render();modal.querySelector('#catalog-person').focus();});
  modal.querySelectorAll('[data-value]').forEach(el=>el.addEventListener('change',()=>{
   const f=FIELDS.find(f=>f.key===el.dataset.value);values[key(f)]=f.type==='alias'?el.value:f.type==='set'?[...modal.querySelectorAll(`[data-value="${f.key}"]:checked`)].map(e=>f.options[Number(e.value)].value):f.options[Number(el.value)].value;
   modal.querySelector(`[data-fragment="${f.key}"]`).textContent=fieldPrompt(f.key,f.type==='alias'?{[person]:value(f)}:value(f));
   say('选项已调整，点击“'+(selected.some(p=>patchKey(p)===key(f))?'更新组合':'加入组合')+'”后纳入本次要求。');
  }));
  modal.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
   try{const f=FIELDS.find(f=>f.key===b.dataset.add),p={field:f.key,value:clone(value(f)),...(f.group==='people'&&person?{targetCharacterId:person}:{})};
    let additions=[p];if(f.type==='alias')additions.push({field:'naming_mode',value:'用户别名',targetCharacterId:person});
    additions=validateSelection(additions,source?.context);selected=selected.filter(p=>!additions.some(q=>patchKey(p)===patchKey(q))).concat(additions);for(const p of additions)values[patchKey(p)]=clone(p.value);message='已加入组合，尚未更改助手草稿。';render();modal.querySelector(`[data-add="${f.key}"]`).focus();
   }catch(e){say(e.message);}
  });
  modal.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{selected.splice(Number(b.dataset.remove),1);render();modal.querySelector('#catalog-preview').focus();});
  modal.querySelector('#catalog-preview').onclick=()=>{
   try{const plan=previewSelection(source,selected),box=modal.querySelector('#catalog-full-preview');box.hidden=false;
    modal.querySelector('#catalog-prompt').value=plan?plan.fullPrompt:selected.map(p=>fieldPrompt(p.field,p.field==='character_alias'?{[p.targetCharacterId]:p.value}:p.value)).join('\n');
    modal.querySelector('#catalog-preview-note').textContent=plan?'按当前场景、原有草稿、所选字段和应用范围生成；尚未加入草稿或执行。'+(plan.errors.length?'检查提示：'+plan.errors.join(' '):''):'这里仅展示所选字段要求。完整提示词还需要当前场景事实、原有设置与应用范围。';
    modal.querySelector('#catalog-prompt').focus();box.scrollIntoView({block:'nearest'});
   }catch(e){say(e.message);}
  };
  modal.querySelector('#catalog-hide-preview').onclick=()=>{modal.querySelector('#catalog-full-preview').hidden=true;modal.querySelector('#catalog-preview').focus();};
  modal.querySelector('#catalog-copy').onclick=async()=>{try{await navigator.clipboard.writeText(selectionText(selected,source?.context));say('组合要求已复制。');}catch{say('复制未成功，可以展开提示词预览，选中文字后复制。');}};
  modal.querySelector('#catalog-apply').onclick=()=>{try{const patches=validateSelection(selected,source?.context);const plan=previewSelection(source,patches);if(!plan?.valid)throw new Error(plan?.errors.join(' ')||'请先打开旁白助手。');applySelection(patches,source.token);modal.close();announce('组合已加入助手草稿，请检查修改方案后确认执行。');}catch(e){say(e.message);}};
  modal.querySelector('#catalog-save').onclick=()=>{const name=modal.querySelector('#catalog-preset-name').value.trim();if(!name)return say('请给这个组合起个名字。');try{validateSelection(selected,source?.context);if(selected.some(p=>p.targetCharacterId))throw new Error('人物专属要求只用于当前影片；保存通用组合前请移除人物专属字段。');const next=[...presets,{name,patches:clone(selected)}].slice(-20);localStorage.setItem(STORAGE,JSON.stringify(next));presets=next;message='已保存在此浏览器，可从常用组合载入。';render();modal.querySelector('.catalog-presets').open=true;}catch(e){say(e.message||'保存失败，请检查浏览器存储空间。');}};
  modal.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>{try{const next=validateSelection(presets[Number(b.dataset.load)].patches,source?.context);selected=next;values=Object.fromEntries(next.map(p=>[patchKey(p),clone(p.value)]));message='已载入组合，尚未更改助手草稿。';render();modal.querySelector('#catalog-preview').focus();}catch(e){say(e.message);}});
  modal.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{try{const next=presets.filter((_,i)=>i!==Number(b.dataset.delete));localStorage.setItem(STORAGE,JSON.stringify(next));presets=next;render();modal.querySelector('.catalog-presets').open=true;}catch{say('删除未保存，请检查浏览器存储。');}});
  modal.querySelector('#catalog-legacy').onclick=()=>{modal.classList.remove('prompt-catalog-modal');void legacy.open();};
 }
 function open({resume=false}={}){
  if(!resume){source=getAssistant();source=source?clone(source):null;selected=[];values={};person='';message='';}
  try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');presets=Array.isArray(saved)?saved.filter(p=>p&&typeof p.name==='string'&&Array.isArray(p.patches)).slice(-20):[];}catch{presets=[];}
  show('提示词库','<div id="prompt-catalog"></div>');modal.classList.add('prompt-library-modal','prompt-catalog-modal');render();
 }
 modal.addEventListener('close',()=>modal.classList.remove('prompt-catalog-modal'));
 return {open};
}
