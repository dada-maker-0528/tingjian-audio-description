import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {demoPlan} from '../public/demo-progress.js';
import {runTaskPlan,expandTaskEvent} from '../public/task-progress.js';
import {taskSnippet} from '../public/task-code.js';

const film={audioMode:'mixed-narration',scenePlanVersion:1,duration:64,scenes:[
 {id:'s1',title:'首个场景',start:0,end:39},
 {id:'s2',title:'第二个场景',start:39,end:64},
]};
async function run(t,{brokenMedia=false}={}){
 const previous=globalThis.document;
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 let mediaReads=0;
 globalThis.document={createElement(kind){
  assert.equal(kind,'video');mediaReads++;
  return {duration:64,removeAttribute(){},load(){},set src(value){queueMicrotask(()=>brokenMedia?this.onerror?.():this.onloadedmetadata?.());}};
 }};
 const events=[];let complete=false,failed=false;
 const view={signal:new AbortController().signal,event:e=>events.push(e),complete:async()=>{complete=true;return true;},fail(){failed=true;}};
 const tasks=demoPlan({kind:'generating',film,start:0,duration:39,settings:{speed:'normal',density:'balanced'},videoURL:'/fixture.mp4',prepareNarration(){assert.fail('Prebuilt mixed video must not synthesize another track');}});
 const ok=await runTaskPlan(view,tasks);
 return {events,complete,failed,ok,mediaReads};
}
test('prebuilt scene progress exposes source excerpts and actual selected scope without synthesizing',async t=>{
 const result=await run(t);
 assert.equal(result.ok,true);assert.equal(result.mediaReads,1);
 const nodes=result.events.filter(e=>e.node);
 assert.deepEqual(nodes.map(e=>e.node),['mixedRange','mixedMedia','mixedPlayback']);
 for(const event of nodes){
  const snippet=taskSnippet(event);
  assert(snippet.lines.length>=8,'A stage must include its complete implementation excerpt');
  const source=await readFile(new URL('../public/'+snippet.source,import.meta.url),'utf8');
  for(const line of snippet.lines)assert(source.includes(line),'Displayed code must exist in its named source');
  const display=expandTaskEvent(event);
  assert(display.some(e=>e.type==='code-batch'));
 }
 const playback=nodes.at(-1).code;
 assert.equal(playback.scene_count,1);assert.deepEqual(playback.scene_ids,['s1']);
 assert.equal(playback.clip_end,39);assert.equal(playback.playback_rate,1);
 assert.equal(playback.metadata_ready,true);assert.equal(playback.extra_narration,false);
});
test('failed media reads never emit ready playback parameters or successful handoff',async t=>{
 const result=await run(t,{brokenMedia:true});
 assert.equal(result.failed,true);assert.equal(result.complete,false);assert.equal(result.ok,false);
 assert(!result.events.some(e=>e.node==='mixedPlayback'));
 assert(!result.events.some(e=>e.type==='done'&&e.stage>=1));
});
