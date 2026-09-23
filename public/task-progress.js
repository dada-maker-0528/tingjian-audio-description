// Timers pace presentation only. Only producers may emit a successful event.
import {taskSnippet,allTaskSnippets} from './task-code.js';
// All illustrative code is tokenized once, before any task starts.
export const TASK_TIMING=Object.freeze({stageMs:1800,logMs:140,codeMs:90,codeBatch:3,blockHoldMs:360,pauseMs:120,finishMs:700,timeoutMs:120000});
// Preset media is checked independently; only its on-screen presentation is shortened.
export const MEDIA_TIMING=Object.freeze({...TASK_TIMING,stageMs:420,logMs:20,codeMs:20,blockHoldMs:40,pauseMs:20,finishMs:180});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codeHTML=new Map(allTaskSnippets().flatMap(s=>s.lines.map(line=>[line,highlightCode(line)])));
export class ProgressQueue{
 constructor(count,timing=TASK_TIMING){this.count=count;this.timing={...TASK_TIMING,...timing};this.pending=[];this.seen=new Set();this.states=Array(count).fill('pending');this.current=-1;this.entered=0;this.next=0;this.terminal=null;this.finished=false;}
 push(event){if(this.terminal||this.seen.has(event.id))return;this.seen.add(event.id);this.pending.push(event);}
 fail(stage=this.current){
  // If the visual queue trails execution, show the actual failing stage.
  for(const event of this.pending)if(event.type==='done'&&event.stage<stage)this.states[event.stage]='done';
  this.terminal='failed';this.pending=[];if(stage>=0)this.states[stage]='failed';
 }
 tick(now){
  if(this.terminal==='failed'||now<this.next)return null;
  const event=this.pending[0];if(!event)return null;
  if(event.type==='finish'&&this.states.some(s=>s!=='done'))return null;
  if(event.type==='done'&&now-this.entered<this.timing.stageMs)return null;
  this.pending.shift();
  if(event.type==='start'){this.current=event.stage;this.states[event.stage]='running';this.entered=now;}
  if(event.type==='done')this.states[event.stage]='done';
  if(event.type==='finish'){this.terminal='done';this.finished=true;}
  this.next=now+(event.blockEnd?this.timing.blockHoldMs:event.type==='done'?this.timing.pauseMs:['code','code-batch'].includes(event.type)?this.timing.codeMs:['start','log'].includes(event.type)?this.timing.logMs:0);
  return event;
 }
}
export function highlightJSON(line){
 const pattern=/"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null|-?\d+(?:\.\d+)?)\b/g;
 let html='',at=0;for(const m of line.matchAll(pattern)){html+=esc(line.slice(at,m.index));const kind=m[0].startsWith('"')?(/^\s*:/.test(line.slice(m.index+m[0].length))?'key':'string'):'value';html+=`<span class="code-${kind}">${esc(m[0])}</span>`;at=m.index+m[0].length;}return html+esc(line.slice(at));
}
export function highlightCode(line){
 const pattern=/\/\/.*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:const|let|if|else|return|await|async|throw|new|for|of|true|false|null)\b|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*(?=\s*\()/g;
 let html='',at=0;for(const m of line.matchAll(pattern)){
  html+=esc(line.slice(at,m.index));const token=m[0];
  const kind=token.startsWith('//')?'comment':/^['"]/.test(token)?'string':/^(const|let|if|else|return|await|async|throw|new|for|of)$/.test(token)?'keyword':/^(true|false|null|\d)/.test(token)?'value':'function';
  html+=`<span class="code-${kind}">${esc(token)}</span>`;at=m.index+token.length;
 }return html+esc(line.slice(at));
}
export function expandTaskEvent(event,timing=TASK_TIMING){
 const snippet=taskSnippet(event),events=[{...event,source:snippet?.source}];
 if(snippet){
  for(let i=0;i<snippet.lines.length;i+=timing.codeBatch)events.push({id:`${event.id}:snippet:${i}`,type:'code-batch',stage:event.stage,lines:snippet.lines.slice(i,i+timing.codeBatch)});
 }
 if(event.code&&typeof event.code==='object')events.push({id:`${event.id}:result`,type:'code',stage:event.stage,message:JSON.stringify(event.code),result:true});
 if(snippet||event.code)events.at(-1).blockEnd=true;
 return events;
}
export function createTaskProgress(root,{steps,mode='live',completeLabel='样片已准备好',nextLabel='进入下一步',onReady=()=>{},onComplete=()=>{},onRetry,timing=mode==='media'?MEDIA_TIMING:TASK_TIMING}={}){
 const queue=new ProgressQueue(steps.length,timing),controller=new AbortController();let timer,finishTimer,disposed=false,continued=false,paused=false,lastStatus='',rows=0,resolveDone,scrollFrame=0,scrollTarget=null,lastEventAt=Date.now();
 const done=new Promise(resolve=>resolveDone=resolve);let executionFinished=false,pausedProgressTarget=null;
 const replays=new Map();
 function stopReplays(){for(const replay of replays.values())clearInterval(replay.timer);replays.clear();}
 function replayCode(row){
  const prior=replays.get(row);if(prior)clearInterval(prior.timer);
  const lines=[...row.querySelectorAll('.task-inline-stream li')];
  lines.forEach(line=>line.hidden=false);
  if(!row.querySelector('details').open||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  lines.forEach(line=>line.hidden=true);
  const stream=row.querySelector('.task-inline-stream');stream.scrollTop=0;stream.dataset.follow='true';
  let at=0;
  const replay={timer:setInterval(()=>{
   if(disposed||!root.isConnected){clearInterval(replay.timer);return;}
   if(paused)return;
   for(let n=0;n<queue.timing.codeBatch&&at<lines.length;n++)lines[at++].hidden=false;
   followEnd(stream);
   if(at===lines.length){clearInterval(replay.timer);replays.delete(row);}
  },queue.timing.codeMs)};
  replays.set(row,replay);
 }
 root.innerHTML=`<section class="task-progress${mode==='media'?' task-progress-fast':''}" aria-label="分阶段任务进度"><div class="task-progress-meta"><span>${mode==='media'?'视频准备 · 资源检查':mode==='demo'?'Demo · 预设演示事件':mode==='hybrid'?'预设样片 · 旁白资源检查':'实际任务记录'}</span><span data-task-count>准备开始</span></div><div class="progress-track" role="progressbar" aria-label="阶段完成进度" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="0"><div class="progress-fill"></div></div><ol class="task-steps" aria-label="逐步展开的执行过程"></ol><p class="task-status" role="status" aria-live="polite" aria-atomic="true"></p><button type="button" class="btn task-retry" hidden>重试当前阶段</button></section>`;
 const q=s=>root.querySelector(s),status=message=>{if(lastStatus!==message){lastStatus=message;q('.task-status').textContent=message;}};
 const finishPresentation=()=>{
  clearTimeout(finishTimer);
  finishTimer=setTimeout(()=>{
   if(disposed||paused)return;
   q('.task-progress').dataset.complete='true';status(completeLabel);
   q('.task-continue').hidden=false;onReady();
  },matchMedia('(prefers-reduced-motion: reduce)').matches?0:mode==='media'?queue.timing.finishMs:2000);
 };
 function paint(){
  queue.states.forEach((state,i)=>{
   if(state==='pending')return;
   let row=q(`[data-task-step="${i}"]`);
   if(!row){row=document.createElement('li');row.dataset.taskStep=i;row.innerHTML=`<details open><summary><span class="task-marker" aria-hidden="true"></span><strong>${esc(steps[i])}</strong><small></small><span class="task-expand" aria-hidden="true">⌄</span></summary><div class="task-step-body"><p class="task-step-intent"></p><div class="task-inline-stream" tabindex="0" role="region" aria-label="${esc(steps[i])}的执行摘要与配置" aria-live="off" title="可使用暂停展示按钮停留阅读"><ol></ol></div></div></details>`;q('.task-steps').append(row);
    const stream=row.querySelector('.task-inline-stream');stream.dataset.follow='true';
    row.querySelector('details').addEventListener('toggle',()=>{if(row.dataset.state==='done')replayCode(row);});
    stream.addEventListener('wheel',e=>{if(e.deltaY<0)stream.dataset.follow='false';},{passive:true});
    stream.addEventListener('touchstart',()=>{stream.dataset.follow='false';},{passive:true});
    stream.addEventListener('keydown',e=>{if(['ArrowUp','PageUp','Home'].includes(e.key))stream.dataset.follow='false';if(e.key==='End')stream.dataset.follow='true';});
    stream.addEventListener('scroll',()=>{if(stream.scrollHeight-stream.scrollTop-stream.clientHeight<8)stream.dataset.follow='true';},{passive:true});
   }
   if(row.dataset.state!==state){
    row.dataset.state=state;row.className='is-'+state;
    row.querySelector('.task-marker').textContent=state==='done'?'✓':state==='failed'?'!':'';
    row.querySelector('small').textContent={running:'进行中',done:'已完成 · 可回看',failed:'未完成'}[state];
    row.querySelector('details').open=state!=='done';
    if(state==='running')row.setAttribute('aria-current','step');else row.removeAttribute('aria-current');
   }
  });
  const count=queue.states.filter(s=>s==='done').length,part=queue.states.includes('running')?0.25:0;
  q('.progress-fill').style.width=(count+part)/steps.length*100+'%';q('.progress-track').setAttribute('aria-valuenow',count);q('[data-task-count]').textContent=count?`已完成 ${count} 项`:'正在展开任务';
 }
 function followEnd(viewport){
  scrollTarget=viewport;if(scrollFrame||paused)return;
  let previous=performance.now();
  const frame=now=>{
   scrollFrame=0;if(disposed||paused||!root.isConnected||scrollTarget?.dataset.follow==='false')return;
   const el=scrollTarget,target=Math.max(0,el.scrollHeight-el.clientHeight),distance=target-el.scrollTop;
   el.scrollTop=Math.abs(distance)<1||matchMedia('(prefers-reduced-motion: reduce)').matches?target:el.scrollTop+distance*Math.min(1,(now-previous)/(mode==='media'?35:85));
   previous=now;if(Math.abs(target-el.scrollTop)>1)scrollFrame=requestAnimationFrame(frame);
  };scrollFrame=requestAnimationFrame(frame);
 }
 function append(e){
  if(e.type==='start')return;
  const viewport=q(`[data-task-step="${e.stage}"] .task-inline-stream`);if(!viewport)return;
  const list=viewport.firstElementChild;
  for(const message of e.lines||[e.message]){
   const line=document.createElement('li');
   line.className=e.type==='code-batch'?'task-code-line':e.type==='code'?'task-code-line task-result-line':e.source?'task-event-line task-node-line':'task-event-line';
   line.innerHTML=e.type==='code-batch'?`<code>${codeHTML.get(message)??highlightCode(message)}</code>`:e.type==='code'?`<code>${highlightJSON(message)}</code>`:`<span>${esc(message)}</span>${e.source?`<small>实现片段 · ${esc(e.source)}</small>`:''}`;
   list.append(line);rows++;
  }
  if(list.children.length>180)list.firstElementChild.remove();
  if(viewport.dataset.follow!=='false')followEnd(viewport);
 }

 function tick(flush=false){
  if(disposed||!root.isConnected||(paused&&!flush))return;
  if(flush){queue.next=0;queue.entered=0;}
  const event=queue.tick(flush?Number.MAX_SAFE_INTEGER:Date.now());
  waiting.hidden=executionFinished||!!event||queue.pending.length>0||!queue.states.includes('running')||Date.now()-lastEventAt<1200;
  if(!waiting.hidden){const message=`当前任务仍在处理 · 等待返回 ${Math.floor((Date.now()-lastEventAt)/1000)} 秒`;if(waiting.textContent!==message)waiting.textContent=message;}
  if(!event)return;lastEventAt=Date.now();
  if(event.type==='finish'){
   finishPresentation();waiting.hidden=true;clearInterval(timer);return;
  }
  paint();if(event.message||event.lines)append(event);
  const row=q(`[data-task-step="${event.stage}"]`);
  if(row&&event.type==='start')row.querySelector('.task-step-intent').textContent=event.message;
  if(row&&event.type==='done')row.querySelector('.task-step-intent').textContent=event.message;
  if(event.type==='start')status(steps[event.stage]+'，执行中');
  if(event.type==='done')status(steps[event.stage]+'，已完成');
 }
 const waiting=document.createElement('p');waiting.className='task-wait';waiting.hidden=true;waiting.setAttribute('aria-live','off');q('.task-progress').append(waiting);
 const motion=document.createElement('button');motion.type='button';motion.className='task-motion-toggle';motion.textContent='暂停展示';motion.setAttribute('aria-pressed','false');q('.task-progress-meta').append(motion);
 motion.onclick=()=>{
  paused=!paused;motion.textContent=paused?'继续展示':'暂停展示';motion.setAttribute('aria-pressed',String(paused));
  const fill=q('.progress-fill');
  if(paused){
   pausedProgressTarget=fill.style.width;
   const width=fill.getBoundingClientRect().width/q('.progress-track').getBoundingClientRect().width*100;
   fill.style.transition='none';fill.style.width=width+'%';clearTimeout(finishTimer);
  }else{
   void fill.offsetWidth;fill.style.transition='';fill.style.width=pausedProgressTarget;
   if(scrollTarget)followEnd(scrollTarget);
   if(queue.finished&&q('.task-continue').hidden)finishPresentation();
  }
 };
 timer=setInterval(tick,20);
 const next=document.createElement('button');next.type='button';next.className='btn primary task-continue';next.hidden=true;next.innerHTML=`${esc(nextLabel)} <kbd>空格</kbd>`;q('.task-progress').append(next);
 next.onclick=()=>{if(disposed||continued||next.hidden||queue.terminal!=='done')return;continued=true;next.disabled=true;resolveDone(true);onComplete();};
 document.addEventListener('keydown',event=>{
  if(disposed||!root.isConnected||next.hidden||next.disabled||document.querySelector('dialog[open]')||event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return;
  if(event.code!=='Space'&&event.key!==' ')return;
  if(event.target.closest('input,textarea,select,button,summary,a,video,.task-inline-stream,[contenteditable="true"],[role="slider"]'))return;
  event.preventDefault();event.stopImmediatePropagation();next.click();
 },{signal:controller.signal,capture:true});
 q('.task-retry').onclick=()=>onRetry?.();
 return {
  signal:controller.signal,done,
  event(e){
   for(const event of expandTaskEvent(e,queue.timing))queue.push(event);
   tick();
  },
  complete(){
   if(disposed||!root.isConnected)return Promise.resolve(false);
   queue.push({id:'finish',type:'finish'});
   executionFinished=true;
   // Tasks execute independently. The requested full presentation gates only
   // the next-page button, never requests or the actual task completion.
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){
    while(queue.pending.length&&!queue.terminal)tick(true);
   }else tick();
   return done;
  },
  fail(message='本次处理未完成，请重试。',stage){if(disposed)return;queue.fail(stage);clearInterval(timer);clearTimeout(finishTimer);cancelAnimationFrame(scrollFrame);controller.abort();paint();status(message);next.hidden=true;waiting.hidden=true;q('.task-retry').hidden=!onRetry;resolveDone(false);},
  dispose(){disposed=true;stopReplays();clearInterval(timer);clearTimeout(finishTimer);cancelAnimationFrame(scrollFrame);controller.abort();resolveDone(false);},
  get finished(){return queue.finished;},
  get rows(){return rows;},
 };
}

// Producers execute immediately and report facts. Their requests never wait for
// the display queue, and cached speech results can be reused by the player.
export async function runTaskPlan(view,tasks){
 const signal=view.signal;let serial=0,stage=0;
 try{
  for(let i=0;i<tasks.length;i++){
   signal.throwIfAborted();stage=i;const task=tasks[i];
   view.event({id:`${i}:start`,type:'start',stage:i,message:task.start,at:Date.now()});
   const log=(message,code)=>view.event({id:`log:${serial++}`,type:'log',stage:i,message,code,at:Date.now()});
   const node=(key,message,code)=>view.event({id:`node:${serial++}`,type:'log',stage:i,node:key,message,code,at:Date.now()});
   await task.run({signal,log,node});signal.throwIfAborted();
   view.event({id:`${i}:done`,type:'done',stage:i,message:task.complete,at:Date.now()});
  }
  return await view.complete();
 }catch(error){if(!signal.aborted)view.fail(error.name==='TimeoutError'?'处理超时，已保留设置，请重试当前阶段。':'本次处理未完成，请检查网络或语音服务后重试。',stage);return false;}
}

export function checkMedia(url,kind,signal,expectedDuration){
 return new Promise((resolve,reject)=>{
  const media=document.createElement(kind);let timer;
  const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);media.onloadedmetadata=media.onerror=null;media.removeAttribute('src');media.load();error?reject(error):resolve();};
  const abort=()=>finish(new DOMException('已取消','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  media.preload='metadata';media.onloadedmetadata=()=>finish(Number.isFinite(media.duration)&&media.duration>0&&(!Number.isFinite(expectedDuration)||Math.abs(media.duration-expectedDuration)<.15)?null:new Error('媒体时长无效或与对应版本不一致'));media.onerror=()=>finish(new Error('媒体读取失败'));
  timer=setTimeout(()=>finish(new DOMException('媒体读取超时','TimeoutError')),15000);media.src=url;
 });
}
