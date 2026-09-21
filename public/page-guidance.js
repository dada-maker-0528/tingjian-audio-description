const names=['零','一','二','三','四','五','六','七','八','九','十'];
const number=n=>names[n]||String(n);
export const stepNames={upload:'第一步，选择视频',analyzing:'第一步，正在整理视频',roles:'第二步，认识人物',short:'第三步，确认第一个场景',medium:'第四步，确认连续场景',full:'第五步，制作完整视频',complete:'第五步，制作完成'};
const navigation='按 Tab 选择下一个操作，按 Shift 加 Tab 返回上一个操作。';
export function roleChoices(roles,{shortcuts=true,review=false,completed=true}={}){
 const done=completed?'人物介绍结束。':'',count=Math.min(roles.length,9);
 const replay=shortcuts&&count?`数字 ${count===1?'1':'1 至 '+count} 再听，`:'可选择人物再听，';
 return done+(review?'再听还是返回？':'继续还是再听？')+replay+(review?'空格返回。':'空格继续。');
}
export function roleIntroduction(roles,{review=false,sceneCount=0}={}){
 return (review?'人物介绍。':'第二步，认识人物。')+`共${number(roles.length)}位人物。`;
}
export function roleDescription(film,index){
 const role=film.roles?.[index];if(!role)return '';
 return film.guides?.['role-'+index]||`第${number(index+1)}位，${role.name}。${role.detail||''}`;
}
export function roleTourSteps(film,{index,review=false,shortcuts=true}={}){
 const roles=film.roles||[],single=Number.isInteger(index);
 const steps=single?[]:[{key:'roles',text:roleIntroduction(roles,{review,sceneCount:film.scenes?.length})}];
 const indexes=single?[index]:roles.map((_,i)=>i);
 for(const i of indexes)if(roles[i])steps.push({key:'role-'+i,text:roleDescription(film,i),roleIndex:i});
 if(!roles.length||single&&!roles[index])return steps;
 steps.push({key:'roles-end',text:roleChoices(roles,{review,shortcuts})});
 return steps;
}
export function pageGuide(key,{film={},task,libraryCount=0,filmCount=0,shortcuts=true}={}){
 const total=film.scenes?.length||task?.totalScenes||1,count=key==='short'?1:task?.sceneCount||Math.min(3,total);
 const sceneNames=(film.scenes||[]).slice(0,count).map(s=>s.title).join('、');
 const action='按空格播放或暂停。右侧旁白助手保持展开。'+(shortcuts?'在非输入区域按字母 O 开始语音输入，':'选择语音输入开始说话，')+'按回车结束识别并发送文字。也可直接输入意见，回车发送，Shift 加回车换行。先生成修改指令，确认后才执行。';
 switch(key){
  case 'home':return `当前是首页，你的视频库。公开片库有 ${filmCount} 部影片，当前列表有 ${libraryCount} 个视频。按空格创建新视频，${shortcuts?'也可以按数字键播放对应编号的视频。':'也可以选择影片播放。'}${navigation}`;
  case 'library':return `当前是我的全部视频，共 ${libraryCount} 个条目。可以搜索片名，或选择视频继续观看。${navigation}`;
  case 'upload':return `当前是${stepNames.upload}。可选择本地视频预览，或选择“使用演示视频”体验完整制作流程。${navigation}`;
  case 'analyzing':return `当前是${stepNames.analyzing}。正在为《${film.title||'这段影片'}》整理人物和 ${total} 个场景。我们会先介绍人物，再按原片顺序从第一个完整场景开始试听。`;
  case 'roles':return roleIntroduction(film.roles||[],{sceneCount:total});
  case 'roles-end':return roleChoices(film.roles||[],{shortcuts});
  case 'generating':return `当前是${stepNames[task?.stage]||'准备场景试听'}。正在应用你的设置，按原片顺序准备前 ${task?.sceneCount||1} 个完整场景，完成后会提示你试听。`;
  case 'short':return `当前是${stepNames.short}。本次完整播放${film.scenes?.[0]?.title||'第一个场景'}。${action}${total>1?`满意后进入第四步，生成前 ${Math.min(3,total)} 个完整场景。`:'全片只有这一个场景，满意后即可完成整片。'}`;
  case 'medium':return `当前是${stepNames.medium}。本次按原片顺序连续播放前 ${count} 个完整场景${sceneNames?'，依次是'+sceneNames:''}。${action}${count<total?`满意后可以再扩展到 ${count+1} 个场景，也可以直接生成全部 ${total} 个场景。`:'已经包含全部场景，确认满意后完成整片。'}`;
  case 'full':return `当前是${stepNames.full}。正在将你确认的旁白设置应用到全部 ${total} 个场景，并按原片顺序衔接，完成后会提示你观看或保存。`;
  case 'complete':return `当前是${stepNames.complete}。《${film.title||'你的影片'}》已准备好。可以播放完整视频，或加入我的视频保存。有问题也可以选择“修改并重新生成”。${navigation}`;
  case 'watch':return `当前是完整观看页面，影片《${film.title||'当前影片'}》。按空格播放或暂停，也可再听角色介绍。${film.narration?'右侧旁白助手保持展开。'+(shortcuts?'在非输入区域按字母 O 开始语音输入，':'选择语音输入开始说话，')+'按回车结束识别并发送。发送后先检查修改指令，再确认执行。':''}可以返回我的视频。${navigation}`;
  case 'full-review':return `当前是完整视频复看，正在准备第 ${task?.version||1} 版。准备好后按空格试听；满意后保存新版，也可以继续修改。原版会保留。`;
  case 'chat':return `当前是旁白助手，正在修改${stepNames[task?.stage]||'当前步骤'}。侧栏保持展开。按 O 开始语音输入，按回车结束识别并发送。输入框内可直接修改文字，Shift 加回车换行。确认执行和满意并继续是两个独立操作。按 Esc 停止语音输入或播报。`;
  default:return '';
 }
}
export function briefPageGuide(key,{film={},task,libraryCount=0}={}){
 switch(key){
  case 'home':return '首页，视频库。';
  case 'library':return `我的视频，共 ${libraryCount} 部。`;
  case 'upload':return '第一步，选择视频。';
  case 'roles':return roleIntroduction(film.roles||[]);
  case 'roles-end':return roleChoices(film.roles||[]);
  case 'short':return '第三步，首个场景试听。';
  case 'medium':return `第四步，试听前 ${task?.sceneCount||3} 个场景。`;
  case 'complete':return '第五步，整片已就绪。';
  case 'watch':return '完整观看。';
  case 'full-review':return '第五步，复看新版。';
  case 'chat':return '旁白助手。';
  case 'saved':return '已保存到我的视频。';
  default:return '';
 }
}
export class GuideSequence{
 constructor(){this.version=0;this.running=false;}
 cancel(){this.version++;this.running=false;}
 async play(steps,speak,{current=()=>true,onStep=()=>{}}={}){
  const version=++this.version;this.running=true;
  const active=()=>version===this.version&&current();
  try{for(const step of steps){if(!active())return false;onStep(step);if(!await speak(step)||!active())return false;}return true;}
  finally{if(version===this.version)this.running=false;}
 }
}
export function roleKeyAction(event,{active=false,editable=false,shortcuts=true,count=0,review=false}={}){
 if(!active||editable||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return null;
 if(event.code==='Space'||event.key===' ')return {action:review?'return':'continue'};
 if(shortcuts&&/^[1-9]$/.test(event.key)){const index=Number(event.key)-1;if(index<count)return {action:'role',index};}
 return null;
}
