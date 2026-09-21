import test from 'node:test';
import assert from 'node:assert/strict';
import {GuideSequence,roleTourSteps,roleKeyAction,pageGuide,briefPageGuide,roleChoices} from '../public/page-guidance.js';
import {rateForGuide} from '../public/prompt-speech.js';
import {sceneFilm} from './fixtures/scene-film.mjs';
const film={...sceneFilm,roles:[{name:'甲',detail:'第一人的特征'},{name:'乙',detail:'第二人的特征'},{name:'丙',detail:'第三人的特征'}]};

test('character tour introduces the count, each person, then offers valid replay and continuation choices',()=>{
 const steps=roleTourSteps(film);
 assert.deepEqual(steps.map(s=>s.key),['roles','role-0','role-1','role-2','roles-end']);
 assert.match(steps[0].text,/第二步.*三位人物/);
 assert.match(steps[1].text,/第一位，甲/);assert.match(steps[2].text,/第二位，乙/);assert.match(steps[3].text,/第三位，丙/);
 assert.match(steps[4].text,/数字 1 至 3/);
 assert.doesNotMatch(steps[4].text,/数字 4/);assert.match(steps[4].text,/空格继续/);
 assert.deepEqual(steps.map(s=>rateForGuide(s.key,{guide:2,role:4})),[2,4,4,4,2]);
});
test('automatic page introductions are short; full instructions stay available on request',()=>{
 for(const key of ['home','library','upload','short','medium','complete','watch','full-review']){
  const brief=briefPageGuide(key,{film,task:{stage:'medium',sceneCount:3},libraryCount:4});
  assert(brief.length>0&&brief.length<=45,key);assert.doesNotMatch(brief,/Shift|Tab|O 开始|确认执行和|保持展开/);
 }
 for(const key of ['analyzing','generating','full'])assert.equal(briefPageGuide(key,{film}),'');
 assert.match(pageGuide('watch',{film}),/Tab/);
 assert(roleChoices(film.roles).length<55);
});
test('single replay reads only the requested person then reoffers next actions',()=>{
 assert.deepEqual(roleTourSteps(film,{index:1}).map(s=>s.key),['role-1','roles-end']);
 assert.doesNotMatch(roleChoices(film.roles,{shortcuts:false}),/数字/);
 assert.doesNotMatch(roleChoices(film.roles,{review:true}),/进入第三步/);
});
test('character sequence waits for actual speech completion and stops after cancellation',async()=>{
 const sequence=new GuideSequence(),spoken=[];let finish;
 const pending=sequence.play(roleTourSteps(film),step=>{spoken.push(step.key);return new Promise(resolve=>finish=resolve);});
 assert.deepEqual(spoken,['roles']);sequence.cancel();finish(true);
 assert.equal(await pending,false);assert.deepEqual(spoken,['roles']);
 assert.equal(await sequence.play(roleTourSteps(film,{index:2}),async step=>{spoken.push(step.key);return true;}),true);
 assert.deepEqual(spoken,['roles','role-2','roles-end']);
});
test('failed or stale speech never proceeds to a later character or the closing question',async()=>{
 const sequence=new GuideSequence(),spoken=[];
 const result=await sequence.play(roleTourSteps(film),async step=>{spoken.push(step.key);return step.key!=='role-0';});
 assert.equal(result,false);assert.deepEqual(spoken,['roles','role-0']);
});
test('character-page shortcuts continue with Space, replay by number, and protect editable fields and other pages',()=>{
 const context={active:true,count:3};
 assert.deepEqual(roleKeyAction({code:'Space'},context),{action:'continue'});
 assert.deepEqual(roleKeyAction({key:'2'},context),{action:'role',index:1});
 assert.equal(roleKeyAction({key:'4'},context),null);
 assert.equal(roleKeyAction({key:'2'},{...context,shortcuts:false}),null);
 assert.equal(roleKeyAction({code:'Space'},{...context,editable:true}),null);
 assert.equal(roleKeyAction({code:'Space'},{active:false}),null);
 assert.deepEqual(roleKeyAction({code:'Space'},{...context,review:true}),{action:'return'});
 assert.equal(roleKeyAction({key:'Tab',shiftKey:true},context),null);
});
test('each workflow screen provides its current stage and usable actions',()=>{
 for(const [key,stage] of [['upload','第一步'],['analyzing','第一步'],['roles','第二步'],['short','第三步'],['medium','第四步'],['full','第五步'],['complete','第五步']]){
  assert.ok(pageGuide(key,{film}).includes(stage),key);
 }
 assert.match(pageGuide('generating',{film,task:{stage:'short'}}),/第三步/);
 assert.match(pageGuide('home',{film,filmCount:2,libraryCount:4}),/首页.*2 部.*4 个/);
});
test('scene guidance names the complete scope and offers either one more scene or the whole film',()=>{
 const text=pageGuide('medium',{film,task:{stage:'medium',sceneCount:3}});
 assert.match(text,/前 3 个完整场景/);assert.match(text,/街道、办公室、车厢/);assert.match(text,/扩展到 4 个场景/);assert.match(text,/全部 5 个场景/);
 assert.doesNotMatch(text,/七秒|四十五|复验/);
});
