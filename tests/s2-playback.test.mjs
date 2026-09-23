import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFilm} from '../public/catalog-config.js';
import {newTask,confirmStage,canComplete,migrateTaskToScenes} from '../public/flow.js';
import {MEDIA_PLANS,stageFilm,stageRange,stageVideo,assembledMediaReady,finalMediaReady,matchingVersion} from '../public/stage-media.js';
import {scenePreviewCount,sceneScopeLabel} from '../public/scene-plan.js';
import {makeContext} from '../public/assistant/context.js';
test('S2B is the second scene; S1 playback, identities and accepted revisions are preserved',()=>{
 const task=newTask(defaultFilm);confirmStage(task);assert.equal(stageRange(defaultFilm,task).duration,10.2);confirmStage(task);
 assert.equal(stageRange(defaultFilm,task).duration,39.079);confirmStage(task);
 const saved=migrateTaskToScenes(JSON.parse(JSON.stringify(task)),defaultFilm),film=stageFilm(defaultFilm,saved);
 assert.equal(saved.sceneCount,2);assert.equal(saved.totalScenes,2);assert.equal(scenePreviewCount(saved),1);
 assert.equal(film.scenes[0].id,'scene-s2');assert.equal(film.duration,137.927007);assert.equal(film.audioMode,'mixed-narration');
 assert.equal(sceneScopeLabel(film,1),'第 2 个场景');assert.equal(defaultFilm.scenes[0].id,'scene-s1');assert.equal(defaultFilm.duration,39.079);
 const store={mediaVersions:{[task.id]:{s1:{id:'s1-b',video:'assets/real-s1-b.mp4'}}}};
 assert.equal(stageVideo(film,saved,store),'assets/NZ2_S2B_9e05b035.mp4');
 assert.equal(store.mediaVersions[task.id].s1.video,'assets/real-s1-b.mp4');
 assert(!stageVideo(film,saved,store).includes('S2A'));assert.throws(()=>matchingVersion(film,'medium',{}),/第二场景/);
});
test('known pending wording is excluded from factual assistant recall; character names belong to this film',()=>{
 const film=stageFilm(defaultFilm,{mediaScene:'s2'}),ctx=makeContext(film,'scene-s2',90,'task');
 assert.equal(ctx.number,2);assert.deepEqual(ctx.registry.map(c=>c.visualName),['哪吒','太乙真人']);
 assert(!ctx.facts.some(f=>f.text.includes('变成了敖丙')));assert(!ctx.cues.some(c=>c.start===85.5));
 assert(!film.narration['normal-balanced'].some(c=>c.reviewStatus==='pending'));assert(ctx.cues.some(c=>c.text.includes('双眼变成蓝色')));
});
test('final output requires adopted S1B and the approved S2B, with each scene only once',t=>{
 const p=MEDIA_PLANS[defaultFilm.id],before=structuredClone(p);t.after(()=>Object.assign(p,before));
 p.second.contentApproved=false;
 p.revised={id:'s1-b',video:'assets/s1-b.mp4',duration:39.079};
 p.extension={baseS1Id:'s1-b',baseS2Id:p.second.id,initial:{id:'final',video:'assets/s1b-s2b.mp4',duration:177.006007},scenes:[defaultFilm.scenes[0],{id:'scene-s2',title:'山间练习',start:39.079,end:177.006007}],narration:{'normal-balanced':[]}};
 assert.equal(finalMediaReady(defaultFilm,'s1-b'),false);
 p.second.contentApproved=true;assert.equal(finalMediaReady(defaultFilm,'s1-b'),true);
 assert.equal(finalMediaReady(defaultFilm,'s1-a'),false);assert.equal(finalMediaReady(defaultFilm,undefined),false);
 p.extension.baseS2Id=p.second.backup.id;assert.equal(finalMediaReady(defaultFilm,'s1-b'),false);
});
test('a confirmed second scene opens the existing assembled film without an S1B adoption',()=>{
 const task=newTask(defaultFilm);
 confirmStage(task);confirmStage(task);confirmStage(task);
 assert.equal(task.mediaScene,'s2');assert.equal(task.acceptedS1Id,undefined);
 assert.equal(assembledMediaReady(defaultFilm),true);
 assert.equal(confirmStage(task),'full');assert.equal(canComplete(task),true);
 task.mediaExtended=true;
 const film=stageFilm(defaultFilm,task);
 assert.equal(film.scenes.length,2);
 assert.equal(stageVideo(film,task,{}),'assets/NZ2_full_86f34f49.mp4');
});
test('replacing S2B delivery changes resumed playback URL and duration through one mapping',t=>{
 const p=MEDIA_PLANS[defaultFilm.id],before=structuredClone(p.second);t.after(()=>{p.second=before;});
 const task={id:'saved',mediaScene:'s2',stage:'medium',sceneCount:2,totalScenes:2};
 p.second={...p.second,id:'s2-b-corrected',video:'assets/s2-b-corrected.mp4',duration:138};
 const film=stageFilm(defaultFilm,task);assert.equal(film.scenes[0].end,138);assert.equal(stageRange(film,task,1).duration,138);
 assert.equal(stageVideo(film,task,{}),'assets/s2-b-corrected.mp4');
});
