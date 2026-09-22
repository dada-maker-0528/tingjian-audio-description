import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readFile} from 'node:fs/promises';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-coverage-'));
const {assistantContext,beginAssistantRun,assistantJob,acceptAssistant,validateBaselineCoverage}=await import('../backend/assistant.mjs');
const {getProject,projectDir,save}=await import('../backend/store.mjs');
const {run,ffmpeg}=await import('../backend/media.mjs');
const {films}=await import('../public/catalog-config.js');
const film=films.find(f=>f.fallbackAudio?.['normal-balanced']);
async function pcm(file,start,name){const out=path.join(process.env.AIMEDIA_DATA_DIR,name+'.pcm');await run(ffmpeg,['-v','error','-i',file,'-ss',String(start),'-f','s16le','-y',out]);return readFile(out);}
function equalAudio(a,b){assert.equal(a.length,b.length);let delta=0;for(let i=0;i<a.length;i+=2)delta=Math.max(delta,Math.abs(a.readInt16LE(i)-b.readInt16LE(i)));assert.ok(delta<=1,'unselected PCM delta '+delta);}
test('preview-only baseline is rejected; full track and accepted edit survive legacy coverage repair',async()=>{
 const expected=film.narration['normal-balanced'];assert.ok(expected.length>=5);
 assert.throws(()=>validateBaselineCoverage(expected,expected.slice(0,2)),/缺少后续场景/);
 const source={filmId:film.id,workspaceId:crypto.randomUUID(),settings:{speed:'normal',density:'balanced',voice:'vivi'},start:0,end:film.duration};
 const context=await assistantContext(source),first=context.film.scenes[0];
 let job=await beginAssistantRun({source,sourceVersion:context.sourceVersion,requestId:crypto.randomUUID(),sceneId:first.id,scope:'current',patches:[{field:'narration_gain_db',value:3}]});
 const deadline=Date.now()+30000;while(job.status==='running'){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,50));job=assistantJob(job.projectId,job.id);}assert.equal(job.status,'complete',job.message);
 const p=getProject(job.projectId),dir=projectDir(p.id),baseline=await pcm(path.join(dir,'catalog-original.wav'),first.end,'baseline');
 await acceptAssistant(p.id,{jobId:job.id,sceneId:first.id});
 const good=p.workflow.current,goodFile=path.join(dir,decodeURIComponent(good.result.narrationUrl.split('/').at(-1)));
 assert.equal(good.result.cues.length,expected.length);equalAudio(baseline,await pcm(goodFile,first.end,'accepted'));
 const originalBytes=await readFile(goodFile),acceptedFirst=await pcm(goodFile,0,'accepted-all');
 // Reproduce legacy projects: full-duration audio metadata, but cues only in the first scene.
 good.result.cues=good.result.cues.filter(c=>c.start<first.end);await save(p);
 const repaired=await assistantContext({projectId:p.id});assert.notEqual(repaired.sourceVersion,good.id);assert.equal(p.workflow.current.result.cues.length,expected.length);
 const repairedFile=path.join(dir,decodeURIComponent(repaired.originalNarrationUrl.split('/').at(-1)));
 equalAudio(baseline,await pcm(repairedFile,first.end,'repaired'));equalAudio(acceptedFirst,await pcm(repairedFile,0,'repaired-all'));
 assert.deepEqual(await readFile(goodFile),originalBytes);assert.ok(p.workflow.history.some(v=>v.id===good.id));
 assert.equal((await assistantContext({projectId:p.id})).sourceVersion,repaired.sourceVersion,'repair is idempotent');
});
