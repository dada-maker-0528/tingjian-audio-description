import {clone} from './schema.js';
import {parseRequest} from './model.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function parseMock(text,context,draft,{delay=280}={}){await wait(delay);return parseRequest(text,context,draft);}
export async function runMock(run,{delay=1100,fail=false}={}){
 await wait(delay);if(fail)throw new Error('模拟执行失败，原版与草稿已保留，请重试。');
 return {runId:run.id,taskId:run.taskId,submittedRevision:run.submittedRevision,mediaKind:'parameters-only',candidates:run.plan.targets.map(t=>({
  id:run.id+':'+t.sceneId,sceneId:t.sceneId,number:t.number,title:t.title,start:t.start,end:t.end,baseVersion:t.baseVersion,base:clone(t.base),settings:clone(t.effective),scope:run.plan.scope,patches:clone(t.inheritancePatches),changes:clone(t.changes),nodes:[...t.nodes],prompt:t.prompt,
  mediaKind:'parameters-only',audioGenerated:false,timingVerified:false,candidateText:t.cues.map(c=>({id:c.id,text:c.text,status:t.nodes.includes('rewrite')?'待改写；展示现有原文':'保留原文'})),issues:[...t.issues,'此结果为文案与参数预览，尚未生成对应的新配音。']
 }))};
}
// Replace these two methods to connect real interpretation and rendering services.
export const assistantServices={parse:parseMock,run:runMock};
