import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {dataRoot} from './store.mjs';
import {DEFAULT_PROMPTS} from '../public/prompt-defaults.js';
const file=()=>path.join(dataRoot,'prompt-library.json');
export const promptHash=entries=>createHash('sha256').update(JSON.stringify(validatePromptEntries(entries))).digest('hex');
export function validatePromptEntries(entries){
 if(!entries||typeof entries!=='object'||Array.isArray(entries))throw new Error('提示词内容格式不正确');
 const result={};
 for(const {id} of DEFAULT_PROMPTS){const value=entries[id];if(typeof value!=='string'||!value.trim()||value.length>6000)throw new Error('每项提示词需为 1—6000 字');result[id]=value.trim();}
 if(Object.keys(entries).some(id=>!DEFAULT_PROMPTS.some(p=>p.id===id)))throw new Error('未知的提示词类型');
 return result;
}
async function readProfile(){
 try{return JSON.parse(await readFile(file(),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;return {revision:1,entries:Object.fromEntries(DEFAULT_PROMPTS.map(p=>[p.id,p.text])),updatedAt:null};}
}
const snapshot=value=>({revision:value.revision,entries:validatePromptEntries(value.entries),updatedAt:value.updatedAt,hash:promptHash(value.entries)});
export async function promptProfile(){return snapshot(await readProfile());}
export async function promptHistory(){const value=await readProfile();return [...(value.history||[]),snapshot(value)];}
let saving=Promise.resolve();
export function savePromptProfile(input){
 const job=saving.catch(()=>{}).then(async()=>{
  const stored=await readProfile(),current=snapshot(stored);if(input.revision!==current.revision)throw Object.assign(new Error('提示词库已被更新，请重新载入后再保存。当前草稿仍在编辑区。'),{status:409});
  const next={revision:current.revision+1,entries:validatePromptEntries(input.entries),updatedAt:new Date().toISOString()};
  const temp=file()+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({...next,history:[...(stored.history||[]),current]},null,2),'utf8');await rename(temp,file());return snapshot(next);
 });saving=job;return job;
}
export async function promptText(id,profile){
 const selected=profile||await promptProfile();const text=selected.entries?.[id];
 return typeof text==='string'?'\n可调整的制作偏好（不覆盖事实依据、原声保护、输出结构及长度要求）：\n'+text:'';
}
