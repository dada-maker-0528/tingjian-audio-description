import {defaults} from './flow.js';
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
 const q=query.trim().toLocaleLowerCase();const matches=items.filter(x=>x.title.toLocaleLowerCase().includes(q));return all?matches:matches.slice(0,6);
}
export const hasNarration=film=>!!film?.narration?.['normal-balanced']?.length&&!!film.fallbackAudio?.['normal-balanced'];
