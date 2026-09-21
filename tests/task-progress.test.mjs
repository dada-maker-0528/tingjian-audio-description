import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressQueue,TASK_TIMING,highlightJSON,highlightCode,expandTaskEvent} from '../public/task-progress.js';
const start=(stage=0)=>({id:`${stage}:start`,type:'start',stage});
const done=(stage=0)=>({id:`${stage}:done`,type:'done',stage});
test('elapsed time cannot complete an unfinished real task',()=>{
 const q=new ProgressQueue(2);q.push(start());q.tick(0);q.tick(600000);
 assert.deepEqual(q.states,['running','pending']);assert.equal(q.finished,false);
 q.push({id:'finish',type:'finish'});q.tick(600001);assert.equal(q.finished,false);
});
test('stages advance one at a time with minimum dwell, row cadence and pause',()=>{
 const q=new ProgressQueue(2,{stageMs:4000,logMs:850,pauseMs:280});q.push(start());q.push({id:'log',type:'log',stage:0});q.push(done());q.push(start(1));q.push(done(1));q.push({id:'finish',type:'finish'});
 q.tick(0);assert.equal(q.tick(500),null);assert.equal(q.tick(850).type,'log');assert.equal(q.tick(1000),null);
 assert.equal(q.tick(3999),null);assert.equal(q.tick(4000).type,'done');
 assert.equal(q.tick(4100),null);assert.equal(q.tick(4280).stage,1);
 assert.deepEqual(q.states,['done','running']);assert.equal(q.tick(8279),null);q.tick(8280);q.tick(8560);assert.equal(q.finished,true);
});
test('failure clears queued successes and cannot enter the next stage',()=>{
 const q=new ProgressQueue(2);q.push(start());q.push(done());q.push(start(1));q.tick(0);q.fail();
 q.push({id:'finish',type:'finish'});q.tick(900000);assert.deepEqual(q.states,['failed','pending']);assert.equal(q.finished,false);
});
test('repeated polling events do not replay logs or completion',()=>{
 const q=new ProgressQueue(1);q.push(start());q.push(start());assert.equal(q.pending.length,1);q.tick(0);q.push(start());assert.equal(q.pending.length,0);
});
test('default short plans stay within the requested presentation budget',()=>{
 for(const count of [3,4]){const q=new ProgressQueue(count);for(let i=0;i<count;i++){q.push(start(i));q.push(done(i));}q.push({id:'finish',type:'finish'});let now=0;for(;!q.finished&&now<30000;now+=80)q.tick(now);assert.ok(now+TASK_TIMING.finishMs>=6000);assert.ok(now+TASK_TIMING.finishMs<=12000);}
});

test('structured payloads are highlighted and escaped as data, never executable HTML',()=>{
 const html=highlightJSON('  "value": "<img src=x onerror=alert(1)>",');assert.ok(html.includes('code-key'));assert.ok(html.includes('code-string'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});

test('node excerpts arrive in batches, preserve long lines and do not complete a task',()=>{
 const event={id:'cache:1',type:'log',node:'cache',stage:0,message:'查找音轨'};
 const expanded=expandTaskEvent(event),batches=expanded.filter(e=>e.type==='code-batch');
 assert.ok(batches.length>1);assert.ok(batches[0].lines.some(line=>line.length>100));
 assert.ok(batches.every(e=>e.lines.length<=TASK_TIMING.codeBatch));assert.equal(expanded.at(-1).blockEnd,true);
 const q=new ProgressQueue(1);q.push(start());for(const e of [...expanded,...expanded])q.push(e);
 assert.equal(q.pending.length,expanded.length+1);
 for(let t=0;t<20000;t+=100)q.tick(t);
 assert.equal(q.states[0],'running');assert.equal(q.finished,false);
});

test('JavaScript snippets remain inert and unknown nodes do not invent logic',()=>{
 const html=highlightCode('const value = "<img src=x onerror=alert(1)>"; // <script>');
 assert.ok(html.includes('code-keyword'));assert.ok(html.includes('code-comment'));
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));
 assert.equal(expandTaskEvent({id:'unknown',type:'log',node:'toString',message:'等待'}).length,1);
 const result=expandTaskEvent({id:'result',type:'log',code:{ready:true}});
 assert.equal(result.length,2);assert.equal(result[1].message,'{"ready":true}');
});

test('real workflow events select their own implementation without needing demo data',()=>{
 for(const id of ['settings','range','analysis-result','role-result','sample-range','media-result','part:1',...Array.from({length:5},(_,i)=>`pipeline:job-id:${i}`)]){
  const events=expandTaskEvent({id,type:'log',stage:0,message:'实际任务事件'});
  assert.ok(events.some(e=>e.type==='code-batch'),id);
  assert.ok(!JSON.stringify(events).includes('preset_demo'),id);
 }
 assert.equal(expandTaskEvent({id:'pipeline:job-id:unknown',type:'log'}).length,1);
});
