import {LiveRecognition} from './live-recognition.js';
const ERRORS={
 'not-allowed':'未获得麦克风权限。请允许本网站使用麦克风后重试，也可以直接输入文字。',
 'service-not-allowed':'当前浏览器的语音识别服务不可用。请换用支持语音识别的浏览器，或直接输入文字。',
 'audio-capture':'无法读取麦克风。请检查设备是否可用，以及系统的麦克风权限。',
 network:'语音识别服务连接失败。已保留文字，请检查网络后重试，或直接输入。',
 'no-speech':'没有识别到语音。可以按 O 重试，或直接输入文字。',
 aborted:'语音输入已停止，文字已保留。'
};
export const recognitionConstructor=()=>globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
export class VoiceInput{
 constructor({factory=()=>new LiveRecognition(),beforeStart=()=>{},onState=()=>{},onText=()=>{},onSubmit=()=>{},stopTimeout=30000,maxDuration=60000}={}){
  Object.assign(this,{factory,beforeStart,onState,onText,onSubmit,stopTimeout,maxDuration});this.state='idle';this.serial=0;this.current=null;
 }
 get active(){return ['starting','listening','stopping'].includes(this.state);}
 setState(state,message){this.state=state;this.onState(state,message);}
 start(prefix=''){
  if(this.active)return false;
  const retry=this.retrySession;this.retrySession=null;if(retry)prefix=retry.prefix;
  let recognition;try{recognition=retry?.recognition||this.factory();}catch{recognition=null;}
  if(!recognition){this.setState('error','当前浏览器不支持麦克风语音识别。请在支持此功能的浏览器中打开本站，也可以直接输入文字。');return false;}
  this.beforeStart();const id=++this.serial;
  const session={id,recognition,prefix:prefix.trim(),final:'',interim:'',send:false,failed:false};this.current=session;
  const alive=()=>this.current===session&&this.serial===id;
  const text=(includeInterim=true)=>[session.prefix,session.final+(includeInterim?session.interim:'')].filter(Boolean).join('\n');
  recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
  recognition.onnotice=message=>{if(alive())this.setState(this.state,message);};
  recognition.onstart=()=>{if(!alive()){try{recognition.abort();}catch{}return;}this.setState('listening','正在听你说话。按 Enter 结束识别并发送，再按 O 只结束识别，Esc 停止。');this.durationTimer=setTimeout(()=>{if(alive())this.finish(false);},this.maxDuration);};
  recognition.onresult=event=>{
   if(!alive())return;let final='',interim='';for(let i=0;i<event.results.length;i++){const result=event.results[i],words=result[0]?.transcript||'';if(result.isFinal)final+=words;else interim+=words;}
   session.final=final;session.interim=interim;this.onText(text(),{final:!interim,recording:true});
  };
  recognition.onerror=event=>{if(!alive())return;session.failed=true;if(event.recordings?.length)this.retrySession={recognition,prefix:session.prefix};this.cleanup();this.onText(text(),{final:!session.interim,recording:false});this.setState('error',(event.message||ERRORS[event.error]||'语音识别失败。')+(this.retrySession?' 录音已保留，点击语音或按 O 重试识别，不用重说。':''));try{recognition.abort();}catch{}};
  recognition.onend=()=>{
   if(!alive())return;this.cleanup();const value=text();this.onText(value,{final:!session.interim,recording:false});
   if(session.interim.trim()){this.setState('error','部分识别文字尚未确认，未自动发送。请检查输入框中的文字，再按回车发送。');return;}
   if(!session.final.trim()){this.setState('idle','没有识别到新的文字，未发送。可以按 O 重试。');return;}
   if(session.send){this.setState('idle','识别已结束，正在发送文字。');this.onSubmit(value);}else this.setState('idle',`语音输入结束。已输入：${session.final.length>90?session.final.slice(0,90)+'。还有更多文字，可选择“听输入文字”。':session.final}按回车发送，或先修改文字。`);
  };
  this.setState('starting','正在请求麦克风。首次使用请在浏览器提示中允许。');
  try{if(retry){this.setState('stopping','正在重试识别保留的录音，不用重说。');recognition.retry();}else recognition.start();return true;}catch(error){if(alive()){this.cleanup();this.setState('error',error.name==='NotAllowedError'?ERRORS['not-allowed']:'语音输入未能启动，请重试或直接输入文字。');}return false;}
 }
 finish(send=false){
  const session=this.current;if(!session||this.state==='stopping')return false;session.send=send;clearTimeout(this.durationTimer);this.setState('stopping',send?'正在结束识别，拿到最终文字后发送。':'正在结束识别。');
  this.stopTimer=setTimeout(()=>{if(this.current!==session)return;if(session.recognition.saved?.length)this.retrySession={recognition:session.recognition,prefix:session.prefix};this.cleanup();this.setState('error','结束识别超时，未自动发送。文字已保留。'+(this.retrySession?'录音已保留，点击语音重试识别，不用重说。':'请检查后手动发送。'));try{session.recognition.abort();}catch{}},this.stopTimeout);
  try{session.recognition.stop();}catch{this.cleanup();this.setState('error','结束识别失败，文字已保留，未自动发送。');try{session.recognition.abort();}catch{}}return true;
 }
 cancel({silent=false}={}){
  const session=this.current;if(!session)return false;const value=[session.prefix,session.final+session.interim].filter(Boolean).join('\n');this.cleanup();this.serial++;this.onText(value,{final:!session.interim,recording:false});this.state='idle';try{session.recognition.abort();}catch{}if(!silent)this.onState('idle','已停止语音输入，文字保留在输入框中，检查后可按回车发送。');return true;
 }
 cleanup(){clearTimeout(this.durationTimer);clearTimeout(this.stopTimer);this.durationTimer=null;this.stopTimer=null;this.current=null;this.state='idle';}
}
