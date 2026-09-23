import {parseCommand,PlaybackGate,keyAction,HoldToTalk,swipeDirection} from './core.mjs';
import {findVideoRegion} from './video-region.mjs';
import {overlayLayout} from './overlay-layout.mjs';
import {clips} from './clips.mjs';
const $=s=>document.querySelector(s),video=$('#video'),audio=$('#reader-audio')||new Audio(),input=$('#input'),gate=new PlaybackGate();
const portrait=document.body.dataset.layout==='portrait',audioBase=document.body.dataset.audioBase||'assets';
const readerSurface=$('[data-reader-surface]');
let index=0,started=false,enabled=false,held=false,switching=false,scanPhase='searching',located=false,userSetMute=false,announced=new Set(),deadline=null,noticeTimer,scanTimer,lockTimer,scanVersion=0,wheelAt=0,dragStart=null,suppressVideoClickUntil=0;
const clip=()=>clips[index],relative=()=>Math.max(0,Math.min(clip().end-clip().start,video.currentTime-clip().start));
const clock=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function notice(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,2600);}
function drawRegion(){
 const candidates=Array.from(document.querySelectorAll('video')).map(element=>{const style=getComputedStyle(element);return {element,bounds:element.getBoundingClientRect(),width:element.videoWidth,height:element.videoHeight,fit:style.objectFit,visible:style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'};});
 const match=findVideoRegion(candidates,{width:innerWidth,height:innerHeight}),frame=$('#scan-frame');located=!!match;frame.hidden=!match&&scanPhase!=='searching';
 const layout=overlayLayout(match?.rect,readerSurface?.getBoundingClientRect(),{width:innerWidth,height:innerHeight},scanPhase==='searching'),target=layout.frame;
 if(target)Object.assign(frame.style,{left:target.left+'px',top:target.top+'px',width:target.width+'px',height:target.height+'px'});
 if(match){$('#caption').style.maxWidth=layout.captionWidth+'px';$('#caption').style.bottom=layout.captionBottom+'px';$('#event-chip').style.top=layout.chipTop+'px';}
 document.body.dataset.scanPhase=scanPhase;
 render();
}
function scan(full=true){
 clearTimeout(scanTimer);clearTimeout(lockTimer);const version=++scanVersion;scanPhase=full?'searching':'following';
 const frame=$('#scan-frame');frame.classList.remove('locking');frame.classList.toggle('scanning',full);drawRegion();
 scanTimer=setTimeout(()=>{if(version!==scanVersion)return;scanPhase='locking';frame.classList.remove('scanning');frame.classList.add('locking');drawRegion();lockTimer=setTimeout(()=>{if(version!==scanVersion)return;scanPhase='locked';frame.classList.remove('locking');drawRegion();},460);},full?1050:240);
}
function render(){
 const capture=gate.input,reading=!!gate.speech;
 const status=capture?(voice.active?'正在听':'待发送'):scanPhase==='searching'?(readerSurface?'扫描屏幕':'扫描页面'):scanPhase==='locking'?'锁定视频':scanPhase==='following'?'跟随新视频':!located?'未找到视频':reading?'讲述中':enabled?'跟随中':'已锁定视频';
 $('#reader-status').textContent=status;$('#region-tag').textContent=scanPhase==='searching'?'正在寻找视频区域':scanPhase==='locking'?'已识别 · 正在锁定':scanPhase==='following'?'检测到视频切换':reading?'听见 · 正在讲述':'听见 · 已锁定视频';$('#scan-frame').classList.toggle('is-reading',reading);
 $('#reader-toggle').textContent=enabled?'停止朗读':'开启朗读';$('#reader-toggle').setAttribute('aria-pressed',String(enabled));
 $('#reader-toggle').disabled=!located||['searching','locking'].includes(scanPhase);
 $('#play').textContent=gate.intent?'暂停':'播放';$('#play').setAttribute('aria-label',gate.intent?'暂停视频':'播放视频');$('#mute').textContent=video.muted?'原声关':'原声开';$('#mute').setAttribute('aria-label',video.muted?'开启原声':'关闭原声');
 const chip=$('#event-chip');chip.hidden=!gate.speech?.hold;if(!chip.hidden)chip.textContent=gate.intent?'视频已暂停，补充后继续':'视频已暂停';
 document.body.classList.toggle('recording',voice.active);
}
function updateTime(){const t=relative();$('#time').textContent=`${clock(t)} / ${clock(clip().end-clip().start)}`;$('#seek').max=clip().end-clip().start;$('#seek').value=t;$('#seek').setAttribute('aria-valuetext',`${clock(t)}，共${clock(clip().end-clip().start)}`);}
function sync(){if(gate.canPlay&&!switching){video.play()?.catch(()=>{gate.setPlaying(false);render();notice('请点击视频继续播放。');});}else video.pause();render();}
function stopAudio(){audio.pause();audio.onended=null;audio.onerror=null;gate.cancelSpeech();deadline=null;$('#caption').hidden=true;}
function finishAudio(token){const result=gate.finishSpeech(token);if(!result.valid)return;audio.pause();deadline=null;$('#caption').hidden=true;if(result.resume)sync();else render();}
function speak(text,file,{hold=true,until=null}={}){stopAudio();const token=gate.beginSpeech(hold);deadline=until===null?null:clip().start+until;$('#caption-text').textContent=text;$('#caption').hidden=false;if(hold)video.pause();render();audio.src=`${audioBase}/${file}.wav`;audio.onended=()=>finishAudio(token);audio.onerror=()=>audioError(token);audio.play().catch(()=>audioError(token));}
function audioError(token){if(gate.speech?.token!==token)return;gate.setPlaying(false);stopAudio();render();notice('旁白未能播放，请点击视频继续。');}
function unlockSound(){if(started)return;started=true;if(!userSetMute)video.muted=false;}
function toggleReader(){unlockSound();enabled=!enabled;if(enabled){const cue=clip().cues[0];if(cue&&!gate.input){announced.add(cue.at);speak(cue.text,cue.audio,{hold:true});}}else{stopAudio();sync();}render();}
function metadata(){const c=clip();$('#clip-title').textContent=c.title;$('#clip-counter').textContent=`${String(index+1).padStart(2,'0')} / 03`;if($('#dy-description'))$('#dy-description').textContent=c.description;video.setAttribute('aria-label',c.title+'，演示视频');if(portrait)video.style.objectPosition=([52,58,50][index])+'% center';updateTime();}
function setMenu(open){$('#quick-menu').hidden=!open;$('#more').setAttribute('aria-expanded',String(open));}
function openCommand(title='输入指令'){setMenu(false);$('#command-panel').hidden=false;$('#command-title').textContent=title;}
function closeCommand(){held=false;input.value='';voice.base='';voice.state='idle';$('#command-panel').hidden=true;updateInput();$('#hold-button').focus({preventScroll:true});}
function selectClip(next){
 if(voice.active||gate.input)voice.cancel();stopAudio();gate.switchClip();closeCommand();setMenu(false);index=(next+clips.length)%clips.length;announced=new Set();gate.setPlaying(true);switching=true;video.pause();metadata();
 if(video.readyState){video.currentTime=clip().start;if(!video.seeking&&Math.abs(video.currentTime-clip().start)<.05){switching=false;sync();}}
 scan(false);render();
}
function seek(seconds){stopAudio();const t=Math.min(clip().end-.08,Math.max(clip().start,video.currentTime+seconds));video.currentTime=t;announced=new Set(clip().cues.filter(c=>c.at<t-clip().start).map(c=>c.at));updateTime();sync();}
function updateInput(){const active=voice.active;input.readOnly=active;$('#send').disabled=!input.value.trim()&&!active;$('#hold-button').setAttribute('aria-pressed',String(active));document.body.classList.toggle('recording',active);}
const voice=new HoldToTalk({
 beforeStart(){unlockSound();stopAudio();gate.beginInput();video.pause();openCommand('正在听你说话');render();},
 onText(text){input.value=text;updateInput();},
 onState(next,text){$('#voice-status').textContent=text;updateInput();if(next==='starting'||next==='recording')openCommand('正在听你说话');if(next==='stopping')$('#command-title').textContent='正在确认文字';if(next==='ready'||next==='error'){openCommand(next==='ready'?'回车发送，Esc 取消':'可以改用文字输入');input.focus({preventScroll:true});}if(next==='error'&&!input.value.trim()){gate.finishInput();sync();}else render();},
 onSend:text=>submit(text)
});
function startRecording(){if(voice.active)return;held=voice.start(input.value);updateInput();}
function releaseRecording(){held=false;if(voice.active)voice.release();updateInput();}
function cancelInput(){held=false;voice.cancel();gate.finishInput();$('#command-panel').hidden=true;updateInput();$('#hold-button').focus({preventScroll:true});sync();}
function submit(raw=input.value){
 const text=String(raw).trim();if(!text)return;if(voice.active){voice.requestSend();return;}unlockSound();stopAudio();const command=parseCommand(text);closeCommand();
 if(command.type==='next'||command.type==='previous'){selectClip(index+(command.type==='next'?1:-1));return;}
 if(command.type==='pause'){gate.setPlaying(false);gate.finishInput();sync();notice('已暂停');return;}
 if(command.type==='play'){gate.setPlaying(true);gate.finishInput();sync();return;}
 if(command.type==='seek'){gate.finishInput();seek(command.seconds);return;}
 gate.finishInput();if(/画面|视频|什么|谁|人物|描述|讲|介绍|细节|衣服|穿/.test(text))speak(clip().detail,clip().detailAudio,{hold:true});else{sync();notice('可以说“下一个”“暂停”，或询问当前画面。');}
}
$('#reader-toggle').onclick=toggleReader;$('#more').onclick=()=>setMenu($('#quick-menu').hidden);
$('#type-command').onclick=()=>{voice.base=input.value;openCommand('输入控制指令');$('#voice-status').textContent='回车发送 · Esc 取消';input.focus();};$('#rescan').onclick=()=>{setMenu(false);scan();};
$('#cancel-input').onclick=cancelInput;$('#send').onclick=()=>{if(held){notice('先松开空格，再发送。');return;}submit();};input.addEventListener('input',updateInput);
$('#next').onclick=()=>selectClip(index+1);$('#previous').onclick=()=>selectClip(index-1);
$('#play').onclick=()=>{if(gate.input)cancelInput();stopAudio();gate.setPlaying(!gate.intent);sync();};$('#mute').onclick=()=>{userSetMute=true;video.muted=!video.muted;render();};
$('#seek').addEventListener('input',e=>seek(clip().start+Number(e.target.value)-video.currentTime));video.onclick=()=>{if(Date.now()>suppressVideoClickUntil)$('#play').click();};
video.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragStart={x:e.clientX,y:e.clientY};video.setPointerCapture(e.pointerId);});
video.addEventListener('pointerup',e=>{if(!dragStart)return;const direction=swipeDirection(e.clientX-dragStart.x,e.clientY-dragStart.y);dragStart=null;if(direction){e.preventDefault();suppressVideoClickUntil=Date.now()+400;selectClip(index+direction);}});
video.addEventListener('pointercancel',()=>dragStart=null);
const holdButton=$('#hold-button');holdButton.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();holdButton.setPointerCapture(e.pointerId);startRecording();});holdButton.addEventListener('pointerup',releaseRecording);holdButton.addEventListener('pointercancel',cancelInput);holdButton.addEventListener('lostpointercapture',()=>{if(held)releaseRecording();});
function keyboard(e){
 const editable=!!e.target.closest('textarea,input,select,[contenteditable=true]');
 if(e.type==='keydown'&&!e.repeat&&!editable&&!voice.active&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.isComposing&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selectClip(index+(e.key==='ArrowDown'?1:-1));return;}
 const action=keyAction(e,{held,editable,hasDraft:!!input.value.trim(),active:voice.active});if(!action)return;e.preventDefault();
 if(action==='record')startRecording();if(action==='release')releaseRecording();if(action==='send')submit();if(action==='wait-release')notice('先松开空格，再按回车发送。');
 if(action==='cancel'){if(voice.active||gate.input||!$('#command-panel').hidden)cancelInput();else if(!$('#quick-menu').hidden){setMenu(false);$('#more').focus();}else{stopAudio();gate.setPlaying(false);sync();}}
}
document.addEventListener('keydown',keyboard);document.addEventListener('keyup',keyboard);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#quick-menu,#more'))setMenu(false);});
window.addEventListener('blur',()=>{if(held||voice.active){gate.setPlaying(false);cancelInput();}});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(voice.active||held)cancelInput();stopAudio();gate.setPlaying(false);video.pause();render();}else drawRegion();});
video.addEventListener('loadedmetadata',()=>{video.currentTime=clip().start;switching=false;metadata();scan();sync();});video.addEventListener('seeked',()=>{if(video.currentTime>=clip().start-.1&&video.currentTime<clip().end){switching=false;sync();drawRegion();}});
video.addEventListener('timeupdate',()=>{
 updateTime();if(switching)return;if(video.currentTime>=clip().end-.04){video.currentTime=clip().start;return;}
 if(gate.speech&&deadline!==null&&video.currentTime>=deadline){gate.holdSpeech(gate.speech.token);video.pause();render();}
 if(!started||!enabled||!located||video.paused||gate.speech||gate.input)return;
 const cue=clip().cues.find(c=>!announced.has(c.at)&&relative()>=c.at&&relative()<c.at+.8);if(cue){announced.add(cue.at);speak(cue.text,cue.audio,{hold:cue.hold,until:cue.until??null});}
});
video.addEventListener('error',()=>{gate.setPlaying(false);render();notice('视频素材未能加载，请保留完整的演示文件夹。');});
for(const event of ['play','pause','ended'])video.addEventListener(event,()=>document.body.classList.toggle('video-playing',!video.paused));
document.querySelectorAll('[data-demo-note]').forEach(button=>button.addEventListener('click',()=>notice(button.dataset.demoNote)));
for(const id of ['like','collect','follow']){const button=$('#'+id);if(button)button.addEventListener('click',()=>{const active=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);if(id==='follow')button.querySelector('span').textContent=active?'✓':'+';});}
video.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)<45||Date.now()-wheelAt<800)return;e.preventDefault();wheelAt=Date.now();selectClip(index+(e.deltaY>0?1:-1));},{passive:false});
new ResizeObserver(drawRegion).observe(video);window.addEventListener('resize',drawRegion);document.addEventListener('fullscreenchange',drawRegion);
metadata();updateInput();scan();render();
