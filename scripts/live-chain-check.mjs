// Explicit release acceptance: calls real configured providers on a clip from the built-in film.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('.test-artifacts/live-release');await mkdir(out,{recursive:true});
const nativeFetch=globalThis.fetch;let responseIndex=0;
globalThis.fetch=async(url,options)=>{const r=await nativeFetch(url,options);if(String(url).endsWith('/chat/completions')){const body=await r.clone().json();await writeFile(path.join(out,`provider-response-${++responseIndex}.json`),JSON.stringify(body,null,2));}return r;};
process.env.AIMEDIA_DATA_DIR=path.join(out,'data');
const {run,ffmpeg}=await import('../backend/media.mjs');
const {initializeStore}=await import('../backend/store.mjs');
const {initializeAI}=await import('../backend/ai.mjs');
const {createLocalServer}=await import('../server/local.mjs');
const {stopWorkflows}=await import('../backend/workflow.mjs');
const file=path.join(out,'release-short.mp4');
// The provided film already has continuous commentary. Use a clearly labelled silent
// test derivative to exercise available narration space, never present it as the original.
if(!process.argv.includes('--resume'))await run(ffmpeg,['-v','error','-i',path.resolve('public/assets/user-film.mp4'),'-t','52','-vf','scale=640:-2','-c:v','libx264','-preset','fast','-an','-y',file]);
await initializeStore();await initializeAI();const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,headers={'X-Tingjian-Request':'1'};const evidence={startedAt:new Date().toISOString(),provider:'real MiniMax vision/ASR and Doubao TTS',fixture:'52-second silent derivative for pipeline acceptance, not the original audio',checks:[]};
async function api(url,options={}){const r=await fetch(base+url,options),j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);return j.data;}
let p;const started=Date.now();
async function wait(){let last='';while(true){p=await api('/api/projects/'+p.id);const w=p.workflow;if(w.message!==last){last=w.message;console.log(w.stage+': '+last);}if(w.status==='error')throw new Error(w.message);if(w.status!=='generating')return;if(Date.now()-started>900000)throw new Error('Live acceptance exceeded 15 minutes');await new Promise(r=>setTimeout(r,2000));}}
async function act(action,extra={}){p=await api('/api/projects/'+p.id+'/listen-action',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action,revision:p.workflow.revision,requestId:crypto.randomUUID(),versionId:p.workflow.current?.id,...extra})});}
try{
 if(process.argv.includes('--resume')){const prior=JSON.parse(await readFile(path.join(out,'result.json')));p=await api('/api/projects/'+prior.projectId);await act('retry');}
 else p=await api('/api/upload',{method:'POST',headers:{...headers,'Content-Type':'video/mp4','X-Filename':'release-acceptance-silent-52s.mp4','X-Request-Id':crypto.randomUUID()},body:await readFile(file)});
 evidence.projectId=p.id;await wait();evidence.checks.push({stage:p.workflow.stage,resumed:process.argv.includes('--resume'),roles:p.workflow.roles.length});
 while(p.workflow.status!=='complete'){await act('accept');await wait();const stage=p.workflow.stage;const result=p.workflow.current.result;assert.ok(result?.narrationUrl);const r=await fetch(base+result.narrationUrl);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>44);evidence.checks.push({stage,duration:result.duration,cues:result.cues.length});}
 await act('save');assert.equal(p.workflow.saved,true);evidence.checks.push({stage:'saved',success:true});
 evidence.passed=true;console.log('Real chain passed');
}catch(e){evidence.passed=false;evidence.error=e.message;console.log('Real chain failed: '+e.message);process.exitCode=1;}
finally{evidence.elapsedSeconds=(Date.now()-started)/1000;await writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));await stopWorkflows();server.closeAllConnections();await new Promise(r=>server.close(r));}
