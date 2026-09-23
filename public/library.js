import {defaults} from './flow.js';
// These five QA uploads were explicitly withdrawn from the user-facing library.
// Keep their server media and history; future user uploads remain visible.
const withdrawnProjects=new Set([
 '72bc6273-d3b0-43e3-a762-2fd11f4139d9',
 'fbfc9220-baaa-4750-9be6-adf35e7e50a8',
 '274c6da5-8f87-4a6b-8f0d-b67b2aac8d7d',
 '954ddbca-fa85-405d-9b97-6e3e0778a626',
 'ab005456-2180-4b20-a456-0299af9528e2',
]);
export const isListedVideo=item=>![item.id,item.sourceProjectId,item.projectId,item.assetId].some(id=>withdrawnProjects.has(String(id||'').replace(/^upload(?:ed)?-/,'')));

export function mergePublicLibrary(catalog,saved=[],initialSettings=defaults()){
 const available=new Map(catalog.map(f=>[f.id,f]));
 const result=saved.filter(x=>available.has(x.assetId));const added=[];
 for(const film of catalog){const id=film.id+'-original';const found=result.find(x=>x.id===id);
  if(found){found.title=film.title;found.description=film.description||'';found.duration=film.duration;found.public=true;}
  else added.unshift({id,assetId:film.id,title:film.title,description:film.description||'',duration:film.duration,settings:{...initialSettings},position:0,created:0,public:true});
 }
 return [...added,...result];
}
export function visibleLibrary(items,{query='',all=false}={}){
 const q=query.trim().toLocaleLowerCase();const matches=items.filter(isListedVideo).filter(x=>x.title.toLocaleLowerCase().includes(q));return all?matches:matches.slice(0,6);
}
export const hasNarration=film=>!!film?.narration?.['normal-balanced']?.length&&!!film.fallbackAudio?.['normal-balanced'];
