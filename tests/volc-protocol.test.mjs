import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEvent,decodeMessage} from '../server/volc-protocol.mjs';
test('matches the supplied Python protocol StartConnection frame',()=>{
 assert.deepEqual([...encodeEvent(1,{})],[0x11,0x14,0x10,0,0,0,0,1,0,0,0,2,123,125]);
});
test('session and UTF-8 text survive framed binary transport',()=>{
 const frame=encodeEvent(200,{req_params:{text:'雨停了。'}},'session-1');
 const message=decodeMessage(frame);
 assert.equal(message.event,200);assert.equal(message.sessionId,'session-1');
 assert.equal(JSON.parse(new TextDecoder().decode(message.payload)).req_params.text,'雨停了。');
});
test('truncated or incompatible messages are rejected',()=>{
 assert.throws(()=>decodeMessage(new Uint8Array([0x11,0x94])),/short|truncated/i);
 const frame=encodeEvent(1,{});assert.throws(()=>decodeMessage(frame.slice(0,-1)),/truncated/i);
});
