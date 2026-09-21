import {chromium} from 'playwright';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-progress-'));process.env.AIMEDIA_API_KEY='';process.env.VOLC_TTS_KEY='';
const {initializeStore}=await import('../backend/store.mjs');const {initializeAI}=await import('../backend/ai.mjs');await initializeStore();await initializeAI();
const {createLocalServer}=await import('../server/local.mjs');const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {defaultFilm}=await import('../public/catalog-config.js');const {newTask}=await import('../public/flow.js');
const out=path.resolve('.test-artifacts/progress');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const errors=[],result={checks:[],requests:0};let page;
try{
 const context=await browser.newContext({viewport:{width:1280,height:920}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const draft=newTask(defaultFilm);draft.stage='medium';
 await page.addInitScript(d=>localStorage.setItem('tingjian-demo-v4',JSON.stringify({prefs:{guide:false,focusReadout:false},draft:d,library:[]})),draft);
 await page.route('**/api/tts/status',r=>r.fulfill({json:{configured:true,provider:'volcengine'}}));
 await page.route('**/api/tts/prepare-ui',r=>r.fulfill({json:{ok:true,data:{ready:0,total:0,state:'idle'}}}));
 let fail=true;
 await page.route('**/api/tts',r=>{const b=r.request().postDataJSON();if(b.kind!=='narration')return r.fulfill({status:503,json:{message:'Guide disabled in isolated test'}});result.requests++;if(fail)return r.fulfill({status:503,json:{message:'INTERNAL_SECRET_SHOULD_NOT_APPEAR'}});const segments=defaultFilm.narration[b.speed+'-'+b.density].filter(c=>c.start>=b.start&&c.start<b.start+b.duration).map(c=>({start:c.start,end:c.start+.1,text:c.text,pcm:Buffer.alloc(4800).toString('base64')}));return r.fulfill({json:{provider:'volcengine',filmId:defaultFilm.id,voice:b.voice,sampleRate:24000,trackDuration:defaultFilm.duration,segments}});});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-action="resume"]').click();
 await page.locator('.task-retry:not([hidden])').waitFor();assert.equal(await page.locator('#film-player').count(),0);assert.ok(!(await page.locator('main').innerText()).includes('INTERNAL_SECRET'));result.checks.push('Failure stops success events, hides player, offers retry and redacts provider details');
 fail=false;const began=Date.now();await page.locator('.task-retry').click();await page.mouse.move(0,0);
 assert.equal(await page.locator('.task-steps>li').count(),1);
 await page.waitForTimeout(4500);assert.equal(await page.locator('.task-steps .is-done').count(),1);assert.equal(await page.locator('.task-steps .is-running').count(),1);
 assert.equal(await page.locator('.task-steps>li').count(),2);assert.equal(await page.locator('.task-steps .is-done details').getAttribute('open'),null);assert.ok(await page.locator('.task-inline-stream li').count()>2);
 result.streamRows=await page.locator('.task-inline-stream li').count();assert.ok(result.streamRows>=20);assert.ok(await page.locator('.task-code-line').count()>=14);assert.equal(await page.locator('.task-log').count(),0);assert.equal(await page.locator('.is-running details').evaluate(e=>getComputedStyle(e).borderLeftWidth),'0px');assert.ok(await page.locator('.code-key').count()>0);
 result.technicalNodes=await page.locator('.task-node-line').count();assert.ok(result.technicalNodes>=4);
 result.longestCodeLine=await page.locator('.task-code-line:not(.task-result-line) code').evaluateAll(rows=>Math.max(...rows.map(row=>row.textContent.length)));assert.ok(result.longestCodeLine>=100);
 assert.ok(await page.locator('.code-keyword').count()>0);assert.ok(result.streamRows>=34);
 await page.waitForTimeout(250);assert.ok(await page.locator('.is-running .task-inline-stream').evaluate(e=>e.scrollTop>0));
 await page.screenshot({path:path.join(out,'desktop-progress.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.mouse.move(0,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'mobile-progress.png'),fullPage:true});
 result.checks.push('Unified in-step text/code stream; no grey panel or vertical line; dynamic collapse; 390px without overflow');
 await page.waitForFunction(()=>document.querySelector('.task-status')?.textContent==='样片已准备好');const completeAt=Date.now();assert.equal(await page.locator('#film-player').count(),0);await page.locator('.task-continue:not([hidden])').waitFor();const enteredAt=Date.now();
 await page.waitForTimeout(1200);assert.equal(await page.locator('#film-player').count(),0);
 await page.setViewportSize({width:1280,height:920});await page.screenshot({path:path.join(out,'manual-complete.png'),fullPage:true});
 await page.locator('[data-action="view-stage"][data-stage="1"]').click();await page.locator('.role-grid').waitFor();
 await page.locator('[data-action="view-stage"][data-stage="3"]').click();await page.locator('.task-continue:not([hidden])').waitFor();assert.equal(result.requests,2);
 await page.locator('.task-continue').click();await page.locator('#film-player').waitFor();
 result.presentationMs=enteredAt-began;result.finishHoldMs=enteredAt-completeAt;assert.ok(result.presentationMs>=6000&&result.presentationMs<=11000);assert.ok(result.finishHoldMs>=600);assert.equal(result.requests,2);
 result.checks.push('Faster dense-stream presentation, final hold, no duplicate synthesis after entering player');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tingjian-demo-v4')).draft);
 const labels=await page.locator('.stage-nav [data-visual-copy]>[aria-hidden="true"]').allTextContents();assert.deepEqual(labels,['素材导入','内容解析','样片审校','连续性复核','成片交付']);
 assert.equal(await page.locator('[data-stage="4"]').isDisabled(),true);
 const spoken=await page.locator('.stage-nav button').evaluateAll(async buttons=>{const {focusLabel}=await import('/focus-reader.js');return buttons.map(focusLabel);});assert.deepEqual(spoken,['上传视频','认识角色','试听短片','试听长一点','完成整片']);
 for(const stage of [0,1,2]){
  await page.locator(`[data-action="view-stage"][data-stage="${stage}"]`).click();await page.locator('.stage-review-note').waitFor();
  assert.equal(await page.locator('.stage-nav [aria-current="step"]').getAttribute('data-stage'),String(stage));
  assert.equal(await page.locator('[data-action="confirm"]').count(),0);
  if(stage===2){await page.waitForFunction(()=>document.querySelector('#film-player')?.readyState>=1);assert.match(await page.locator('h1').innerText(),/7 秒样片审校/);}
 }
 await page.locator('[data-action="view-stage"][data-stage="3"]').click();await page.locator('#confirm-sample:not([disabled])').waitFor();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('tingjian-demo-v4')).draft),saved);
 await page.screenshot({path:path.join(out,'professional-sample.png'),fullPage:true});
 result.checks.push('Explicit continue gate, reversible top navigation, preserved task state and original spoken labels');
 // Component-level delayed task, failure, disposal and reduced-motion behavior.
 await page.emulateMedia({reducedMotion:'reduce'});
 const checks=await page.evaluate(async()=>{
  const {createTaskProgress}=await import('/task-progress.js');const root=document.createElement('div');document.body.append(root);let completed=false;
  const v=createTaskProgress(root,{steps:['真实待完成任务'],onComplete:()=>completed=true,timing:{stageMs:50,logMs:20,pauseMs:10,finishMs:50}});
  v.event({id:'start',type:'start',stage:0,message:'等待真实结果'});await new Promise(r=>setTimeout(r,300));const noFake=root.querySelector('.is-done')===null&&!completed;
  v.event({id:'code',type:'log',stage:0,message:'配置',code:{range:45}});
  const stream=root.querySelector('.task-inline-stream');stream.focus();const before=v.rows;await new Promise(r=>setTimeout(r,200));const focusKeepsFlow=v.rows>before;root.querySelector('.task-motion-toggle').click();v.event({id:'paused-row',type:'log',stage:0,message:'等待阅读'});const pausedRows=v.rows;await new Promise(r=>setTimeout(r,200));const readingPause=v.rows===pausedRows;root.querySelector('.task-motion-toggle').click();stream.blur();
  const reduced=getComputedStyle(root.querySelector('.task-marker')).animationName==='none';
  v.fail('任务失败，请重试。');v.event({id:'done',type:'done',stage:0});v.complete();await new Promise(r=>setTimeout(r,150));const failure=!completed&&!!root.querySelector('.is-failed');v.dispose();root.remove();
  const root2=document.createElement('div');document.body.append(root2);const v2=createTaskProgress(root2,{steps:['测试'],onComplete:()=>completed=true,timing:{stageMs:0,logMs:0,pauseMs:0,finishMs:50}});v2.event({id:'start',type:'start',stage:0});v2.event({id:'done',type:'done',stage:0});v2.complete();v2.dispose();await new Promise(r=>setTimeout(r,150));root2.remove();return {noFake,reduced,failure,readingPause,focusKeepsFlow,noLateNavigation:!completed};
 });assert.ok(Object.values(checks).every(Boolean));result.componentChecks=checks;assert.deepEqual(errors,[]);result.pageErrors=errors;result.passed=true;
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
