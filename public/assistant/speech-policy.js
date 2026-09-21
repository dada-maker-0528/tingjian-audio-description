import {FIELD_MAP,formatValue} from './schema.js';
const AUTO=new Set(['ready','clarify','error','result','voice-ended','voice-error','answer']);
export function shouldAutoSpeak(event,{guide=true,reader=false,recording=false,typing=false}={}){return guide&&!reader&&!recording&&!typing&&AUTO.has(event);}
export function automaticMessage(event,message=''){
 const text=String(message).trim(),first=text.match(/^.*?[。！？!?]/u)?.[0]||text;
 if(event==='ready')return '修改已整理好，请确认。';
 if(event==='result')return '模拟方案已就绪，请检查。';
 if(event==='voice-ended'){
  if(/正在发送|已停止/.test(text))return '';
  if(/没有识别|未发送/.test(text))return '没有识别到文字，请重试。';
  return '识别完成，回车发送。';
 }
 if(['clarify','error','voice-error'].includes(event))return first;
 if(event==='answer')return text;
 return '';
}
export function assistantKeyAction(event,{enabled=true,editable=false,inputFocused=false,recording=false}={}){
 if(event.isComposing||event.keyCode===229||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return null;
 if(event.key==='Escape'&&recording)return 'cancel';
 if(event.key==='Enter'&&!event.shiftKey){if(recording)return 'finish-send';if(inputFocused)return 'submit';}
 if(enabled&&String(event.key).toLowerCase()==='o'&&(!editable||recording))return recording?'finish':'voice';
 return null;
}
export function spokenChanges(plan,{full=false,characters=[]}={}){
 const changes=plan.changes||[],limit=full?changes.length:4;
 const list=changes.slice(0,limit).map(p=>{
  const person=p.targetCharacterId?characters.find(c=>c.id===p.targetCharacterId)?.name||'指定人物':'';
  if(p.field==='speech_rate')return `旁白语速设为 ${Number(p.value).toFixed(2)} 倍`;
  if(p.field==='narration_gain_db')return p.value===0?'旁白音量恢复基准':`旁白音量${p.value>0?'提高':'降低'} ${Math.abs(p.value)} 分贝`;
  return `${person?person+'的':''}${FIELD_MAP[p.field]?.label||'设置'}改为${formatValue(p.field,p.value)}`;
 });
 const targets=plan.targets||[],scope=targets.length===1?`“${targets[0].title}”`:`选中的 ${targets.length} 个场景`;
 return `这次修改${scope}，共 ${changes.length} 项。${list.join('，')}。${changes.length>limit?'其余修改可选择“听修改指令”了解。':''}${plan.scope==='current_and_following'?'先修改当前场景，满意后后续沿用。':'只处理本次选定的场景。'}选择“确认执行”开始，也可以继续补充要求。`;
}
export const SPEECH_RULES=[
 ['自动播报','进入页面简短报位置；修改或结果就绪时只说一句。需要澄清或失败时保留必要提示。'],
 ['Tab / Shift+Tab','只读控件名称、选中状态和必要的当前值，不加“按钮”等后缀。'],
 ['主动听取','“听修改指令”读完整改动；“听输入文字”核对转写；“再听提示”听完整操作说明。人物介绍与主动请求的内容回答保留。'],
 ['保持安静','模式与分类切换、处理中状态、长提示词、历史记录、整套标签、逐字输入和识别中间结果；不重复念快捷键或整段转写。'],
 ['录音期间','暂停视频、旁白和站内播报；识别结束后再提示。回车只发送文字，不确认执行。'],
 ['语音开关','自动播报跟随操作引导开关；Tab 播报独立控制。读屏优先时关闭站内语音，保留读屏状态。']
];
