import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSource,MEDIA_PLANS,stageRange,matchingVersion,stageVideo,extensionReady,stageFilm} from '../public/stage-media.js';
import {newTask,confirmStage,migrateTaskToScenes} from '../public/flow.js';
import {defaultFilm,films} from '../public/catalog-config.js';
test('title and changing video URLs resolve without fixed episode matching',()=>{
 for(const input of ['哪吒','哪吒魔童闹海','《哪吒之魔童闹海》','https://www.bilibili.com/bangumi/play/ep999?from=test','https://b23.tv/newlink','分享 https://example.com/video/changed'])assert.equal(resolveSource(input).filmId,defaultFilm.id);
 for(const input of ['','随便','javascript:alert(1)','https://'])assert.throws(()=>resolveSource(input));
});
test('excerpt stays within S1, then advances through S2 to the existing full film',()=>{
 const t=newTask(defaultFilm);assert.equal(confirmStage(t),'short');assert.equal(stageRange(defaultFilm,t).duration,10.2);assert.equal(t.totalScenes,1);
 assert.equal(confirmStage(t),'medium');assert.equal(stageRange(defaultFilm,t).duration,39.079);assert.equal(t.confirmedSceneCount,0);
 assert.equal(confirmStage(t),'medium');assert.equal(t.mediaScene,'s2');assert.equal(t.totalScenes,2);assert.equal(t.confirmedSceneCount,1);
 assert.equal(confirmStage(t),'full');assert.equal(t.stage,'full');
 const old=newTask(films[0]);confirmStage(old);confirmStage(old);assert.equal(old.sceneCount,3);
});
test('a saved S1 draft does not count its opening excerpt as a confirmed scene',()=>{
 const task=newTask(defaultFilm);confirmStage(task);confirmStage(task);
 const oldDraft={...task,confirmedSceneCount:1};
 assert.equal(migrateTaskToScenes(oldDraft,defaultFilm).confirmedSceneCount,0);
});
test('accepted video is scoped to its owner and short preview remains stable',()=>{
 const store={mediaVersions:{one:{s1:{video:'assets/distinct-b.mp4'}}}};
 assert.equal(stageVideo(defaultFilm,{id:'one',stage:'medium'},store),'assets/distinct-b.mp4');
 assert.equal(stageVideo(defaultFilm,{id:'two',stage:'medium'},store),defaultFilm.video);
 assert.equal(stageVideo(defaultFilm,{id:'one',stage:'short'},store),defaultFilm.video);
 assert.equal(stageVideo(defaultFilm,{id:'one',stage:'medium'},store,{original:true}),defaultFilm.video);
});
test('revision cannot satisfy unsupported requests, and extension must preserve accepted S1',t=>{
 const plan=MEDIA_PLANS[defaultFilm.id],prior=structuredClone(plan);t.after(()=>Object.assign(plan,prior));
 const request={targets:[{sceneId:'scene-s1',changes:[{field:'action_detail',value:'细节'}]}]};
 plan.revised=null;assert.throws(()=>matchingVersion(defaultFilm,'medium',request),/尚未就绪/);
 plan.revised={id:'s1-b',video:'assets/test-distinct-b.mp4',duration:39.079,effects:[{field:'action_detail',value:'细节'}]};
 assert.equal(matchingVersion(defaultFilm,'medium',request).slot,'s1');
 assert.throws(()=>matchingVersion(defaultFilm,'short',request),/完整场景/);
 assert.throws(()=>matchingVersion(defaultFilm,'medium',{targets:[{sceneId:'scene-s1',changes:[{field:'speech_rate',value:1.15}]}]}),/不包含/);
 plan.extension={baseS1Id:'s1-b',initial:{id:'full-a',video:'assets/full-a.mp4',duration:78.158},scenes:[...defaultFilm.scenes,{id:'scene-s2',title:'新场景',start:39.079,end:78.158}],narration:{'normal-balanced':[]}};
 assert.equal(extensionReady(defaultFilm,'s1-b'),true);assert.equal(extensionReady(defaultFilm,'s1-a'),false);
 const film=stageFilm(defaultFilm,{mediaExtended:true});assert.equal(film.scenes.length,2);assert.equal(film.duration,78.158);assert.equal(film.scenes[0].id,'scene-s1');assert.equal(defaultFilm.scenes.length,1);
 plan.extension.scenes[1].start=0;assert.equal(extensionReady(defaultFilm,'s1-b'),false);
});
