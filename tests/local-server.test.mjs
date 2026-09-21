import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-http-'));
process.env.AIMEDIA_API_KEY='';process.env.OPENAI_API_KEY='';
const {createLocalServer}=await import('../server/local.mjs');
const {save,projectDir}=await import('../backend/store.mjs');
const {newWorkflow}=await import('../backend/workflow-state.mjs');
test('local service protects mutations and private paths; range seeking is correct',async()=>{
  const id='private-film',dir=projectDir(id);await mkdir(dir,{recursive:true});
  const source=path.join(dir,'source.mp4');await writeFile(source,'0123456789');
  await writeFile(path.join(dir,'feedback-recording.webm'),'private recording');
  const p={id,title:'测试影片',source,duration:10,workflow:newWorkflow(),scenes:[],versions:[]};await save(p);
  const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(url+'/api/capabilities')).status,200);
    assert.equal((await fetch(url+'/api/bootstrap',{headers:{Origin:'https://unrelated.example'}})).status,403);
    assert.equal((await fetch(url+`/api/projects/${id}/listen-action`,{method:'POST',body:'{}'})).status,403);
    const range=await fetch(url+`/media/${id}/source.mp4`,{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(await range.text(),'2345');
    assert.equal((await fetch(url+`/media/${id}/source.mp4`,{headers:{Range:'bytes=20-30'}})).status,416);
    assert.equal((await fetch(url+`/media/${id}/feedback-recording.webm`)).status,403);
    assert.equal((await fetch(url+`/media/${id}/project.json`)).status,403);
    assert.equal((await fetch(url+'/backend/ai.mjs')).status,404);
    assert.equal((await fetch(url+'/.env')).status,404);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('upload without model configuration preserves a real task and reports failure instead of demo success',async()=>{
  const {run,ffmpeg}=await import('../backend/media.mjs');
  const {readFile}=await import('node:fs/promises');
  const file=path.join(process.env.AIMEDIA_DATA_DIR,'upload-fixture.mp4');
  await run(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=160x90:r=8:d=2','-c:v','libx264','-pix_fmt','yuv420p','-y',file]);
  const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  try{
    const body=await readFile(file),headers={'X-Tingjian-Request':'1','X-Filename':'own-video.mp4','X-Request-Id':'upload-once'};
    const uploaded=await(await fetch(url+'/api/upload',{method:'POST',headers,body})).json();assert.equal(uploaded.ok,true);
    let task;for(let i=0;i<50;i++){task=(await(await fetch(url+`/api/projects/${uploaded.data.id}`)).json()).data;if(task.workflow.status==='error')break;await new Promise(r=>setTimeout(r,20));}
    assert.equal(task.workflow.status,'error');assert.match(task.workflow.message,/服务|配置/);assert.equal(task.workflow.current,null);assert.equal(task.provenance,'uploaded');
    const duplicate=await(await fetch(url+'/api/upload',{method:'POST',headers,body})).json();assert.equal(duplicate.data.id,task.id);
    assert.equal((await fetch(url+task.sourceUrl)).status,200);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
