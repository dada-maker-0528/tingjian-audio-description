import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NarrationAssistant} from '../public/assistant/view.js';
import {createSession,makeContext,openDraft,editDraft,compileDraft,beginRun,finishRun,acceptCandidate} from '../public/assistant/model.js';
import {runMock} from '../public/assistant/services.js';
const film=JSON.parse(await readFile(new URL('../public/assets/film.json',import.meta.url)));
async function result(scope='current',targets=['scene-01']){
 const session=createSession('scene-follow-test',film,{}),context=makeContext(film,'scene-01',0,session.taskId),draft=openDraft(session,context);
 editDraft(draft,[{field:'narration_gain_db',value:3}],context,{scope,targetIds:targets});
 const run=beginRun(draft,compileDraft(session,draft,context));finishRun(session,draft,await runMock(run,{delay:0}));
 draft.history.push({who:'user',text:'旁白大声一点'});
 return {session,context,draft};
}
test('reopening an accepted result retires the old card while retaining audio, history and baseline',async()=>{
 const x=await result();acceptCandidate(x.session,'scene-01');
 const saved=JSON.stringify(x.session.accepted),d=openDraft(x.session,x.context);
 assert.equal(d.status,'editing');assert.equal(d.result,null);assert.equal(d.revision,0);
 assert.equal(d.base.narration_gain_db,3);assert.equal(d.effective.narration_gain_db,3);
 assert.equal(d.history.length,1);assert.equal(compileDraft(x.session,d,x.context).changes.length,0);
 assert.equal(JSON.stringify(x.session.accepted),saved);
 assert.equal(openDraft(x.session,makeContext(film,'scene-02',13,x.session.taskId)).base.narration_gain_db,0);
});
test('reopening preserves unaccepted and partly accepted multi-scene results',async()=>{
 const x=await result('specified',['scene-01','scene-02']);
 assert.equal(openDraft(x.session,x.context),x.draft);acceptCandidate(x.session,'scene-01');
 assert.equal(openDraft(x.session,x.context),x.draft);assert(x.session.candidates['scene-02']);
 acceptCandidate(x.session,'scene-02');assert.equal(openDraft(x.session,x.context).status,'editing');
});
test('accepted following-scene preferences remain effective after retiring the result',async()=>{
 const x=await result('current_and_following');acceptCandidate(x.session,'scene-01');openDraft(x.session,x.context);
 const next=openDraft(x.session,makeContext(film,'scene-02',13,x.session.taskId));
 assert.equal(next.base.narration_gain_db,3);assert.equal(next.revision,0);
});
function view(x){
 const a=Object.create(NarrationAssistant.prototype);
 Object.assign(a,x,{origin:{film,taskId:x.session.taskId},el:{hidden:false,isConnected:true,contains:()=>false},voice:{active:false},busy:false,pinnedScene:true,parseId:0,cancelVoice(){},render(){},hooks:{save(){},stop(){},onAccepted(){},focusVideo(){}}});return a;
}
test('satisfied completion retires the card before navigation and releases the manually pinned scene',async()=>{
 const x=await result();acceptCandidate(x.session,'scene-01');const a=view(x);
 a.hooks.onAccepted=(context,session,candidates)=>{assert.equal(a.draft.status,'editing');assert.equal(context.sceneId,'scene-01');assert.equal(candidates.length,1);assert.equal(session.accepted['scene-01'].settings.narration_gain_db,3);};
 await a.continueFlow();assert.equal(a.pinnedScene,false);assert.equal(a.view,null);assert.equal(a.mode,'ordinary');
});
test('playback follows the next scene after adoption but protects pending edits and results',async()=>{
 const originalDocument=globalThis.document;globalThis.document={activeElement:null};
 try{
  const x=await result(),a=view(x);
  a.syncPlayhead('scene-02',13);assert.equal(a.context.sceneId,'scene-01');
  acceptCandidate(x.session,'scene-01');a.syncPlayhead('scene-02',13);
  assert.equal(a.context.sceneId,'scene-02');assert.equal(a.draft.status,'editing');assert.equal(a.draft.result,null);assert.equal(a.pinnedScene,false);
  a.draft.input='还没发送的要求';a.syncPlayhead('scene-03',36);assert.equal(a.context.sceneId,'scene-02');
  a.draft.input='';editDraft(a.draft,[{field:'speech_rate',value:.85}],a.context);a.syncPlayhead('scene-03',36);assert.equal(a.context.sceneId,'scene-02');
 }finally{globalThis.document=originalDocument;}
});
