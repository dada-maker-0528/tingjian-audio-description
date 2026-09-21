import test from 'node:test';import assert from 'node:assert/strict';
import {sceneRange,validateScenePlan,isSceneRange} from '../public/scene-plan.js';
import {sceneFilm} from './fixtures/scene-film.mjs';
test('one, three and four scenes end at complete scene boundaries in original order',()=>{
 assert.equal(sceneRange(sceneFilm,1).duration,12.4);
 assert.equal(sceneRange(sceneFilm,3).duration,98.2);
 assert.deepEqual(sceneRange(sceneFilm,4).sceneIds,['a','b','c','d']);
 assert.equal(sceneRange(sceneFilm,4).duration,143.6);
 assert.equal(sceneRange(sceneFilm,5).duration,180);
});
test('fixed-length or partial-scene clips are not accepted as scene previews',()=>{
 assert.equal(isSceneRange(sceneFilm,0,7),false);assert.equal(isSceneRange(sceneFilm,0,45),false);assert.equal(isSceneRange(sceneFilm,13,45),false);
 assert.equal(isSceneRange(sceneFilm,0,98.2),true);assert.throws(()=>sceneRange(sceneFilm,6));
});
test('gaps, overlaps and missing endings are rejected before publishing a scene plan',()=>{
 const gap=structuredClone(sceneFilm);gap.scenes[1].start=13;assert.throws(()=>validateScenePlan(gap));
 const overlap=structuredClone(sceneFilm);overlap.scenes[1].start=11;assert.throws(()=>validateScenePlan(overlap));
 const ending=structuredClone(sceneFilm);ending.scenes.pop();assert.throws(()=>validateScenePlan(ending));
});
