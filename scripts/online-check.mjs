// Real deployed service acceptance. Uses only the labelled release fixture, no mocks.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='.test-artifacts/deploy',access=JSON.parse(await readFile(dir+'/access.json'));
const base=access.url,headers={Authorization:'Basic '+Buffer.from(access.username+':'+access.password).toString('base64'),'X-Tingjian-Request':'1'};
const evidence={url:base,startedAt:new Date().toISOString(),fixture:'52 second silent test derivative; not original audio',checks:[],retries:[],pageErrors:[]};
let p;
async function api(route,options={}){const r=await fetch(base+route,{...options,headers:{...headers,...options.headers}});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);return j.data;}
async function act(action){p=await api('/api/projects/'+p.id+'/listen-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:p.workflow.revision,requestId:crypto.randomUUID(),versionId:p.workflow.current?.id})});}
async function wait(){let last='',retries=0;const started=Date.now();while(true){p=await api('/api/projects/'+p.id);const w=p.workflow;if(w.message!==last){last=w.message;console.log(w.stage+': '+last);}if(w.status==='error'){if(retries++<2&&/模型|格式|精简/.test(w.message)){evidence.retries.push({stage:w.stage,error:w.message});await act('retry');continue;}throw new Error(w.message);}if(w.status!=='generating')return;if(Date.now()-started>600000)throw new Error('Online stage timed out');await new Promise(r=>setTimeout(r,2000));}}
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 assert.equal((await fetch(base+'/api/bootstrap')).status,401);evidence.checks.push('Anonymous access denied');
 const context=await browser.newContext({httpCredentials:{username:access.username,password:access.password},viewport:{width:1280,height:900}});const page=await context.newPage();page.on('pageerror',e=>evidence.pageErrors.push(e.message));
 await page.goto(base);await page.getByRole('heading',{name:'我的视频',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>isSecureContext&&!!navigator.mediaDevices?.getUserMedia),true);
 const remote=await fetch(base+'/experience.js',{headers}).then(r=>r.text()),local=await readFile('public/experience.js','utf8');assert.equal(createHash('sha256').update(remote).digest('hex'),createHash('sha256').update(local).digest('hex'));evidence.checks.push('Exact new frontend deployed; HTTPS microphone API available');
 await page.keyboard.press('Tab');await page.locator('[data-action="create"]').first().focus();await page.waitForFunction(()=>document.querySelector('#focus-readout')?.dataset.state==='speaking');assert.equal(await page.locator('#focus-readout').getAttribute('data-provider'),'volcengine');evidence.checks.push('Online keyboard prompt plays Doubao');
 if(process.argv.includes('--resume')){const old=JSON.parse(await readFile(dir+'/online-result.json'));evidence.checks.push(...old.checks.filter(x=>typeof x!=='string'));p=await api('/api/projects/'+old.projectId);if(p.workflow.status==='error')await act('retry');await page.locator(`[data-live-action="open"][data-id="${p.id}"]`).click();}
 else{
  await page.locator('[data-action="create"]').first().click();const uploaded=page.waitForResponse(r=>r.url().endsWith('/api/upload')&&r.request().method()==='POST');await page.locator('#file-input').setInputFiles('.test-artifacts/live-release/release-short.mp4');
  assert.equal((await uploaded).status(),200);p=(await api('/api/bootstrap')).projects.find(x=>x.title.includes('release-short'));assert.ok(p);
 }
 evidence.projectId=p.id;await wait();
 if(p.workflow.stage==='roles')evidence.checks.push({stage:'roles',roles:p.workflow.roles.length,source:'real vision'});
 const exerciseShort=async()=>{
   await page.locator('#live-video').waitFor({timeout:15000});await page.waitForFunction(()=>document.querySelector('#live-video')?.readyState>=2&&document.querySelector('#live-narration')?.readyState>=2);await page.locator('[data-live-action="play"]').click();await page.waitForFunction(()=>document.querySelector('#live-video')?.currentTime>0.1&&!document.querySelector('#live-video').paused);
   assert.equal(await page.locator('#live-video').evaluate(v=>v.playbackRate),1);
   await page.locator('[data-live-action="play"]').click();
   const prompt=await fetch(base+'/api/tts/ui-audio?'+new URLSearchParams({text:'旁白慢一点',voice:'vivi'}),{headers}).then(r=>r.arrayBuffer());
   const asr=await api('/api/projects/'+p.id+'/listen-voice',{method:'POST',headers:{'Content-Type':'audio/wav'},body:prompt});assert.match(asr.text,/旁白.*慢/);evidence.checks.push({asr:true,text:asr.text,source:'prepared speech submitted to real transcription API'});

 };
 if(p.workflow.stage==='short')await exerciseShort();
 while(p.workflow.status!=='complete'){
  await page.locator('[data-live-action="accept"]').waitFor({timeout:15000});
  const transition=page.waitForResponse(r=>r.url().endsWith('/listen-action')&&r.request().postDataJSON()?.action==='accept');
  await page.locator('[data-live-action="accept"]').click();assert.equal((await transition).status(),200);await wait();
  const c=p.workflow.current;assert.ok(c?.result);evidence.checks.push({stage:p.workflow.stage,duration:c.result.duration,cues:c.result.cues.length});
  if(p.workflow.stage==='short')await exerciseShort();
 }
 await page.locator('[data-live-action="save"]').waitFor({timeout:15000});if(!p.workflow.saved)await page.locator('[data-live-action="save"]').click();await page.getByRole('button',{name:'已加入我的视频',exact:true}).waitFor();
 p=await api('/api/projects/'+p.id);assert.equal(p.workflow.saved,true);
 const source=await fetch(base+p.sourceUrl,{headers}).then(r=>r.arrayBuffer());assert.equal(createHash('sha256').update(Buffer.from(source)).digest('hex'),createHash('sha256').update(await readFile('.test-artifacts/live-release/release-short.mp4')).digest('hex'));evidence.checks.push('Uploaded source bytes preserved');
 const media=await fetch(base+p.workflow.current.result.narrationUrl,{headers:{...headers,Range:'bytes=0-43'}});assert.equal(media.status,206);assert.equal(Buffer.from(await media.arrayBuffer()).toString('ascii',0,4),'RIFF');
 await page.reload();await page.locator(`[data-live-action="open"][data-id="${p.id}"]`).click();await page.locator('#live-video').waitFor();await page.waitForFunction(()=>document.querySelector('#live-video')?.readyState>=2&&document.querySelector('#live-narration')?.readyState>=2);await page.locator('[data-live-action="play"]').click();await page.waitForFunction(()=>document.querySelector('#live-video')?.currentTime>.2&&!document.querySelector('#live-video').paused);evidence.checks.push('Saved task reopened after refresh; full playback and audio Range work');
 await page.screenshot({path:dir+'/online-complete.png',fullPage:true});assert.deepEqual(evidence.pageErrors,[]);evidence.passed=true;console.log('Online real upload-to-playback passed');
}catch(e){evidence.passed=false;evidence.error=e.message;console.log('Online check failed: '+e.message);process.exitCode=1;}
finally{await writeFile(dir+'/online-result.json',JSON.stringify(evidence,null,2));await browser.close();}
