import {FIELD_MAP,formatValue} from './schema.js';
const AUTO=new Set(['ready','clarify','error','result','voice-ended','voice-error','answer']);
export function shouldAutoSpeak(event,{guide=true,reader=false,recording=false,typing=false}={}){return guide&&!reader&&!recording&&!typing&&AUTO.has(event);}
export function automaticMessage(event,message=''){
 const text=String(message).trim();
 if(event==='voice-ended'){
  if(/正在发送|已停止/.test(text))return '';
  if(/没有识别|未发送/.test(text))return '没有识别到文字，请重试。';
  return '识别完成，回车发送。';
 }
 if(['ready','result','clarify','error','voice-error','answer'].includes(event))return text;
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
 if(plan.valid===false)return (plan.errors||[]).join(' ');
 const changes=plan.changes||[];
 if(!changes.length)return '当前没有待执行的修改，可以继续描述你的要求。';
 const list=changes.filter(p=>full||!(p.field==='naming_mode'&&p.value==='用户别名'&&changes.some(a=>a.field==='character_alias'&&a.targetCharacterId===p.targetCharacterId&&a.value))).map(p=>{
  const person=p.targetCharacterId?characters.find(c=>c.id===p.targetCharacterId)?.name||'指定人物':'';
  if(full)return `${person?person+'的':''}${FIELD_MAP[p.field]?.label||'设置'}从${formatValue(p.field,p.before)}改为${formatValue(p.field,p.value)}`;
  if(p.field==='speech_rate')return `把旁白语速设为 ${Number(p.value).toFixed(2)} 倍`;
  if(p.field==='narration_gain_db')return p.value===0?'旁白音量恢复基准':`旁白音量${p.value>0?'提高':'降低'} ${Math.abs(p.value)} 分贝`;
  if(p.field==='character_alias')return p.value?`把${person}称作“${p.value}”`:`取消${person}的别名`;
  if(p.field==='action_detail')return {细节:'把动作讲得更详细',过程:'说明动作过程',结果:'只讲动作结果'}[p.value];
  if(p.field==='reference_mode')return `${person?person+'的动作中，':''}${p.value==='每个动作点名'?'每个动作都点明人物':'切换人物时点名'}`;
  if(p.field==='voice_id')return `旁白换成${formatValue(p.field,p.value)}`;
  if(p.field==='text_categories'&&Array.isArray(p.before)){
   const added=p.value.filter(v=>!p.before.includes(v)),removed=p.before.filter(v=>!p.value.includes(v));
   return [added.length?'增加读取'+added.join('、'):'',removed.length?'不再读取'+removed.join('、'):''].filter(Boolean).join('，');
  }
  return `${person?person+'的':''}${FIELD_MAP[p.field]?.label||'设置'}改为${formatValue(p.field,p.value)}`;
 });
 const targets=plan.targets||[],names=targets.map(t=>`${t.number?'场景 '+t.number:''}“${t.title}”`).join('、');
 const scope=plan.scope==='current_and_following'?`先改${names}，满意后后续场景沿用。`:`只改${names}。`;
 return `我准备这样调整：${list.join('，')}。${scope}原片画面和原声保持不变。\n是否按这个方案生成模拟结果？选择“确认执行”，或继续补充要求。`;
}
export function resultGuidance(result,{canContinue=false,acceptedIds=[]}={}){
 const items=result?.candidates||[],remaining=items.filter(c=>!acceptedIds.includes(c.id)).length;
 const next=canContinue?'满意并继续':'满意并完成';
 return `${items.length} 个场景的模拟方案已就绪，尚未生成新配音。请检查文案与参数：有问题选择“继续修改”；${items.length>1&&remaining?`满意的场景选择“确认这个场景的方案”，全部确认后选择“${next}”。`:`满意则选择“${next}”。`}`;
}
export const SPEECH_RULES=[
 ['自动播报','进入页面简短报位置；修改就绪时说明怎么改、改哪些场景，再询问是否执行；结果就绪后说明检查与继续方式。澄清和失败保留原因及处理方法。'],
 ['Tab / Shift+Tab','只读控件名称、选中状态和必要的当前值，不加“按钮”等后缀。'],
 ['主动听取','“听修改指令”读完整改动；“听输入文字”核对转写；“再听提示”听完整操作说明。人物介绍与主动请求的内容回答保留。'],
 ['保持安静','模式与分类切换、处理中状态、长提示词、历史记录、整套标签、逐字输入和识别中间结果；不重复念快捷键或整段转写。'],
 ['录音期间','暂停视频、旁白和站内播报；识别结束后再提示。回车只发送文字，不确认执行。'],
 ['语音开关','自动播报跟随操作引导开关；Tab 播报独立控制。读屏优先时关闭站内语音，保留读屏状态。']
];
