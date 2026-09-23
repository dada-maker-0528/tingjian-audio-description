import test from 'node:test';
import assert from 'node:assert/strict';
import {pictureRect,findVideoRegion} from '../src/video-region.mjs';
test('selection follows the actual picture, excluding player letterboxing',()=>{
 assert.deepEqual(pictureRect({left:10,top:20,width:800,height:600},1600,900),{left:10,top:95,width:800,height:450});
 assert.deepEqual(pictureRect({left:0,top:0,width:800,height:450},900,1600),{left:273.4375,top:0,width:253.125,height:450});
});
test('main visible video wins over a thumbnail or a hidden/offscreen player',()=>{
 const c=(id,bounds,visible=true)=>({id,bounds,width:1600,height:900,visible});
 const candidates=[c('hidden',{left:0,top:0,width:1400,height:900},false),c('offscreen',{left:2000,top:0,width:1400,height:900}),c('thumbnail',{left:0,top:0,width:160,height:90}),c('main',{left:100,top:60,width:960,height:540})];
 assert.equal(findVideoRegion(candidates,{width:1280,height:720}).candidate.id,'main');
});
test('metadata not ready yields no invented recognition rectangle',()=>{assert.equal(pictureRect({left:0,top:0,width:800,height:600},0,0),null);assert.equal(findVideoRegion([],{width:1280,height:720}),null);});
test('resize recomputes position instead of retaining stale frame coordinates',()=>{const a=pictureRect({left:30,top:20,width:960,height:540},1600,900),b=pictureRect({left:10,top:40,width:640,height:540},1600,900);assert.notEqual(a.width,b.width);assert.equal(b.top,130);assert.equal(b.height,360);});
test('portrait cover framing locks the visible cropped area rather than a letterboxed landscape',()=>{
 const bounds={left:440,top:20,width:337.5,height:600};
 assert.deepEqual(pictureRect(bounds,960,540,'cover'),bounds);
 const match=findVideoRegion([{bounds,width:960,height:540,fit:'cover'}],{width:1280,height:720});
 assert.equal(match.rect.height,600);assert.equal(match.rect.width,337.5);
});
