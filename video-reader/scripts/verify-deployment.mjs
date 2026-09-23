import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const origin=new URL(process.argv[2]);
if(!['https:','http:'].includes(origin.protocol))throw new Error('Supply an HTTP(S) deployment URL');
const results=[];
async function request(file,options={}){
 const started=Date.now();
 const response=await fetch(new URL(file,origin),{...options,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);
 results.push({path:file,status:response.status,ms:Date.now()-started});
 return response;
}
for(const [file,expected] of [['/','听见 · 视频读屏'],['/portrait.html','听见 · 手机短视频读屏']]){
 const response=await request(file);assert.match(response.headers.get('content-type')||'',/text\/html/);
 assert((await response.text()).includes(expected),`${file}: incorrect page`);
}
for(const [file,expected] of [['/app.js',/javascript/],['/style.css',/text\/css/]]){
 const response=await request(file);assert.match(response.headers.get('content-type')||'',expected);await response.arrayBuffer();
}
const manifest=await (await request('/assets/doubao-vivi/manifest.json')).json();
assert.equal(manifest.provider,'volcengine');assert.equal(manifest.records.length,7);
for(const item of manifest.records){
 const response=await request('/assets/doubao-vivi/'+item.file);
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(bytes.subarray(0,4).toString(),'RIFF');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
}
const head=await request('/assets/video.mp4',{method:'HEAD'});
assert.match(head.headers.get('content-type')||'',/video\/mp4/);
const video=await request('/assets/video.mp4',{headers:{Range:'bytes=0-1023'}});
assert.equal(video.status,206);
const range=/^bytes 0-1023\/(\d+)$/.exec(video.headers.get('content-range')||'');
assert(range,'Video must support a real byte-range response');
const size=Number(range[1]);assert(size>1000000);
const declaredSize=head.headers.get('content-length');
if(declaredSize!==null)assert.equal(Number(declaredSize),size);
assert.equal((await video.arrayBuffer()).byteLength,1024);
console.log(JSON.stringify({origin:origin.origin,passed:true,videoBytes:size,checks:results},null,2));
