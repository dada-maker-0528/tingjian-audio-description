import test from 'node:test';import assert from 'node:assert/strict';
import {newTask,confirmStage,canComplete,applyFeedback,changeNarrationVoice,migrateTaskToScenes} from '../public/flow.js';
import {sceneFilm} from './fixtures/scene-film.mjs';
test('review grows from one full scene to three, optionally four, then the whole film',()=>{
 const task=newTask(sceneFilm);assert.equal(confirmStage(task),'short');assert.equal(task.sceneCount,1);
 assert.equal(confirmStage(task),'medium');assert.equal(task.sceneCount,3);assert.equal(task.confirmedSceneCount,1);
 assert.equal(confirmStage(task,'next'),'medium');assert.equal(task.sceneCount,4);assert.equal(task.confirmedSceneCount,3);assert.equal(canComplete(task),false);
 assert.equal(confirmStage(task),'full');assert.equal(canComplete(task),true);assert.equal(task.confirmedSceneCount,4);
});
test('confirmed three scenes can go directly to the whole film',()=>{
 const task=newTask(sceneFilm);confirmStage(task);confirmStage(task);assert.equal(confirmStage(task),'full');assert(canComplete(task));
});
test('editing a scene batch regenerates that batch and requires renewed confirmation',()=>{
 const task=newTask(sceneFilm);confirmStage(task);confirmStage(task);confirmStage(task,'next');
 const count=task.sceneCount;assert(applyFeedback(task,'旁白慢一点').ok);assert.equal(task.sceneCount,count);assert.equal(task.confirmedSceneCount,0);assert.equal(canComplete(task),false);
 confirmStage(task);assert(canComplete(task));
});
test('small films do not invent additional scenes',()=>{
 const one={...sceneFilm,duration:12.4,scenes:sceneFilm.scenes.slice(0,1)};
 const task=newTask(one);confirmStage(task);assert.equal(confirmStage(task),'full');assert(canComplete(task));
 const two={...sceneFilm,duration:58.8,scenes:sceneFilm.scenes.slice(0,2)};
 const other=newTask(two);confirmStage(other);confirmStage(other);assert.equal(other.sceneCount,2);confirmStage(other);assert(canComplete(other));
});
test('old timed drafts retain preferences but must review the new scene boundaries',()=>{
 const old={id:'old',assetId:sceneFilm.id,stage:'verify',version:5,candidate:{speed:'slow',gain:1,density:'concise',voice:'vivi'},confirmed:{version:5},completed:false,chat:[]};
 const next=migrateTaskToScenes(old,sceneFilm);assert.equal(next.stage,'short');assert.equal(next.sceneCount,1);assert.equal(next.confirmed,null);assert.equal(next.candidate.speed,'slow');assert.equal(old.stage,'verify');
 assert.deepEqual(migrateTaskToScenes(next,sceneFilm),next);
 const complete={...old,completed:true,stage:'complete'};assert.equal(migrateTaskToScenes(complete,sceneFilm),complete);
});
