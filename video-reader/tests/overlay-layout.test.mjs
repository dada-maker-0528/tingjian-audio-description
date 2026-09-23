import test from 'node:test';
import assert from 'node:assert/strict';
import {overlayLayout} from '../src/overlay-layout.mjs';
test('phone overlays use screen-local coordinates, not desktop coordinates',()=>{
 const screen={left:245,top:42,width:330,height:665},video={left:245,top:66,width:330,height:587};
 const r=overlayLayout(video,screen,{width:1280,height:720});
 assert.deepEqual(r.frame,{left:0,top:24,width:330,height:587});
 assert(r.frame.top+r.frame.height<=screen.height);assert(r.captionWidth<=screen.width);assert(r.chipTop<screen.height);
});
test('whole-screen search stays inside the phone, including after resize',()=>{
 for(const screen of [{left:245,top:42,width:330,height:665},{left:20,top:18,width:280,height:576}]){
  const r=overlayLayout(null,screen,{width:1280,height:720},true).frame;
  assert(r.left>=0&&r.top>=0);assert(r.left+r.width<=screen.width);assert(r.top+r.height<=screen.height);
 }
});
test('desktop overlays retain page coordinates',()=>{assert.deepEqual(overlayLayout({left:100,top:26,width:1070,height:602},null,{width:1280,height:720}).frame,{left:100,top:26,width:1070,height:602});});
