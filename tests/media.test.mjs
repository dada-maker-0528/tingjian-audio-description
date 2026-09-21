import test from 'node:test';import assert from 'node:assert/strict';
import {serveDemoVideo} from '../server/media.mjs';
const assets={fetch:async()=>new Response(new Uint8Array([0,1,2,3,4,5,6,7,8,9]))};
test('returns real partial content when asset storage does not support seeking',async()=>{const r=await serveDemoVideo(new Request('https://demo.test/api/media/rain-before.mp4',{headers:{Range:'bytes=3-5'}}),assets);assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 3-5/10');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[3,4,5]);});
test('rejects out-of-bounds ranges instead of serving another time segment',async()=>{const r=await serveDemoVideo(new Request('https://demo.test/api/media/rain-before.mp4',{headers:{Range:'bytes=100-200'}}),assets);assert.equal(r.status,416);});
