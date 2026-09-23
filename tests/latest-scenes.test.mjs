import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFilm} from '../public/catalog-config.js';
import {makeContext,createSession,openDraft,editDraft,applyInterpretation,compileDraft} from '../public/assistant/model.js';
import {createMediaBackend} from '../public/assistant/media-backend.js';
import {MEDIA_PLANS,stageFilm,finalMediaReady,stageVideo} from '../public/stage-media.js';
import {newTask,confirmStage,canComplete} from '../public/flow.js';

function setup(interpret){const context=makeContext(defaultFilm,'scene-s1',0,'natural'),session=createSession('natural',defaultFilm),draft=openDraft(session,context);return {context,session,draft,a:{origin:{film:defaultFilm,phase:'medium'},session,draft},service:createMediaBackend({}, {store:{},save(){},interpret})};}
test('model intent is interpreted before selecting media; full field prompt and semantic evidence survive',async()=>{
 const x=setup(async input=>{assert.equal(input.text,'老是说他，我不知道说的是哪个人');return {kind:'patch',patches:[{field:'reference_mode',value:'每个动作点名'}],semantic:{provider:'model',promptHash:'test-profile'}};});
 const result=await x.service.parse('老是说他，我不知道说的是哪个人',x.context,x.draft,x.a);applyInterpretation(x.draft,result,x.context);x.draft.semantic=result.semantic;
 const plan=x.service.plan(compileDraft(x.session,x.draft,x.context),x.a);assert(plan.valid);assert.equal(plan.changes.length,2);assert(plan.fullPrompt.includes('【完整生效要求】'));assert(plan.fullPrompt.includes('test-profile'));
});
test('an old draft can be confirmed with existing media without replacing its requested fields',()=>{
 const x=setup();editDraft(x.draft,[{field:'action_detail',value:'细节'},{field:'reference_mode',value:'每个动作点名'}],x.context);
 const plan=x.service.plan(compileDraft(x.session,x.draft,x.context),x.a);assert(plan.valid);assert(plan.mediaUnchanged);assert(!plan.recovery);
 assert.equal(x.draft.effective.action_detail,'细节');assert.equal(x.draft.effective.information_level,'标准');assert(!x.draft.run);assert.deepEqual(x.session.accepted,{});
});
test('natural followup replaces stale proposed fields and records wider model intent without claiming extra changes',async()=>{
 const x=setup(async()=>({kind:'patch',patches:[{field:'reference_mode',value:'每个动作点名'},{field:'information_level',value:'标准'},{field:'action_detail',value:'过程'}],semantic:{provider:'model'}}));
 editDraft(x.draft,[{field:'action_detail',value:'细节'}],x.context);
 const result=await x.service.parse('我听不出是谁在做什么',x.context,x.draft,x.a);applyInterpretation(x.draft,result,x.context);
 const plan=x.service.plan(compileDraft(x.session,x.draft,x.context),x.a);assert(plan.valid);assert.equal(plan.changes.length,2);assert.equal(x.draft.effective.action_detail,'过程');assert.equal(result.semantic.requestedPatches.length,3);assert(result.notes.join('').includes('此方案只改这两项'));assert(!x.draft.run);
});
test('approved S1B plus corrected S2B reaches completed full-media state exactly once',()=>{
 const p=MEDIA_PLANS[defaultFilm.id],t=newTask(defaultFilm);confirmStage(t);confirmStage(t);t.acceptedS1Id=p.revised.id;confirmStage(t);assert(finalMediaReady(defaultFilm,t.acceptedS1Id));assert.equal(confirmStage(t),'full');assert(canComplete(t));t.mediaExtended=true;
 const f=stageFilm(defaultFilm,t);assert.equal(f.audioMode,'mixed-narration');assert.equal(f.duration,176.983333);assert.equal(f.scenes.length,2);assert.equal(f.scenes[1].start,39.066667);assert.equal(stageVideo(f,t,{}),'assets/NZ2_full_86f34f49.mp4');assert(f.narration['normal-balanced'].some(c=>c.text==='双眼变成蓝色。'&&Math.abs(c.start-129.583334)<.001));assert(!finalMediaReady(defaultFilm,'s1-a'));
});
