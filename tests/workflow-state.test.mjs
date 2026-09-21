import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorkflow,sampleRange,nextStage,feedbackChange} from '../backend/workflow-state.mjs';
test('selects real gaps, keeps medium continuous, uses another verification scene, and renders the entire source',()=>{
  const p={duration:80,workflow:newWorkflow(),scenes:[{start:0,end:30},{start:30,end:60},{start:60,end:80}],windows:[{start:1,end:8},{start:61,end:69}]};
  const short=sampleRange(p,'short');assert.deepEqual(short,{start:0,end:7});p.workflow.ranges={short};
  const medium=sampleRange(p,'medium');assert.deepEqual(medium,{start:0,end:45});p.workflow.ranges.medium=medium;
  assert.deepEqual(sampleRange(p,'verify'),{start:60,end:67});assert.deepEqual(sampleRange(p,'full'),{start:0,end:80});
});
test('cannot invent a verification clip without another suitable scene',()=>{
  const p={duration:6,workflow:{ranges:{short:{start:0,end:6}}},scenes:[{start:0,end:6}],windows:[{start:0,end:6}]};
  assert.deepEqual(sampleRange(p,'short'),{start:0,end:6});assert.throws(()=>sampleRange(p,'verify'),/复验/);
});
test('medium rework requires verification; clear feedback is bounded and unsupported clauses do not partially execute',()=>{
  const w=newWorkflow();w.stage='medium';assert.equal(nextStage(w),'full');w.mediumEdited=true;assert.equal(nextStage(w),'verify');
  assert.equal(feedbackChange('旁白慢一点',w.candidate).candidate.speed,.8);
  assert.equal(feedbackChange('旁白大声一点',w.candidate).candidate.gain,1);
  assert.equal(feedbackChange('不要变慢',w.candidate).ok,false);
  assert.equal(feedbackChange('旁白慢一点并删除视频',w.candidate).ok,false);
  assert.equal(feedbackChange('声音太小',w.candidate).ok,false);
  assert.equal(feedbackChange('只改这句话',w.candidate).ok,false);
});
