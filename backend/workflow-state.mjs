import {randomUUID} from 'node:crypto';
import {DEFAULT_VOICE,isVoice} from '../public/voices.js';

export const preferences=()=>({speed:1,gain:.88,density:'balanced',voice:DEFAULT_VOICE});
export const newWorkflow=()=>({schema:1,revision:0,stage:'analyzing',status:'idle',candidate:preferences(),confirmed:null,settingsVersion:1,mediumEdited:false,verifiedVersion:null,current:null,history:[],requests:[],message:'已保存视频，正在准备分析',saved:false,position:0,roles:[],events:[]});
export function sampleRange(p,stage) {
  const w=p.workflow,duration=p.duration;
  if(stage==='full')return {start:0,end:duration};
  const short=w.ranges?.short;
  if(stage==='medium')return {start:short.start,end:Math.min(duration,short.start+45)};
  const available=[];
  for(const scene of p.scenes||[])for(const gap of p.windows||[]){
    const from=Math.max(scene.start,gap.start),to=Math.min(scene.end,gap.end);
    if(to-from<1.8||scene.category==='none')continue;
    const preferred=from-scene.start<=5?scene.start:from-.25;
    const start=Math.max(0,Math.min(preferred,duration-7));
    if(stage==='verify'&&short&&Math.abs(start-short.start)<1)continue;
    available.push({start,end:Math.min(duration,start+7),score:Math.min(to,start+7)-from});
  }
  available.sort((a,b)=>b.score-a.score||a.start-b.start);
  if(stage==='verify')available.sort((a,b)=>(Number(b.start>=(w.ranges.medium?.end||0))-Number(a.start>=(w.ranges.medium?.end||0))));
  const range=available.find(r=>r.score>=1.8);
  if(!range)throw new Error(stage==='verify'?'未找到不同于初次样片且有旁白空间的复验片段，已保留当前版本。':'未找到有足够旁白空间的短样片，已保留视频和分析结果。');
  return {start:range.start,end:range.end};
}
export function nextStage(w){
  if(w.stage==='roles')return 'short';
  if(w.stage==='short')return 'medium';
  if(w.stage==='medium')return w.mediumEdited?'verify':'full';
  if(w.stage==='verify')return 'full';
  throw new Error('当前阶段不能继续确认');
}
export function feedbackChange(text,current){
  text=String(text||'').trim();
  if(!text||text.length>500)throw new Error('请用500字以内说明想调整什么');
  if(/不要|不用|别|不是|不想|只改|这句话|那句话|改名|称呼/.test(text))return {ok:false,message:'尚未更改。当前支持整段旁白的语速、音量、信息量；单句或角色修改暂不支持，请说明希望调整的方向。'};
  const slow=/慢一点|放慢|太快/.test(text),fast=/快一点|自然语速|太慢/.test(text),loud=/旁白.{0,5}(大声|太小|响|提高|大一点)|提高旁白音量/.test(text),quiet=/旁白.{0,5}(小声|太大|轻|降低|小一点)|降低旁白音量/.test(text),less=/少一点|简洁|精简|太多/.test(text),more=/多一点|详细|太少/.test(text);
  if((slow&&fast)||(loud&&quiet)||(less&&more))return {ok:false,message:'意见中有相反方向，请只说明一个方向，原设置已保留。'};
  if(!slow&&!fast&&!loud&&!quiet&&!less&&!more&&!/重新生成|重做/.test(text))return {ok:false,message:'这条意见尚未执行。可以说“旁白慢一点”“旁白大声一点”“描述少一点”或“重做当前片段”。'};
  if(/音量|声音/.test(text)&&!/旁白/.test(text))return {ok:false,message:'请说明是否调整旁白，例如“旁白大声一点”；原视频声音不会改变。'};
  const residue=text.replace(/旁白|语速|声音|音量|信息量|信息|描述|慢一点|放慢|太快|快一点|自然语速|太慢|大声一点|大声|太小|响一点|提高|大一点|小声一点|小声|太大|轻一点|降低|小一点|少一点|简洁|精简|太多|多一点|详细|太少|重新生成|重做|当前片段|这一段|这段|请|帮我|把|让|和|再|，|。|、|\s/g,'');
  if(residue)return {ok:false,message:'这条意见含有当前无法执行的要求，未修改任何设置。请一次说明旁白语速、音量或描述量的调整。'};
  const candidate={...current};if(slow)candidate.speed=.8;if(fast)candidate.speed=1;if(loud)candidate.gain=1;if(quiet)candidate.gain=.65;if(less)candidate.density='concise';if(more)candidate.density='detailed';
  return {ok:true,candidate,message:'正在重做当前片段。试听确认后才将设置用于后续内容。'};
}
export function newVersion(w,range){return {id:randomUUID(),stage:w.stage,...range,settings:{...w.candidate},settingsVersion:w.settingsVersion,parts:[],result:null};}
export function validatePreferences(value){return value&&[1,.8].includes(value.speed)&&[.65,.88,1].includes(value.gain)&&['balanced','concise','detailed'].includes(value.density)&&isVoice(value.voice);}
