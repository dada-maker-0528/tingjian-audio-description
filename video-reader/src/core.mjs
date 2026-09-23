export function parseCommand(raw){
 const text=String(raw).trim().replace(/[，。！？!?、\s]/g,'').replace(/^(请|帮我|给我)/,'');
 if(/^(下一条|下一个|下个|下一个视频|下个视频)+$/.test(text))return {type:'next'};
 if(/^(上一条|上一个|上个|上一个视频|上个视频)+$/.test(text))return {type:'previous'};
 if(/^(暂停|暂停播放|停一下|停止播放|先停一下)$/.test(text))return {type:'pause'};
 if(/^(继续|继续播放|播放|开始播放)$/.test(text))return {type:'play'};
 const seek=text.match(/^(快进|前进|后退|倒退)(\d+|五|十|十五|二十|三十)?秒?$/);
 if(seek){const n=Number(seek[2])||({五:5,十:10,十五:15,二十:20,三十:30})[seek[2]]||5;return {type:'seek',seconds:(seek[1]==='后退'||seek[1]==='倒退'?-1:1)*Math.min(n,60)};}
 return {type:'question',text:String(raw).trim()};
}

export function swipeDirection(dx,dy){return Math.abs(dy)>=50&&Math.abs(dy)>Math.abs(dx)*1.25?(dy<0?1:-1):0;}

export class PlaybackGate{
 constructor(){this.intent=true;this.epoch=0;this.serial=0;this.speech=null;this.input=false;}
 get canPlay(){return this.intent&&!this.input&&!this.speech?.hold;}
 setPlaying(value){this.intent=value;return this.canPlay;}
 beginSpeech(hold){const token=`${this.epoch}:${++this.serial}`;this.speech={token,hold};return token;}
 holdSpeech(token){if(this.speech?.token===token)this.speech.hold=true;}
 finishSpeech(token){if(this.speech?.token!==token)return {valid:false,resume:false};const held=this.speech.hold;this.speech=null;return {valid:true,resume:held&&this.canPlay};}
 cancelSpeech(){this.serial++;this.speech=null;}
 beginInput(){this.cancelSpeech();this.input=true;}
 finishInput(){this.input=false;return this.canPlay;}
 switchClip(){this.epoch++;this.cancelSpeech();this.input=false;}
}

export function keyAction(event,{held=false,editable=false,hasDraft=false,active=false}={}){
 if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return null;
 if(event.key==='Escape')return event.type==='keydown'?'cancel':null;
 if(event.code==='Space'||event.key===' '){if(event.type==='keyup')return held?'release':null;return !editable&&!event.repeat&&!held?'record':null;}
 if(event.type==='keydown'&&event.key==='Enter'&&!event.shiftKey&&(hasDraft||active))return held?'wait-release':'send';
 return null;
}

const errors={'not-allowed':'未获得麦克风权限，可以输入文字或使用下面的演示指令。','service-not-allowed':'此浏览器的识别服务不可用，可以直接输入。','audio-capture':'无法读取麦克风，请检查设备后重试。',network:'语音识别连接失败，未发送。请重试或输入文字。','no-speech':'没有听清，请重新按住空格说话。'};
export class HoldToTalk{
 constructor({factory=()=>{const C=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;return C?new C():null;},onState=()=>{},onText=()=>{},onSend=()=>{},beforeStart=()=>{},timeout=6000}={}){Object.assign(this,{factory,onState,onText,onSend,beforeStart,timeout});this.state='idle';this.serial=0;this.current=null;this.base='';}
 get active(){return ['starting','recording','stopping'].includes(this.state);}
 stateTo(state,message){this.state=state;this.onState(state,message);}
 start(prefix=''){
  if(this.active)return false;let r;try{r=this.factory();}catch{}
  if(!r){this.stateTo('error','当前浏览器不支持语音识别。可以输入文字，或点击演示指令。');return false;}
  this.base=prefix;this.beforeStart();const s={id:++this.serial,r,final:'',interim:'',send:false,released:false};this.current=s;
  const alive=()=>this.current===s&&s.id===this.serial;
  const value=()=>[this.base,s.final+s.interim].filter(Boolean).join(' ');
  r.lang='zh-CN';r.continuous=true;r.interimResults=true;
  r.onstart=()=>{if(!alive()){try{r.abort();}catch{}return;}if(s.released){try{r.stop();}catch{}return;}this.stateTo('recording','正在听，松开空格结束。');};
  r.onresult=e=>{if(!alive())return;let final='',interim='';for(const item of Array.from(e.results)){if(item.isFinal)final+=item[0]?.transcript||'';else interim+=item[0]?.transcript||'';}s.final=final;s.interim=interim;this.onText(value());};
  r.onerror=e=>{if(!alive())return;this.cleanup();this.onText(value());this.stateTo('error',errors[e.error]||'识别未完成，未发送。可以修改文字后发送。');try{r.abort();}catch{}};
  r.onend=()=>{if(!alive())return;this.cleanup();this.onText(value());if(!s.final.trim()||s.interim.trim()){this.stateTo('error',s.interim.trim()?'还有未确认的文字，请核对后再按回车。':'没有识别到新内容，请重试。');return;}this.stateTo('ready','识别完成。回车发送，Esc 取消。');if(s.send){this.state='idle';this.onSend(value());}};
  this.stateTo('starting','正在开启麦克风。首次使用需要浏览器授权。');
  this.durationTimer=setTimeout(()=>{if(alive())this.release();},45000);
  try{r.start();return true;}catch{this.cleanup();this.stateTo('error','麦克风未能启动，可以直接输入文字。');return false;}
 }
 release(){const s=this.current;if(!s||s.released)return false;s.released=true;clearTimeout(this.durationTimer);this.stateTo('stopping','正在确认最后几个字…');this.stopTimer=setTimeout(()=>{if(this.current!==s)return;this.cleanup();this.stateTo('error','识别结束超时，未发送。请检查文字后重试。');try{s.r.abort();}catch{}},this.timeout);try{s.r.stop();}catch{}return true;}
 requestSend(){if(!this.current)return false;this.current.send=true;this.release();return true;}
 cancel(){const s=this.current;this.serial++;this.cleanup();try{s?.r.abort();}catch{}this.onText(this.base);this.stateTo('idle','已取消语音输入。');}
 cleanup(){clearTimeout(this.stopTimer);clearTimeout(this.durationTimer);this.stopTimer=null;this.durationTimer=null;this.current=null;}
}
