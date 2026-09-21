import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-revision-'));
delete process.env.VOLC_TTS_KEY;
const {promptProfile,promptHash,savePromptProfile,promptHistory}=await import('../backend/prompt-library.mjs');
const {revisionContext,validateRevision}=await import('../backend/revision.mjs');
const {preferences}=await import('../backend/workflow-state.mjs');
const {speechCacheKey,synthesizeDoubao}=await import('../backend/narration.mjs');
const {pcmToWav}=await import('../server/volc-protocol.mjs');
test('legacy project revision uses a checked snapshot; unsupported edits and stale versions never pass',async()=>{
 const p={workflow:{stage:'short',status:'review',current:{id:'v1'},candidate:preferences()}};
 const c=await revisionContext(p),input={versionId:'v1',baseHash:c.profile.hash,scope:'project',entries:c.profile.entries,settings:c.settings};
 assert.equal((await validateRevision(p,input)).hash,c.profile.hash);
 await assert.rejects(()=>validateRevision(p,{...input,settings:{...c.settings,speed:2}}),/参数无效/);
 await assert.rejects(()=>validateRevision(p,{...input,entries:{...input.entries,roles:'修改人物'}}),/不重新解析/);
 await assert.rejects(()=>validateRevision(p,{...input,scope:'library'}),/尚未修改/);
 p.workflow.current.id='v2';await assert.rejects(()=>validateRevision(p,input),e=>e.status===409);
});
test('restoring a template creates a new version and retains both earlier contents',async()=>{
 const first=await promptProfile();const second=await savePromptProfile({revision:first.revision,entries:{...first.entries,narration:'位置优先'}});
 const third=await savePromptProfile({revision:second.revision,entries:first.entries});
 const history=await promptHistory();assert.equal(history.length,3);assert.equal(history[1].entries.narration,'位置优先');assert.equal(third.hash,first.hash);assert.equal(third.revision,3);
 assert.notEqual(promptHash(second.entries),first.hash);
});
test('real audio cache reads distinguish prompt snapshots even when spoken text is identical',async()=>{
 const text='相同文本',a={filmId:'same-film',promptHash:'profile-A'},b={...a,promptHash:'profile-B'},cache=path.join(process.env.AIMEDIA_DATA_DIR,'speech-cache');
 await mkdir(cache,{recursive:true});const bytes=pcmToWav(Buffer.alloc(4800));await writeFile(path.join(cache,speechCacheKey(text,a)+'.wav'),bytes);
 const first=await synthesizeDoubao(text,path.join(process.env.AIMEDIA_DATA_DIR,'a.wav'),undefined,a);assert.equal(first.cacheStatus,'hit');
 await assert.rejects(()=>synthesizeDoubao(text,path.join(process.env.AIMEDIA_DATA_DIR,'stale.wav'),AbortSignal.abort(),b));
 await writeFile(path.join(cache,speechCacheKey(text,b)+'.wav'),bytes);
 const second=await synthesizeDoubao(text,path.join(process.env.AIMEDIA_DATA_DIR,'b.wav'),undefined,b);assert.equal(second.cacheStatus,'hit');assert.notEqual(first.cacheKey,second.cacheKey);assert.deepEqual(await readFile(second.file),Buffer.from(bytes));
});
