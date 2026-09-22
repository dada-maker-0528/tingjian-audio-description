import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {projectDir,save} from './store.mjs';
import {run,ffmpeg} from './media.mjs';
import {inspectAssistantFrames} from './ai.mjs';

export async function observeScene(p,scene,signal){
 p.assistant||={jobs:{},accepted:{}};p.assistant.observations||={};
 const key=`${scene.id||scene.sceneId}:${scene.start}:${scene.end}`;
 if(p.assistant.observations[key])return p.assistant.observations[key];
 const dir=path.join(projectDir(p.id),'assistant-observations');await mkdir(dir,{recursive:true});
 const count=Math.min(12,Math.max(2,Math.ceil((scene.end-scene.start)/2))),frames=[];
 for(let i=0;i<count;i++){
  const time=Math.min(scene.end-.05,scene.start+i*(scene.end-scene.start)/count),file=path.join(dir,`${scene.id||scene.sceneId}-${Math.round(time*1000)}.jpg`);
  await run(ffmpeg,['-v','error','-ss',String(time),'-i',p.source,'-frames:v','1','-vf','scale=960:-2','-q:v','3','-y',file],{signal});
  frames.push({time,url:'data:image/jpeg;base64,'+(await readFile(file)).toString('base64')});
 }
 const transcript=(p.transcript?.segments||[]).filter(s=>s.start<scene.end&&s.end>scene.start).map(s=>s.text).join('');
 const observation=await inspectAssistantFrames(frames,transcript,signal);
 p.assistant.observations[key]=observation;await save(p);return observation;
}
