import {promptProfile,promptHash,validatePromptEntries} from './prompt-library.mjs';
import {validatePreferences} from './workflow-state.mjs';
const conflict=message=>Object.assign(new Error(message),{status:409});
export function editableProject(p){
 const w=p.workflow;
 if(!w||!((w.status==='review'&&['short','medium','verify'].includes(w.stage))||(w.status==='complete'&&w.stage==='full')))throw conflict('请在当前样片或成片完成后修订');
}
export async function revisionContext(p){
 editableProject(p);const library=await promptProfile(),profile=p.promptProfile||library;
 return {versionId:p.workflow.current.id,settingsVersion:p.workflow.settingsVersion,settings:{...p.workflow.candidate},profile:{...profile,hash:promptHash(profile.entries)},library};
}
export async function validateRevision(p,input){
 editableProject(p);
 const profile=p.promptProfile||await promptProfile();
 if(input.versionId!==p.workflow.current.id||input.baseHash!==promptHash(profile.entries))throw conflict('项目版本已变化，请重新打开修订，当前草稿可复制保留');
 if(!validatePreferences(input.settings)||Object.keys(input.settings).some(k=>!['speed','gain','density','voice'].includes(k)))throw new Error('旁白参数无效');
 const entries=validatePromptEntries(input.entries);
 if(entries.roles!==profile.entries.roles)throw new Error('本次重制不重新解析人物；人物解析模板请在提示词库中修改，供新项目使用');
 if(!['project','library'].includes(input.scope))throw new Error('请选择修改生效范围');
 if(input.scope==='library'&&['narration','shorten'].every(k=>entries[k]===profile.entries[k]))throw new Error('尚未修改提示词；语速、音量等参数只用于当前项目');
 return {settings:{...input.settings},entries,hash:promptHash(entries),profile};
}
