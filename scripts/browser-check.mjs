// Isolated browser acceptance with deterministic model responses and real media.
// Never uses the operator's credentials or writes into their project library.
import {chromium} from 'playwright';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const data=await mkdtemp(path.join(os.tmpdir(),'tingjian-browser-'));
process.env.AIMEDIA_DATA_DIR=data;process.env.AIMEDIA_API_KEY='test-placeholder';process.env.AIMEDIA_PROVIDER='minimax';process.env.TINGJIAN_TTS_PROVIDER='minimax';delete process.env.VOLC_TTS_KEY;
let wave;
const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const b of req)raw+=b;let value;
  if(req.url.endsWith('/speech_to_text'))value={text:'旁白慢一点',segments:[]};
  else{
    const body=JSON.parse(raw);
    if(req.url.endsWith('/t2a_v2'))value={data:{audio:wave.toString('hex')}};
    else{
      const name=body.tools[0].function.name;let result;
      if(name==='submit_roles')result={roles:[{name:'测试人物',detail:'受控测试返回的角色介绍，不代表真实识别。',frame:0}]};
      else{
        const count=body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(c=>c.type==='image_url').length;
        const n=count>12?3:1;result={scenes:Array.from({length:n},(_,i)=>({title:'测试画面',firstFrame:Math.floor(i*count/n),lastFrame:Math.floor((i+1)*count/n)-1,evidenceFrame:Math.floor(i*count/n),evidence:'蓝色测试画面',facts:['蓝色画面'],category:'required',text:'蓝色画面。',uncertainty:''}))};
      }
      value={choices:[{message:{tool_calls:[{type:'function',function:{name,arguments:JSON.stringify(result)}}]}}]};
    }
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));
});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));
process.env.AIMEDIA_BASE_URL=`http://127.0.0.1:${provider.address().port}/v1`;
const {run,ffmpeg}=await import('../backend/media.mjs');
const fixture=path.join(data,'test-video.mp4'),sound=path.join(data,'voice.wav');
await run(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=8:d=80','-c:v','libx264','-pix_fmt','yuv420p','-y',fixture]);
await run(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=650:duration=1','-y',sound]);wave=await readFile(sound);
const {initializeStore}=await import('../backend/store.mjs');const {initializeAI}=await import('../backend/ai.mjs');
await initializeStore();await initializeAI();
const {createLocalServer}=await import('../server/local.mjs');const {stopWorkflows}=await import('../backend/workflow.mjs');
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const out=path.resolve('.test-artifacts/browser');await mkdir(out,{recursive:true});
let browser;const errors=[],checks=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{channel:'chrome'})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));
  // Narration is mocked explicitly; old unverified local fallback tracks must not mask failures.
  const {defaultFilm}=await import('../public/catalog-config.js');
  await page.route('**/api/tts/status',r=>r.fulfill({json:{configured:true,provider:'volcengine'}}));
  await page.route('**/api/tts/prepare-ui',r=>r.fulfill({json:{ok:true,data:{ready:0,total:0,state:'idle'}}}));
  await page.route('**/api/tts',r=>{const b=r.request().postDataJSON();if(b.kind!=='narration')return r.fulfill({status:503,json:{message:'Guide disabled in workflow test'}});const segments=defaultFilm.narration[b.speed+'-'+b.density].filter(c=>c.start>=b.start&&c.start<b.start+b.duration).map(c=>({start:c.start,end:c.start+.1,text:c.text,pcm:Buffer.alloc(4800).toString('base64')}));return r.fulfill({json:{provider:'volcengine',filmId:defaultFilm.id,voice:b.voice,sampleRate:24000,trackDuration:defaultFilm.duration,segments}});});
  await page.goto(url);await page.getByRole('heading',{name:'本机制作的口述影像'}).waitFor();
  await page.screenshot({path:path.join(out,'home.png'),fullPage:true});
  // Use browser keyboard to navigate to the settings button; no mouse for navigation.
  async function tabTo(selector,max=80){for(let i=0;i<max;i++){if(await page.evaluate(sel=>document.activeElement?.matches(sel),selector))return;await page.keyboard.press('Tab');}throw new Error('Keyboard could not reach '+selector);}
  await tabTo('[data-action="settings"]');await page.keyboard.press('Enter');
  await tabTo('[data-action="pref-reader"]');await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-action="pref-reader"]').getAttribute('aria-checked'),'true');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);checks.push('Keyboard settings and screen-reader priority');
  await tabTo('[data-action="create"]');await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'先选择你想听的视频'}).waitFor();
  await page.locator('#file-input').setInputFiles(fixture);
  await page.locator('[data-live-action="accept"]').waitFor({timeout:60000});
  assert.match(await page.locator('main').innerText(),/测试人物/);checks.push('Real upload, actual processing status, role result');
  await tabTo('[data-live-action="accept"]');await page.keyboard.press('Enter');
  await page.locator('#live-video').waitFor({timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#live-video')?.readyState>=1&&document.querySelector('#live-narration')?.readyState>=1);
  await tabTo('[data-live-action="play"]');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#live-video')?.currentTime>.2);
  assert.equal(await page.locator('#live-video').evaluate(v=>v.playbackRate),1);
  await tabTo('[data-live-action="chat"]');await page.keyboard.press('Enter');
  assert.equal(await page.locator('#live-video').evaluate(v=>v.paused),true);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied by isolated test','NotAllowedError');};});
  await tabTo('[data-live-action="record"]');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#live-feedback-status')?.textContent.includes('麦克风未开启'));checks.push('Denied microphone retains text fallback');
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('#chat')!==null),true);}
  await page.locator('#live-text').fill('旁白慢一点');await page.locator('#live-feedback button[type="submit"]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('当前版本2')&&!!document.querySelector('#live-video'),null,{timeout:60000});checks.push('Dialog focus trap, pause before feedback, changed version');
  await tabTo('[data-live-action="accept"]');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='试听长一点'&&!!document.querySelector('#live-video'),null,{timeout:60000});
  await tabTo('[data-live-action="chat"]');await page.keyboard.press('Enter');await page.locator('#live-text').fill('描述少一点');await page.locator('#live-feedback button[type="submit"]').focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'修改满意，进行短片复验'}).waitFor({timeout:60000});await tabTo('[data-live-action="accept"]');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'复验满意，制作完整视频'}).waitFor({timeout:60000});checks.push('Medium rework requires fresh short verification');
  await tabTo('[data-live-action="accept"]');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'加入我的视频',exact:true}).waitFor({timeout:60000});
  await page.screenshot({path:path.join(out,'complete.png'),fullPage:true});
  assert.match(await page.locator('main').innerText(),/完整视频/);await tabTo('[data-live-action="save"]');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'已加入我的视频',exact:true}).waitFor();await page.reload();
  await page.locator('[data-live-action="open"]').waitFor();await tabTo('[data-live-action="open"]');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'已加入我的视频',exact:true}).waitFor();checks.push('Full output, persistent saved library, reload and reopen');
  // Switch back to the supplied demo and verify that its pre-set path is retained.
  await tabTo('[data-live-action="home"]');await page.keyboard.press('Enter');await tabTo('[data-action="create"]');await page.keyboard.press('Enter');
  await tabTo('[data-action="demo"]');await page.keyboard.press('Enter');await page.getByRole('button',{name:/角色介绍清楚/}).waitFor();
  await tabTo('[data-action="confirm"]');await page.keyboard.press('Enter');await page.locator('[data-action="chat"]').waitFor();
  assert.match(await page.locator('.demo-notice').innerText(),/演示模式/);
  await tabTo('[data-action="confirm"]');await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'再听 45 秒，看看连续观看是否合适'}).waitFor();
  await tabTo('[data-action="chat"]');await page.keyboard.press('Enter');await page.locator('#feedback-text').fill('描述少一点');await tabTo('#chat button[type="submit"]');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'修改满意，进行短片复验',exact:true}).waitFor();await tabTo('[data-action="confirm"]');await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'用更新后的设置，再确认 7 秒'}).waitFor();await tabTo('[data-action="confirm"]');await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'你的故事，现在可以听见了'}).waitFor();await tabTo('[data-action="save"]');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'已加入我的视频',exact:true}).waitFor();checks.push('Original demo rework, verification, completion and save retained and labelled');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,model:'mocked-local-provider',realMedia:true,browserVersion:await browser.version(),checks,pageErrors:errors,notVerified:['NVDA','human blindfold test','visually impaired users','live model/TTS']},null,2));
  console.log(JSON.stringify({passed:true,checks,artifacts:out}));
}catch(error){if(browser){const pages=browser.contexts().flatMap(c=>c.pages());await pages[0]?.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error('PAGE ERRORS',errors);console.error((await pages[0]?.locator('body').innerText())?.slice(-2500));}throw error;}
finally{await browser?.close();await stopWorkflows();server.closeAllConnections();await new Promise(r=>server.close(r));provider.closeAllConnections();await new Promise(r=>provider.close(r));}
