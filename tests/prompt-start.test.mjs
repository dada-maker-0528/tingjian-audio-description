import test from 'node:test';
import assert from 'node:assert/strict';
import {trimPromptStart} from '../public/speech-service.js';
import {pcmToWav} from '../server/volc-protocol.mjs';
test('prompt silence trim retains a protective lead-in and all speech samples',async()=>{
 const pcm=new Uint8Array(48000),view=new DataView(pcm.buffer);
 for(let i=4800;i<24000;i++)view.setInt16(i*2,8000,true);
 const raw=new Blob([pcmToWav(pcm)],{type:'audio/wav'}),result=await trimPromptStart(raw),bytes=await result.arrayBuffer(),audio=new DataView(bytes);
 assert.equal(bytes.byteLength,raw.size-3840*2); // 200ms silence minus 40ms retained
 assert.equal(audio.getUint32(40,true),bytes.byteLength-44);
 assert.equal(audio.getInt16(44+959*2,true),0);assert.equal(audio.getInt16(44+960*2,true),8000);
 assert.equal(audio.getInt16(bytes.byteLength-2,true),8000);
 const silence=new Blob([pcmToWav(new Uint8Array(4800))],{type:'audio/wav'});assert.equal(await trimPromptStart(silence),silence);
});
