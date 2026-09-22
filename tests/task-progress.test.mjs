import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressQueue,expandTaskEvent,TASK_TIMING} from '../public/task-progress.js';

test('fast task completion stays behind every queued code batch and stage presentation',()=>{
 const q=new ProgressQueue(1);
 const start={id:'start',type:'start',stage:0};
 q.push(start);
 const expanded=expandTaskEvent({id:'source',type:'log',stage:0,node:'presetScenes',message:'检查场景'});
 expanded.forEach(e=>q.push(e));
 q.push({id:'done',type:'done',stage:0});q.push({id:'finish',type:'finish'});
 const consumed=[];
 assert.equal(q.tick(1000).type,'start');assert.equal(q.finished,false);
 for(let now=1001;now<20000&&!q.finished;now++){
  const e=q.tick(now);if(e){consumed.push(e.id);if(e.type==='done')assert(now>=1000+TASK_TIMING.stageMs);}
 }
 assert.deepEqual(consumed,[...expanded.map(e=>e.id),'done','finish']);
 assert(q.finished);
});

test('a failed producer cannot reveal successful completion from queued events',()=>{
 const q=new ProgressQueue(2);
 q.push({id:'s',type:'start',stage:0});q.tick(1000);
 q.push({id:'d',type:'done',stage:0});q.push({id:'finish',type:'finish'});
 q.fail(0);
 assert.equal(q.tick(99999),null);assert.equal(q.finished,false);
 assert.equal(q.states[0],'failed');
});
