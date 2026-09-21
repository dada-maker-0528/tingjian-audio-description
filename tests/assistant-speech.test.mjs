import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantKeyAction,shouldAutoSpeak,spokenChanges,automaticMessage} from '../public/assistant/speech-policy.js';
import {VoiceInput} from '../public/assistant/voice-input.js';
test('O starts only outside editable text, while Enter submits text without bypassing IME or newlines',()=>{
 const key=(key,extra={})=>({key,...extra});
 assert.equal(assistantKeyAction(key('o'),{}),'voice');assert.equal(assistantKeyAction(key('O'),{}),'voice');
 for(const flags of [{editable:true},{enabled:false},{isComposing:true},{repeat:true},{ctrlKey:true},{metaKey:true}]){const event={key:'o',...flags};assert.equal(assistantKeyAction(event,flags),null);}
 assert.equal(assistantKeyAction(key('Enter'),{inputFocused:true}),'submit');
 for(const flags of [{shiftKey:true},{isComposing:true},{keyCode:229},{ctrlKey:true}])assert.equal(assistantKeyAction(key('Enter',flags),{inputFocused:true}),null);
 assert.equal(assistantKeyAction(key('Enter'),{recording:true}),'finish-send');
 assert.equal(assistantKeyAction(key('o'),{recording:true,editable:true}),'finish');
});
test('speech policy reads essential transitions once, never typed text, progress or technical prompts',()=>{
 for(const event of ['ready','clarify','error','result','voice-ended','voice-error','answer'])assert(shouldAutoSpeak(event));
 for(const event of ['enter','scene','mode','category','running','accepted','typing','interim','progress','field','history','full-prompt','parsing'])assert(!shouldAutoSpeak(event));
 assert(!shouldAutoSpeak('ready',{reader:true}));assert(!shouldAutoSpeak('ready',{guide:false}));assert(!shouldAutoSpeak('ready',{recording:true}));
 const text=spokenChanges({changes:[{field:'speech_rate',value:.85},{field:'narration_gain_db',value:3}],scope:'current',targets:[{title:'城市骑行'}]});
 assert.match(text,/0.85/);assert.match(text,/3 分贝/);assert(!text.includes('speech_rate'));assert.match(text,/确认执行/);
});
test('confirmation and result speech preserve the actual proposal, question and next action',()=>{
 const details='我会把旁白放慢到 0.85 倍，动作讲得更详细。先改当前场景，满意后后续沿用。是否确认执行？';
 assert.equal(automaticMessage('ready',details),details);
 const result='模拟方案已就绪，尚未生成新配音。请检查结果，有问题可以继续修改，满意后再继续。';
 assert.equal(automaticMessage('result',result),result);
 const clarification='你说的是哪位人物？请选择景浩或赵总，我会继续整理。';
 assert.equal(automaticMessage('clarify',clarification),clarification);
 assert.equal(automaticMessage('voice-error','未获得麦克风权限。请打开系统设置后重试。'),'未获得麦克风权限。请打开系统设置后重试。');
});
test('compound confirmation covers every requested change and names the actual target scenes',()=>{
 const text=spokenChanges({changes:[{field:'speech_rate',value:.85},{field:'narration_gain_db',value:3},{field:'action_detail',value:'细节'},{field:'reference_mode',value:'每个动作点名'},{field:'character_alias',targetCharacterId:'C01',value:'阿明'},{field:'naming_mode',targetCharacterId:'C01',value:'用户别名'}],scope:'current_and_following',targets:[{number:1,title:'城市骑行'}]},{characters:[{id:'C01',name:'景浩'}]});
 for(const value of ['0.85','3 分贝','动作','每个动作','景浩','阿明','城市骑行','后续','满意','确认执行'])assert(text.includes(value),value);
 assert.match(text,/？/);assert(!text.includes('其余修改'));assert(!text.includes('C01'));
 const specified=spokenChanges({changes:[{field:'action_detail',value:'细节'}],scope:'specified',targets:[{number:2,title:'工友合影'},{number:3,title:'夜间商谈旧手机'}]});
 assert.match(specified,/工友合影/);assert.match(specified,/夜间商谈旧手机/);assert(!specified.includes('后续沿用'));
});
test('incidental progress and dictated text remain quiet',()=>{
 assert.equal(automaticMessage('running','正在执行修改指令，助手保持展开。'),'');
 assert.equal(automaticMessage('voice-ended','识别已结束，正在发送文字。'),'');
 assert.equal(automaticMessage('voice-ended','已停止语音输入，文字已保留。'),'');
 assert(!automaticMessage('voice-ended','语音输入结束。已输入：我的私人修改意见。按回车发送。').includes('私人修改意见'));
 assert.equal(automaticMessage('answer','青年骑车，女孩坐在他身前。'),'青年骑车，女孩坐在他身前。');
});
function rig(extra={}){
 const created=[],states=[],texts=[],sent=[],events=[];
 class FakeRecognition{start(){events.push('start');}stop(){events.push('stop');}abort(){events.push('abort');}}
 const voice=new VoiceInput({factory:()=>{const r=new FakeRecognition();created.push(r);return r;},beforeStart:()=>events.push('silence'),onState:(s,m)=>states.push([s,m]),onText:(t)=>texts.push(t),onSubmit:t=>sent.push(t),...extra});
 return {voice,created,states,texts,sent,events};
}
const result=(text,final)=>Object.assign([{transcript:text}],{isFinal:final});
test('real recognition adapter configures Chinese, silences output first, and updates rather than duplicates interim text',()=>{
 const x=rig();x.voice.start('已有要求');const r=x.created[0];assert.deepEqual(x.events,['silence','start']);assert.equal(r.lang,'zh-CN');assert.equal(r.interimResults,true);
 r.onstart();r.onresult({results:[result('旁白慢',false)]});r.onresult({results:[result('旁白慢一点',true)]});
 assert.equal(x.texts.at(-1),'已有要求\n旁白慢一点');assert.equal(x.sent.length,0);x.voice.cancel();
});
test('Enter stops capture and sends only the final transcript after the recognition session ends',()=>{
 const x=rig();x.voice.start('');const r=x.created[0];r.onstart();r.onresult({results:[result('慢',false)]});x.voice.finish(true);assert.equal(x.sent.length,0);r.onresult({results:[result('旁白慢一点',true)]});r.onend();
 assert.deepEqual(x.sent,['旁白慢一点']);r.onend();assert.equal(x.sent.length,1);assert.equal(x.voice.active,false);
});
test('no automatic send on permission error, empty recording or cancellation; old callbacks cannot overwrite a new session',()=>{
 const x=rig();x.voice.start('原文');const old=x.created[0];old.onerror({error:'not-allowed'});old.onend?.();assert.equal(x.sent.length,0);assert.match(x.states.at(-1)[1],/麦克风/);
 x.voice.start('原文');const next=x.created[1];next.onstart();x.voice.finish(true);next.onend();assert.equal(x.sent.length,0);
 x.voice.start('原文');const r=x.created[2];r.onresult({results:[result('新意见',true)]});x.voice.cancel();const before=x.texts.at(-1);r.onresult?.({results:[result('旧回调',true)]});assert.equal(x.texts.at(-1),before);assert.equal(x.sent.length,0);
});
test('unsupported browsers report the limitation and never substitute a sample sentence',()=>{
 const x=rig({factory:()=>null});assert.equal(x.voice.start('原文'),false);assert.equal(x.sent.length,0);assert.equal(x.texts.length,0);assert.match(x.states.at(-1)[1],/不支持/);
});
test('interim-only end or a stop timeout never sends unconfirmed words',async()=>{
 const x=rig({stopTimeout:8});x.voice.start('');let r=x.created[0];r.onstart();r.onresult({results:[result('还没确定',false)]});x.voice.finish(true);r.onend();assert.equal(x.sent.length,0);
 x.voice.start('');r=x.created[1];r.onstart();x.voice.finish(true);await new Promise(resolve=>setTimeout(resolve,15));assert.equal(x.voice.active,false);assert.equal(x.sent.length,0);assert.match(x.states.at(-1)[1],/超时/);
});
