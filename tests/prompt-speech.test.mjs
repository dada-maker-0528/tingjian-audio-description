import test from 'node:test';
import assert from 'node:assert/strict';
import {promptRate,promptText,promptUtterance,applyPromptAudioRate} from '../public/prompt-speech.js';

test('repeat-listening prompts avoid the ambiguous character without changing other words',()=>{
 assert.equal(promptText('重听角色，重听提示。这是重要内容。'),'再听角色，再听提示。这是重要内容。');
});
test('prompt speeds accept 3–5 times and recover safely from old or invalid preferences',()=>{
 for(const value of [1,1.5,3,4,5])assert.equal(promptRate(value),value);
 for(const value of [undefined,'bad',0,8,Infinity])assert.equal(promptRate(value),1);
});
test('both local speech and prompt audio use the chosen speed',()=>{
 const old=globalThis.SpeechSynthesisUtterance;
 globalThis.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
 try{
  for(const rate of [3,5]){
   const spoken=promptUtterance('重听提示',rate);
   assert.equal(spoken.text,'再听提示');assert.equal(spoken.rate,rate);
   const audio={};applyPromptAudioRate(audio,rate);
   assert.equal(audio.playbackRate,spoken.rate);assert.equal(audio.defaultPlaybackRate,rate);assert.equal(audio.preservesPitch,true);
  }
 }finally{if(old===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=old;}
});
