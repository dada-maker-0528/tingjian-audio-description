import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocketServer} from 'ws';
import {nodeUpgrade} from '../server/node-speech.mjs';
import {openSpeech} from '../server/volc-client.mjs';
import {decodeMessage,encodeEvent} from '../server/volc-protocol.mjs';
function event(type,id='',payload=Buffer.from('{}'),audio=false){
  const nums=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
  const session=Buffer.from(id);return Buffer.concat([Buffer.from(audio?[0x11,0xb4,0,0]:[0x11,0x94,0x10,0]),nums(type),nums(session.length),session,nums(payload.length),payload]);
}
test('Node WebSocket transport shares protocol, handles sessions and returns audio bytes',async()=>{
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise(r=>server.once('listening',r));const seen=[];
  server.on('connection',socket=>socket.on('message',raw=>{
    const frame=decodeMessage(raw);seen.push(frame.event);
    if(frame.event===1)socket.send(event(50,'connection'));
    if(frame.event===100)socket.send(event(150,frame.sessionId));
    if(frame.event===200){const b=JSON.parse(Buffer.from(frame.payload));assert.equal(b.req_params.audio_params.speech_rate,-20);socket.send(event(352,frame.sessionId,Buffer.alloc(4800),true));}
    if(frame.event===102)socket.send(event(152,frame.sessionId));
  }));
  let connection;
  try{connection=await openSpeech({VOLC_TTS_KEY:'test-placeholder'},AbortSignal.timeout(5000),(_,args)=>nodeUpgrade(`http://127.0.0.1:${server.address().port}`,args));assert.equal((await connection.synthesize('测试。','slow')).length,4800);assert.deepEqual(seen.slice(0,4),[1,100,200,102]);}
  finally{connection?.close();for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));}
});
test('Node WebSocket handshake fails safely without reflecting credentials',async()=>{
  const controller=new AbortController();controller.abort();await assert.rejects(()=>nodeUpgrade('ws://127.0.0.1:1',{headers:{'X-Api-Key':'test-secret'},signal:controller.signal}),e=>!e.message.includes('test-secret'));
});
