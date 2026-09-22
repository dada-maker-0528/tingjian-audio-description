import {request} from './assistant/backend-service.js';
export const projectRequest=(id,body)=>request(`/api/projects/${id}${body?'/listen-action':''}`,body);
export async function uploadVideo(file,voice){
 const response=await fetch('/api/upload',{method:'POST',headers:{'X-Tingjian-Request':'1','X-Request-Id':crypto.randomUUID(),'X-Filename':encodeURIComponent(file.name),'X-Voice':voice,'X-Scene-Flow':'1','Content-Type':file.type||'application/octet-stream'},body:file});
 const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'上传失败');return result.data;
}
export function filmFromProject(p){
 const settings=p.workflow.candidate,result=p.workflow.current?.result,cues=(result?.cues||[]).map(c=>({...c,start:c.start+(result.start||0),end:c.end+(result.start||0),maxDuration:c.maxDuration||c.end-c.start}));
 const variants=Object.fromEntries(['normal-balanced','normal-concise','slow-balanced','slow-concise'].map(k=>[k,cues]));
 const audio=Object.fromEntries(Object.keys(variants).map(k=>[k,result?.narrationUrl||'']));
 const scenes=p.scenes.map(s=>({...s,cues:cues.filter(c=>c.start>=s.start&&c.start<s.end).map((c,i)=>({...c,id:s.id+'-cue-'+i,windowId:s.id+'-window-'+i})),facts:(s.facts||[]).map((text,i)=>({id:s.id+'-fact-'+i,text,revealedAt:s.start}))}));
 return {id:'upload-'+p.id,projectId:p.id,project:p,actualContext:true,title:p.title,duration:p.duration,sourceUrl:p.sourceUrl,video:p.sourceUrl,fileName:p.id,kind:'上传视频',description:'来自你上传的视频',shortDescription:'真实分析与旁白制作',credits:'原片与原声保留 · AI 旁白请试听核对',scenePlanVersion:p.id+'-scenes-v1',scenes,roles:p.workflow.roles.map(r=>({...r,visualName:r.name,image:r.evidenceUrl||p.posterUrl,pos:'center',size:'cover',nameSource:'依据采样画面整理'})),covers:[{file:p.posterUrl||'',alt:p.title+'的采样画面'}],narration:variants,fallbackAudio:audio,guides:{},guideFiles:{},playbackSettings:{voice:settings.voice,speed:settings.speed===.8?'slow':'normal',density:settings.density,gain:settings.gain}};
}
