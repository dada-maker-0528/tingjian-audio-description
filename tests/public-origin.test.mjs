import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLocalServer} from '../server/local.mjs';
test('HTTPS reverse proxy allows only the configured host and same origin',async()=>{
 process.env.TINGJIAN_PUBLIC_ORIGIN='https://tingjian.example';const server=createLocalServer();delete process.env.TINGJIAN_PUBLIC_ORIGIN;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const status=(route,headers)=>new Promise((resolve,reject)=>{http.get(base+route,{headers},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
 try{
  assert.equal(await status('/healthz',{Host:'tingjian.example',Origin:'https://tingjian.example'}),200);
  assert.equal(await status('/api/bootstrap',{Host:'unrelated.example'}),403);
  assert.equal(await status('/api/bootstrap',{Host:'tingjian.example',Origin:'http://tingjian.example'}),403);
  assert.equal(await status('/api/bootstrap',{Host:'tingjian.example',Origin:'https://unrelated.example'}),403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
