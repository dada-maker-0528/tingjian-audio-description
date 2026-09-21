import {chromium} from 'playwright';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {defaultFilm} from '../public/catalog-config.js';import {newTask} from '../public/flow.js';
const access=JSON.parse(await readFile('.test-artifacts/deploy/access.json','utf8'));
const evidence={url:access.url,checkedAt:new Date().toISOString(),liveServices:true,checks:[],pageErrors:[],narrationRequests:0};
const auth='Basic '+Buffer.from(access.username+':'+access.password).toString('base64');
for(const f of ['index.html','experience.js','real-workflow.js','flow.js','task-progress.js','task-progress.css','demo-progress.js','task-code.js','workflow-ui.js','prompt-library.js','prompt-library.css','prompt-defaults.js']){const r=await fetch(access.url+'/'+(f==='index.html'?'':f),{headers:{Authorization:auth}});assert.equal(r.status,200);const actual=Buffer.from(await r.arrayBuffer()),local=await readFile('public/'+f);assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(local).digest('hex'));}
evidence.checks.push('All twelve frontend assets match the tested local files');
const browser=await chromium.launch({headless:true,channel:'chrome'});let page;
try{
 const context=await browser.newContext({httpCredentials:{username:access.username,password:access.password},viewport:{width:1280,height:920}});page=await context.newPage();page.setDefaultTimeout(150000);page.on('pageerror',e=>evidence.pageErrors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/api/tts')&&r.postDataJSON()?.kind==='narration')evidence.narrationRequests++;});
 const draft=newTask(defaultFilm);draft.stage='medium';await page.addInitScript(d=>localStorage.setItem('tingjian-demo-v4',JSON.stringify({prefs:{guide:false,focusReadout:false},draft:d,library:[]})),draft);
 await page.goto(access.url);await page.locator('[data-action="resume"]').click();await page.mouse.move(0,0);const started=Date.now();await page.locator('.task-progress').waitFor();
 await page.waitForTimeout(4500);assert.equal(await page.locator('.task-log').count(),0);assert.ok(await page.locator('.is-running .task-inline-stream .task-code-line').count()>0);await page.screenshot({path:'.test-artifacts/progress/online-desktop.png',fullPage:true});
 evidence.technicalNodes=await page.locator('.task-node-line').count();assert.ok(evidence.technicalNodes>=4);
 evidence.longestCodeLine=await page.locator('.task-code-line:not(.task-result-line) code').evaluateAll(rows=>Math.max(...rows.map(row=>row.textContent.length)));assert.ok(evidence.longestCodeLine>=100);
 await page.setViewportSize({width:390,height:844});await page.mouse.move(0,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.test-artifacts/progress/online-mobile.png',fullPage:true});
 await page.locator('.task-continue:not([hidden])').waitFor();await page.waitForTimeout(1200);assert.equal(await page.locator('#film-player').count(),0);
 await page.screenshot({path:'.test-artifacts/progress/online-complete-gate.png',fullPage:true});
 await page.locator('[data-action="view-stage"][data-stage="1"]').click();await page.locator('.role-grid').waitFor();
 await page.locator('[data-action="view-stage"][data-stage="3"]').click();await page.locator('.task-continue:not([hidden])').waitFor();
 assert.equal(await page.locator('[data-action="view-stage"][data-stage="4"]').isDisabled(),true);
 const spoken=await page.locator('.stage-nav button').evaluateAll(async buttons=>{const {focusLabel}=await import('/focus-reader.js');return buttons.map(focusLabel);});assert.deepEqual(spoken,['上传视频','认识角色','试听短片','试听长一点','完成整片']);
 evidence.checks.push('Back to roles and forward to preserved completion gate; future stage disabled; spoken labels unchanged');
 await page.locator('.task-continue').click();
 await page.locator('#film-player').waitFor();await page.waitForFunction(()=>!document.querySelector('#confirm-sample')?.disabled,null,{timeout:150000});evidence.elapsedMs=Date.now()-started;
 assert.equal(evidence.narrationRequests,1);await page.locator('[data-action="play"]').first().click();await page.waitForFunction(()=>document.querySelector('#film-player')?.currentTime>.3);
 evidence.media=await page.locator('#film-player').evaluate(v=>({currentTime:v.currentTime,rate:v.playbackRate,error:v.error?.message||null}));assert.equal(evidence.media.rate,1);assert.equal(evidence.media.error,null);
 evidence.checks.push('Live Doubao narration, explicit continue gate and real playback','One synthesis request; no repeat request when entering player','390px layout without horizontal overflow');assert.deepEqual(evidence.pageErrors,[]);evidence.passed=true;
 await writeFile('.test-artifacts/progress/online-result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(e){await page?.screenshot({path:'.test-artifacts/progress/online-failure.png',fullPage:true});console.error((await page?.locator('main').innerText())?.slice(-1600));throw e;}finally{await browser.close();}
