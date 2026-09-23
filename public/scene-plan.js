const seconds=value=>Math.round(value*1000)/1000;
export function validateScenePlan(film){
 const scenes=film.scenes;
 if(!film.scenePlanVersion||!Array.isArray(scenes)||!scenes.length)throw new Error('影片尚未准备场景划分。');
 let end=0;const ids=new Set();
 for(const scene of scenes){
  if(!scene.id||ids.has(scene.id)||!scene.title||!Number.isFinite(scene.start)||!Number.isFinite(scene.end)||scene.end<=scene.start||Math.abs(scene.start-end)>.001)throw new Error('场景必须按原片顺序连续排列，并有独立名称。');
  ids.add(scene.id);end=scene.end;
 }
 if(Math.abs(end-film.duration)>.001)throw new Error('场景划分必须完整覆盖影片。');
 return scenes;
}
export function sceneRange(film,count){
 const scenes=validateScenePlan(film);
 if(!Number.isInteger(count)||count<1||count>scenes.length)throw new Error('请选择有效的场景数量。');
 const selected=scenes.slice(0,count);
 return {start:selected[0].start,duration:seconds(selected.at(-1).end-selected[0].start),count,sceneIds:selected.map(s=>s.id),scenes:selected};
}
export function isSceneRange(film,start,duration){
 if(!Number.isFinite(start)||!Number.isFinite(duration))return false;
 try{return validateScenePlan(film).some((_,i)=>{const range=sceneRange(film,i+1);return range.start===start&&range.duration===duration;});}catch{return false;}
}
export const scenePreviewCount=task=>task?.mediaScene==='s2'&&!task?.mediaExtended?1:task?.stage==='short'?1:task?.sceneCount||1;
export const sceneScopeLabel=(film,count)=>count===1?`第 ${film.scenes?.[0]?.storyNumber||1} 个场景`:count===film.scenes?.length?`全部 ${count} 个场景`:`前 ${count} 个场景`;
export const sceneStageLabel=task=>task?.mediaScene==='s2'?'第 2 个场景':task?.stage==='short'?'第 1 个场景':task?.stage==='medium'?`前 ${task.sceneCount||3} 个场景`:'';
