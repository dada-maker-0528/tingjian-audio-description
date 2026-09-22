import {parseRequest} from './model.js';
export async function request(url,body,signal){
 const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Tingjian-Request':'1'}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:'no-store'});
 const value=await response.json();if(!response.ok||!value.ok)throw new Error(value.error||'服务请求未完成');return value.data;
}
export async function audioBaseline(url,cues){
 const response=await fetch(url);if(!response.ok)throw new Error('当前旁白读取失败，请重试');
 const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {audio:btoa(binary),cues};
}
export function createAssistantBackend({store,save,baseline,preview,stop}){
 store.sources||={};store.runs||={};
 const key=a=>a.origin.taskId;
 function source(a){
  const id=key(a);if(!store.sources[id]){store.sources[id]={filmId:a.origin.film.id,workspaceId:crypto.randomUUID(),settings:a.origin.settings,start:0,end:a.origin.film.duration};save();}
  return store.sources[id];
 }
 async function context(a){return request('/api/assistant/context',source(a));}
 return {
  async parse(text,ctx,draft,a){
   if(/读全文|读一遍|完整读|补读.*(文字|字幕|重复)|重复.*补读/.test(text)){
    const data=await context(a),s=source(a);const result=await request('/api/assistant/read',{source:s,sourceVersion:data.sourceVersion,sceneId:ctx.sceneId,kind:/补读|重复/.test(text)?'duplicate':'full',patches:a.plan.patches,baseline:s.projectId?undefined:await baseline(a)});
    store.sources[key(a)]={projectId:result.projectId};save();if(result.narrationUrl){stop();const audio=new Audio(result.narrationUrl);preview(audio);await audio.play();}
    return {kind:'explain',message:result.message+(result.text?'\n'+result.text:'')};
   }
   return parseRequest(text,ctx,draft);
  },
  async run(run,a){
   const data=await context(a),s=source(a);store.runs[key(a)]=run;save();
   let result=await request('/api/assistant/run',{source:s,sourceVersion:data.sourceVersion,requestId:run.id,sceneId:run.sceneId,baseCandidate:a.draft.baseVersion==='original'?null:a.draft.baseVersion,patches:run.plan.patches,scope:run.plan.scope,targetIds:run.plan.targets.map(t=>t.sceneId),baseline:s.projectId?undefined:await baseline(a)});
   store.sources[key(a)]={projectId:result.projectId};save();
   while(result.status==='running'){
    const label=a.el.querySelector('.assistant-running p');if(label)label.textContent=result.message;
    await new Promise(resolve=>setTimeout(resolve,700));result=await request(`/api/assistant/${result.projectId}/jobs/${result.id}`);
   }
   delete store.runs[key(a)];save();if(result.status!=='complete')throw new Error(result.message);
   return {runId:run.id,taskId:run.taskId,submittedRevision:run.submittedRevision,projectId:result.projectId,jobId:result.id,mediaKind:'audio',candidates:result.candidates};
  },
  async accept(a,sceneId){
   const result=a.draft.result;if(!result?.jobId)throw new Error('此方案没有实际配音，请重新生成');
   const value=await request(`/api/assistant/${result.projectId}/accept`,{jobId:result.jobId,sceneId});store.sources[key(a)]={projectId:value.projectId};save();return value;
  },
  async current(ownerId){const source=store.sources[ownerId];return source?.projectId?request('/api/assistant/context',source):null;}
 };
}
