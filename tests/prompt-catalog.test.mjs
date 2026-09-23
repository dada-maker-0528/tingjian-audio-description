import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FIELDS,GROUPS,fieldPrompt,validateSelection,previewSelection,fieldValue} from '../public/prompt-catalog.js';
import {createSession,openDraft,makeContext,editDraft,compileDraft} from '../public/assistant/model.js';
const film=JSON.parse(await readFile(new URL('../public/assets/film.json',import.meta.url)));
function setup(){const session=createSession('catalog-test',film,{}),context=makeContext(film,'scene-01',0,'catalog-test');return {session,context,draft:openDraft(session,context)};}
test('catalog field fragments match the actual complete prompt for all 29 fields',()=>{
 const s=setup(),plan=compileDraft(s.session,s.draft,s.context);assert.equal(GROUPS.length,6);assert.equal(FIELDS.length,29);
 for(const f of FIELDS)assert.ok(plan.fullPrompt.includes(fieldPrompt(f.key,s.draft.effective[f.key])),f.key);
});
test('library preview reuses the assistant compiler without changing live draft or scope',()=>{
 const s=setup();editDraft(s.draft,[{field:'action_detail',value:'细节'}],s.context,{scope:'specified',targetIds:['scene-01','scene-02']});
 const before=JSON.stringify(s),patches=[{field:'narration_gain_db',value:3}];const preview=previewSelection(s,patches);
 assert.equal(JSON.stringify(s),before);assert.equal(preview.targets.length,2);assert.equal(preview.scope,'specified');
 editDraft(s.draft,patches,s.context);const actual=compileDraft(s.session,s.draft,s.context);assert.equal(preview.fullPrompt,actual.fullPrompt);assert.equal(s.draft.effective.action_detail,'细节');assert.equal(s.draft.status,'editing');assert.equal(s.draft.run,null);
});
test('sets keep exact selections including empty sets and do not introduce unrelated changes',()=>{
 const s=setup(),preview=previewSelection(s,[{field:'text_categories',value:[]}]);assert.deepEqual(preview.patches,[{field:'text_categories',value:[]}]);assert.match(preview.fullPrompt,/读取类型（text_categories）：不主动读取/);
});
test('people rules bind to a real character; unknown or unbound aliases are rejected',()=>{
 const s=setup(),id=s.context.registry[0].id;
 assert.throws(()=>validateSelection([{field:'character_alias',value:'小明'}],s.context),/选择人物/);
 assert.throws(()=>validateSelection([{field:'character_alias',value:'小明',targetCharacterId:'foreign'}],s.context),/不属于/);
 const patches=[{field:'character_alias',value:'小明',targetCharacterId:id},{field:'naming_mode',value:'用户别名',targetCharacterId:id}];
 const p=previewSelection(s,patches);assert.ok(p.valid);assert.equal(p.targets[0].effective.character_alias[id],'小明');assert.equal(p.targets[0].effective.naming_mode,'已揭示姓名');
});
test('invalid saved selections fail as a whole and schema values preserve number types',()=>{
 assert.throws(()=>validateSelection([{field:'speech_rate',value:'0.85'}]),/选项/);
 assert.throws(()=>validateSelection([{field:'unknown',value:1}]),/未知/);
 assert.throws(()=>validateSelection([{field:'narration_gain_db',value:3},{field:'narration_gain_db',value:-3}]),/重复/);
 assert.equal(validateSelection([{field:'speech_rate',value:.85}])[0].value,.85);
});
test('catalog defaults show effective current settings and character overrides',()=>{
 const s=setup(),id=s.context.registry[0].id;editDraft(s.draft,[{field:'narration_gain_db',value:3},{field:'appearance_detail',value:'完整版',targetCharacterId:id}],s.context);
 assert.equal(fieldValue(s,FIELDS.find(f=>f.key==='narration_gain_db')),3);
 assert.equal(fieldValue(s,FIELDS.find(f=>f.key==='appearance_detail'),id),'完整版');
 assert.equal(fieldValue(null,FIELDS.find(f=>f.key==='speech_rate')),1);
});
