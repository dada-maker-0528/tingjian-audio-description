import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NarrationAssistant} from '../public/assistant/view.js';
import {createSession,makeContext,openDraft,editDraft} from '../public/assistant/model.js';
const film=JSON.parse(await readFile(new URL('../public/assets/film.json',import.meta.url)));
function setup(){
 const assistant=Object.create(NarrationAssistant.prototype),notices=[],focus=[],accepted=[];
 const session=createSession('confirmation-test',film,{}),context=makeContext(film,'scene-01',0,'confirmation-test');
 Object.assign(assistant,{session,context,draft:openDraft(session,context),origin:{film,canContinue:false},voice:{active:false},parseId:0,busy:false,mode:'ordinary',render:id=>focus.push(id),notify:(message,event)=>notices.push({message,event}),hooks:{stop(){},save(){},onStart(){},onResult(){},onFailure(){},onAccepted:(...args)=>accepted.push(args)}});
 return {assistant,notices,focus,accepted};
}
test('sending requirements explains the compiled proposal and waits for explicit execution',async()=>{
 const {assistant:a,notices,focus}=setup();
 await a.generate('旁白慢一点，动作讲细一点，后面也这样');
 const notice=notices.at(-1);
 assert.equal(notice.event,'ready');
 for(const value of ['0.85','动作','城市骑行','后续','确认执行','？'])assert(notice.message.includes(value),value);
 assert.equal(a.draft.history.at(-1).text,notice.message);
 assert.equal(focus.at(-1),'assistant-command-title');
 assert.equal(a.draft.run,null);assert.deepEqual(a.session.candidates,{});assert.deepEqual(a.session.accepted,{});
});
test('manual review explains the latest settings and never invites execution for an invalid target',async()=>{
 const {assistant:a,notices}=setup();
 editDraft(a.draft,[{field:'speech_rate',value:.85}],a.context);
 editDraft(a.draft,[{field:'speech_rate',value:1.15}],a.context);
 await a.action('show-card');
 assert.equal(notices.at(-1)?.event,'ready');assert.match(notices.at(-1).message,/1.15/);assert(!notices.at(-1).message.includes('0.85'));
 editDraft(a.draft,[],a.context,{scope:'specified',targetIds:[]});
 await a.action('show-card');
 assert.equal(notices.at(-1).event,'error');assert.match(notices.at(-1).message,/至少选择一个场景/);
});
test('asking about the scene with existing edits answers the question instead of requesting confirmation',async()=>{
 const {assistant:a,notices}=setup();await a.generate('旁白慢一点');
 await a.generate('刚才发生了什么？');
 assert.equal(notices.at(-1).event,'answer');assert.match(notices.at(-1).message,/已标注画面/);
 assert.equal(a.view,null);assert.equal(a.draft.effective.speech_rate,.85);assert.equal(a.draft.run,null);
});
test('unsubmitted additions cannot silently execute the previous proposal',async()=>{
 const {assistant:a,notices}=setup();await a.generate('旁白慢一点');a.draft.input='动作讲细一点';
 await a.execute();
 assert.equal(a.draft.run,null);assert.equal(notices.at(-1).event,'error');assert.match(notices.at(-1).message,/发送/);
});
test('typing confirmation never executes automatically or locks the confirmation control',async()=>{
 const {assistant:a,notices}=setup();await a.generate('旁白慢一点');await a.generate('确认执行');
 assert.equal(a.draft.clarification,null);assert(a.plan.valid);assert.equal(a.draft.run,null);
 assert.equal(notices.at(-1).event,'answer');assert.match(notices.at(-1).message,/选择“确认执行”/);
});
test('execution explains the result and still needs separate acceptance',async()=>{
 const {assistant:a,notices,accepted}=setup();await a.generate('旁白慢一点');await a.execute();
 assert.equal(notices.at(-1).event,'result');
 for(const value of ['模拟','尚未生成新配音','继续修改','满意并完成'])assert(notices.at(-1).message.includes(value),value);
 assert.equal(a.draft.status,'result');assert.deepEqual(a.session.accepted,{});assert.equal(accepted.length,0);
 await a.action('accept-all');assert(a.session.accepted['scene-01']);assert.equal(accepted.length,1);
});
test('continue editing from advanced results opens the input and keeps the unaccepted candidate',async()=>{
 const {assistant:a,focus}=setup();await a.generate('旁白慢一点');await a.execute();a.mode='advanced';
 await a.action('continue-edit');
 assert.equal(a.mode,'ordinary');assert.equal(focus.at(-1),'assistant-input');assert.equal(a.draft.base.speech_rate,.85);
 assert.equal(a.draft.status,'editing');assert(a.session.candidates['scene-01']);assert.deepEqual(a.session.accepted,{});
});
