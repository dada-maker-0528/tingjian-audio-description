import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,newTask,confirmStage,proposeFeedback,applyFeedback,newFullRevision,markFullRevisionReady,acceptFullRevision,changeNarrationVoice} from '../public/flow.js';
import {sceneFilm} from './fixtures/scene-film.mjs';
const film={...sceneFilm,id:'film-a',title:'第一部'};
test('feedback remains a proposal until confirmed and scene changes require renewed confirmation',()=>{
 const task=newTask(film);confirmStage(task);confirmStage(task);const before=structuredClone(task);
 const proposal=proposeFeedback(task.candidate,'旁白慢一点');assert(proposal.ok);assert.equal(proposal.settings.speed,'slow');assert.deepEqual(task,before);
 assert(applyFeedback(task,'旁白慢一点').ok);assert.equal(task.candidate.speed,'slow');assert.equal(task.confirmedSceneCount,0);assert.equal(confirmStage(task),'full');assert.equal(task.confirmedSceneCount,3);
});
test('full video regeneration creates a separate version without changing the original or another draft',()=>{
 const original={id:'saved-original',assetId:film.id,title:film.title,version:2,settings:defaults(),position:84};
 const before=structuredClone(original),draft=newTask({...sceneFilm,id:'film-b',title:'第二部'}),draftBefore=structuredClone(draft);
 const proposal=proposeFeedback(original.settings,'描述少一点');const revision=newFullRevision(original,film,proposal.settings);
 assert.notEqual(revision.id,original.id);assert.equal(revision.sourceId,original.id);assert.equal(revision.version,3);assert.equal(revision.candidate.density,'concise');
 assert.equal(revision.completed,false);assert.equal(revision.renderedVersion,null);assert.deepEqual(original,before);assert.deepEqual(draft,draftBefore);
 assert.throws(()=>newFullRevision(original,{id:'film-b'},proposal.settings));
});
test('an incomplete, failed or stale full render cannot be saved as ready',()=>{
 const source={id:'original',assetId:film.id,title:film.title,settings:defaults()};
 const revision=newFullRevision(source,film,{...defaults(),speed:'slow'});
 assert.throws(()=>acceptFullRevision(revision));assert.equal(markFullRevisionReady(revision,revision.version-1),false);
 assert.throws(()=>acceptFullRevision(revision));assert(markFullRevisionReady(revision,revision.version));
 const saved=acceptFullRevision(revision);assert.equal(saved.settings.speed,'slow');assert.equal(saved.settings.version,revision.version);assert.equal(saved.sourceId,source.id);
 assert.throws(()=>acceptFullRevision(revision));
});
test('another edit or voice change invalidates full readiness and keeps the same working revision',()=>{
 const original={id:'original',assetId:film.id,title:film.title,settings:defaults()};
 const first=newFullRevision(original,film,{...defaults(),speed:'slow'});markFullRevisionReady(first,first.version);
 const next=newFullRevision(first,film,{...first.candidate,density:'concise'});
 assert.equal(next.id,first.id);assert.equal(next.sourceId,original.id);assert.equal(next.version,first.version+1);assert.equal(next.renderedVersion,null);
 assert.equal(next.sourceSnapshot.settings.speed,'normal');assert.equal(first.renderedVersion,first.version);
 markFullRevisionReady(next,next.version);changeNarrationVoice(next,'yunzhou');assert.equal(next.renderedVersion,null);assert.throws(()=>acceptFullRevision(next));
});
