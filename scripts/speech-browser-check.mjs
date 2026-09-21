// Uses already generated Doubao audio. Network synthesis is blocked in the browser.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.TINGJIAN_TEST_URL||'http://127.0.0.1:5294';
const out=path.resolve('.test-artifacts/speech');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const errors=[],checks=[];
try{
 const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{window.__mechanical=0;if(window.speechSynthesis)window.speechSynthesis.speak=()=>{window.__mechanical++;throw new Error('Mechanical speech forbidden');};});
 let synthRequests=0,cachedReads=0;
 await page.route('**/api/tts',route=>{synthRequests++;return route.fulfill({status:503,json:{message:'test blocks synthesis'}});});
 await page.route('**/api/tts/prepare-ui',route=>route.fulfill({json:{ok:true,data:{ready:0,total:0,state:'idle'}}}));
 page.on('request',req=>{if(req.url().includes('/api/tts/ui-audio?'))cachedReads++;});
 await page.goto(base);await page.locator('[data-action="create"]').first().waitFor();
 async function speak(label,selector){await page.keyboard.press('Tab');await page.locator(selector).first().focus();await page.waitForFunction(w=>{const e=document.querySelector('#focus-readout');return e?.dataset.spokenLabel===w&&e?.dataset.state==='speaking';},label);}
 await speak('创建新视频','[data-action="create"]');
 assert.equal(await page.locator('#focus-readout').getAttribute('data-provider'),'volcengine');checks.push('Keyboard focus plays real cached Doubao WAV');
 const reads=cachedReads;await page.reload();await page.locator('[data-action="create"]').first().waitFor();
 await speak('创建新视频','[data-action="create"]');assert.equal(cachedReads,reads);assert.equal(synthRequests,0);checks.push('Reload reuses IndexedDB without a speech request');
 await page.evaluate(async()=>{
  const {FocusReader}=await import('/focus-reader.js');
  const audio1=await fetch('/api/tts/ui-audio?text='+encodeURIComponent('播放')+'&voice=vivi').then(r=>r.blob());
  const url=URL.createObjectURL(audio1),first=document.createElement('button'),second=document.createElement('button'),status=document.createElement('div');
  first.textContent='旧按钮';second.textContent='新按钮';document.body.append(first,second,status);
  const reader=new FocusReader({enabled:()=>true,beforeSpeak:()=>{},status,audioSource:(label)=>new Promise(r=>setTimeout(()=>r(url),label==='旧按钮'?250:10))});
  window.__focusTest={reader,first,second,status};first.focus();reader.read(first);
 });
 await page.waitForTimeout(100);await page.evaluate(()=>{const t=window.__focusTest;t.second.focus();t.reader.read(t.second);});
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__focusTest.status.dataset.spokenLabel),'新按钮');checks.push('Late old request cannot speak after focus changed');
 await page.evaluate(()=>{window.__focusTest.reader.stop();window.__focusTest.first.remove();window.__focusTest.second.remove();});
 await page.locator('[data-action="settings"]').click();await page.locator('[data-action="pref-reader"]').click();
 await page.keyboard.press('Escape');await page.keyboard.press('Tab');await page.locator('[data-action="create"]').first().focus();await page.waitForTimeout(160);
 assert.equal(await page.locator('#focus-readout').getAttribute('data-state'),'idle');checks.push('Reader priority stops station speech');
 await page.locator('[data-action="settings"]').click();await page.locator('[data-action="pref-reader"]').click();await page.keyboard.press('Escape');
 await page.evaluate(()=>{const b=document.createElement('button');b.id='uncached-test';b.textContent='从未缓存的测试提示';document.body.append(b);});
 const beforeFailure=synthRequests;await page.keyboard.press('Tab');await page.locator('#uncached-test').focus();await page.waitForFunction(()=>document.querySelector('#focus-readout')?.dataset.state==='unavailable');
 assert.equal(await page.evaluate(()=>window.__mechanical),0);assert.equal(synthRequests,beforeFailure+1);checks.push('Uncached failed speech stays silent without mechanical fallback');
 assert.deepEqual(errors,[]);
 const result={passed:true,browserVersion:await browser.version(),source:'Previously generated real Doubao WAV; no new synthesis in this check',checks,pageErrors:errors};
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
