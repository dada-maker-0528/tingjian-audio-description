import {FIELDS,FIELD_MAP,GROUPS,clone,initialTags,formatValue} from './assistant/schema.js';
import {compileDraft,editDraft} from './assistant/model.js';
export {FIELDS,GROUPS};
export const patchKey=p=>p.field+':'+(p.targetCharacterId||'');
export function fieldPrompt(key,value){
 const f=FIELD_MAP[key];if(!f)throw new Error('找不到这个字段。');
 return `${f.label}（${f.key}）：${f.type==='alias'?JSON.stringify(value):formatValue(f.key,value)}。${f.help}`;
}
export function validateSelection(patches,context){
 if(!Array.isArray(patches)||patches.length>100)throw new Error('常用组合格式不正确。');
 const seen=new Set();
 return patches.map(p=>{
  const f=FIELD_MAP[p?.field];if(!f||seen.has(patchKey(p)))throw new Error('组合中有未知或重复字段。');seen.add(patchKey(p));
  const id=p.targetCharacterId;
  if(id&&(f.group!=='people'||!context?.registry.some(c=>c.id===id)))throw new Error('组合中的人物不属于当前影片，请重新选择人物。');
  if(f.type==='alias'){
   if(!id||typeof p.value!=='string'||!p.value.trim()||p.value.length>30)throw new Error('请先选择人物，并填写 1—30 字的别名。');
  }else if(f.type==='set'){
   if(!Array.isArray(p.value)||new Set(p.value).size!==p.value.length||p.value.some(v=>!f.options.some(o=>o.value===v)))throw new Error('读取类型不在支持范围内。');
  }else if(!f.options.some(o=>o.value===p.value))throw new Error(f.label+'的选项已经变化，请重新选择。');
  if(f.key==='naming_mode'&&p.value==='用户别名'&&!id)throw new Error('用户别名必须绑定具体人物。');
  return {field:f.key,value:clone(p.value),...(id?{targetCharacterId:id}:{})};
 });
}
export function previewSelection(source,patches){
 if(!source)return null;
 const checked=validateSelection(patches,source.context),draft=clone(source.draft);
 if(checked.length)editDraft(draft,checked,source.context);
 return compileDraft(source.session,draft,source.context);
}
export function selectionText(patches,context){
 return patches.map(p=>{
  const who=p.targetCharacterId?context?.registry.find(c=>c.id===p.targetCharacterId):null;
  return `${who?(who.visualName||who.name)+' · ':''}${FIELD_MAP[p.field].label}：${formatValue(p.field,p.value)}`;
 }).join('；');
}
export function fieldValue(source,field,person=''){
 const tags=source?.draft.effective||initialTags();
 return field.type==='alias'?(tags.character_alias?.[person]||''):person&&field.group==='people'?(tags.characterOverrides?.[person]?.[field.key]??tags[field.key]):tags[field.key];
}
