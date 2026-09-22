import {promptDiff} from './revision-editor.js';
import {DEFAULT_PROMPTS} from './prompt-defaults.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createPromptLibrary({modal,show,announce}){
 let state=null,draft=null,selected='narration',generation=0,controller=null,busy=false,renderGeneration=0;
 async function request(path,method='GET',body){
  const response=await fetch('/api/prompt-library'+path,{method,headers:{'Content-Type':'application/json','X-Tingjian-Request':'1'},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
  const value=await response.json();if(!response.ok||!value.ok)throw new Error(value.error||'提示词请求未完成');return value.data;
 }
 const status=text=>{const el=modal.querySelector('#prompt-status');if(el)el.textContent=text;};
 function render(){
  const rendered=++renderGeneration;
  const meta=DEFAULT_PROMPTS.find(p=>p.id===selected);
  modal.querySelector('#prompt-content').innerHTML=`<p class="prompt-scope">工作空间模板 · 版本 ${state.revision}。保存后用于新建的真实制作任务；已有任务需在修订时勾选采用最新版。演示素材的预设旁白不随模板改变。</p><div class="prompt-layout"><nav class="prompt-tabs" aria-label="提示词分类">${DEFAULT_PROMPTS.map(p=>`<button type="button" data-prompt-tab="${p.id}" ${selected===p.id?'aria-current="true"':''}>${p.name}</button>`).join('')}</nav><div class="prompt-editor"><label for="prompt-text">${meta.name}</label><p>${meta.description}</p><textarea id="prompt-text" rows="9" maxlength="6000" spellcheck="false">${esc(draft[selected])}</textarea><p class="prompt-note">可调整制作风格与重点。事实依据、原声保护和输出格式要求由系统保留。</p><details class="prompt-assist"><summary>AI 对话辅助修改 <span>可选</span></summary><p>描述想怎么改，AI 会提供建议稿；采用后仍需点击保存。</p><label class="sr-only" for="prompt-instruction">提示词修改要求</label><textarea id="prompt-instruction" rows="3" maxlength="1500" placeholder="例如：更强调人物位置和动作衔接，减少形容词"></textarea><button class="btn" type="button" id="prompt-ask" ${state.aiAvailable?'':'disabled'}>生成修改建议</button>${state.aiAvailable?'':'<p>AI 辅助当前未连接，可直接编辑提示词。</p>'}<div id="prompt-suggestion" hidden></div></details><div id="prompt-live-diff"></div><details class="prompt-history"><summary>版本历史、差异与应用记录</summary><div id="prompt-history-content">正在读取…</div></details><div class="prompt-actions"><button class="btn" type="button" id="prompt-reset">恢复此项默认</button><button class="btn primary" type="button" id="prompt-save">保存提示词</button></div><p id="prompt-status" role="status" aria-live="polite"></p></div></div>`;
  const input=modal.querySelector('#prompt-text');input.oninput=()=>{draft[selected]=input.value;status('尚未保存');modal.querySelector('#prompt-live-diff').innerHTML=promptDiff(state.entries[selected],input.value);};
  modal.querySelectorAll('[data-prompt-tab]').forEach(button=>button.onclick=()=>{if(busy)return;selected=button.dataset.promptTab;render();});
  modal.querySelector('#prompt-reset').onclick=()=>{draft[selected]=meta.text;input.value=meta.text;input.dispatchEvent(new Event('input'));status('已恢复默认草稿，保存后生效。');};
  modal.querySelector('#prompt-save').onclick=save;
  modal.querySelector('#prompt-ask').onclick=assist;
  modal.querySelector('.prompt-history').ontoggle=async e=>{if(!e.target.open)return;const token=generation;try{const value=await request('/history');if(token!==generation||rendered!==renderGeneration)return;const box=modal.querySelector('#prompt-history-content');box.innerHTML=`<label for="prompt-version">比较历史版本</label><select id="prompt-version">${value.versions.slice().reverse().map(v=>`<option value="${v.revision}">v${v.revision} · ${v.updatedAt||'初始模板'}</option>`).join('')}</select><div id="prompt-history-diff"></div><button class="btn small" type="button" id="prompt-restore-version">恢复此项到编辑区</button><h3>任务应用记录</h3>${value.usage.slice().reverse().slice(0,40).map(v=>`<p>${esc(v.title)} · 项目修订 ${v.settingsVersion} · 基于模板 v${v.promptRevision} · ${v.scope==='project'?'项目专属':'模板快照'} · ${esc(v.status)}<br><code>${esc(v.promptHash.slice(0,16))}</code></p>`).join('')||'<p>暂无版本记录。旧任务不补造历史。</p>'}`;const picker=box.querySelector('select'),draw=()=>{const v=value.versions.find(v=>v.revision===Number(picker.value));box.querySelector('#prompt-history-diff').innerHTML=promptDiff(v.entries[selected],state.entries[selected]);};picker.onchange=draw;draw();box.querySelector('#prompt-restore-version').onclick=()=>{draft[selected]=value.versions.find(v=>v.revision===Number(picker.value)).entries[selected];input.value=draft[selected];input.dispatchEvent(new Event('input'));status('历史内容已载入草稿，保存后创建新版本，不覆盖历史。');};}catch(error){if(token===generation&&rendered===renderGeneration)modal.querySelector('#prompt-history-content').textContent=error.message;}};
 }
 function lock(value){busy=value;modal.querySelectorAll('#prompt-content button,#prompt-content textarea').forEach(el=>el.disabled=value);if(!value&&!state.aiAvailable)modal.querySelector('#prompt-ask').disabled=true;}
 async function save(){
  const token=generation;lock(true);status('正在保存…');
  try{const value=await request('','PUT',{revision:state.revision,entries:draft});if(token!==generation)return;state={...state,...value};render();status('已保存为版本 '+state.revision+'。现有成片保持不变。');announce('提示词已保存。');}
  catch(e){if(token===generation)status(e.message);}finally{if(token===generation)lock(false);}
 }
 async function assist(){
  const instruction=modal.querySelector('#prompt-instruction').value.trim();if(!instruction){status('请先填写修改要求。');return;}
  const token=generation;lock(true);status('AI 正在整理修改建议，原提示词保持不变。');
  try{
   const value=await request('/assist','POST',{id:selected,text:draft[selected],instruction});if(token!==generation)return;
   const box=modal.querySelector('#prompt-suggestion');box.hidden=false;box.innerHTML=`<h3>建议稿</h3><p>${esc(value.summary)}</p><textarea id="prompt-proposed" rows="7" maxlength="6000" aria-label="AI 建议的提示词">${esc(value.text)}</textarea><button class="btn" type="button" id="prompt-adopt">采用到编辑区</button>`;
   box.querySelector('#prompt-adopt').onclick=()=>{draft[selected]=box.querySelector('textarea').value;modal.querySelector('#prompt-text').value=draft[selected];modal.querySelector('#prompt-text').dispatchEvent(new Event('input'));box.hidden=true;status('已采用建议，点击“保存提示词”后生效。');};status('建议已生成，尚未修改已保存的提示词。');
  }catch(e){if(token===generation)status(e.message);}finally{if(token===generation)lock(false);}
 }
 modal.addEventListener('close',()=>{generation++;controller?.abort();busy=false;modal.classList.remove('prompt-library-modal');});
 return {async open(){
  const token=++generation;controller?.abort();controller=new AbortController();busy=false;
  show('提示词库','<div id="prompt-content"><p>正在载入提示词…</p></div>');modal.classList.add('prompt-library-modal');
  try{state=await request('');if(token!==generation)return;draft={...state.entries};render();}
  catch(e){if(token===generation)modal.querySelector('#prompt-content').innerHTML=`<p role="status">${esc(e.message)}</p><p>请关闭后重试，已保存内容不会丢失。</p>`;}
 }};
}
