const names=['零','一','二','三','四','五','六','七','八','九','十'];
const number=n=>names[n]||String(n);
export const stepNames={upload:'第一步，选择视频',analyzing:'第一步，正在整理视频',roles:'第二步，认识人物',short:'第三步，试听七秒短片',medium:'第四步，试听四十五秒片段',verify:'第四步，七秒复验',full:'第五步，制作完整视频',complete:'第五步，制作完成'};
const navigation='按 Tab 选择下一个操作，按 Shift 加 Tab 返回上一个操作。';
export function roleChoices(roles,{shortcuts=true,review=false,completed=true}={}){
 const done=completed?'人物介绍已结束。':'';
 const replay=shortcuts&&roles.length?roles.slice(0,9).map((r,i)=>`按数字 ${i+1} 再听${r.name}`).join('，')+'。':'可以按 Tab 选择想再听的人物。';
 return done+(review?'你想再听哪位人物，还是返回当前页面？':'你想继续下一步，还是再听哪位人物的介绍？')+replay+(review?'选择返回，或按空格、Esc 关闭介绍。':'选择“继续到七秒试听”，或按空格继续，进入第三步。');
}
export function roleIntroduction(roles,{review=false}={}){
 return (review?'当前是人物介绍。':'当前是第二步，认识人物。')+`已为你整理出${number(roles.length)}位人物，下面按顺序介绍。`;
}
export function roleDescription(film,index){
 const role=film.roles?.[index];if(!role)return '';
 return film.guides?.['role-'+index]||`第${number(index+1)}位，${role.name}。${role.detail||''}`;
}
export function roleTourSteps(film,{index,review=false,shortcuts=true}={}){
 const roles=film.roles||[],single=Number.isInteger(index);
 const steps=single?[]:[{key:'roles',text:roleIntroduction(roles,{review})}];
 const indexes=single?[index]:roles.map((_,i)=>i);
 for(const i of indexes)if(roles[i])steps.push({key:'role-'+i,text:roleDescription(film,i),roleIndex:i});
 if(!roles.length||single&&!roles[index])return steps;
 steps.push({key:'roles-end',text:roleChoices(roles,{review,shortcuts})});
 return steps;
}
export function pageGuide(key,{film={},task,libraryCount=0,filmCount=0,shortcuts=true}={}){
 const short=film.samples?.short?.duration||7,medium=film.samples?.medium?.duration||45;
 const action='按空格播放或暂停。试听后可选择满意继续，也可以选择“和 AI 说说问题”调整旁白。';
 switch(key){
  case 'home':return `当前是首页，你的视频库。公开片库有 ${filmCount} 部影片，当前列表有 ${libraryCount} 个视频。按空格创建新视频，${shortcuts?'也可以按数字键播放对应编号的视频。':'也可以选择影片播放。'}${navigation}`;
  case 'library':return `当前是我的全部视频，共 ${libraryCount} 个条目。可以搜索片名，或选择视频继续观看。${navigation}`;
  case 'upload':return `当前是${stepNames.upload}。可选择本地视频预览，或选择“使用演示视频”体验完整制作流程。${navigation}`;
  case 'analyzing':return `当前是${stepNames.analyzing}。正在为《${film.title||'这段影片'}》准备人物和镜头信息。完成后会进入第二步，先告诉你有多少位人物，再逐个介绍。`;
  case 'roles':return roleIntroduction(film.roles||[]);
  case 'roles-end':return roleChoices(film.roles||[],{shortcuts});
  case 'generating':return `当前是${stepNames[task?.stage]||'准备试听片段'}。正在应用你的设置并准备样片，完成后会告诉你如何试听。`;
  case 'short':return `当前是${stepNames.short}。这段样片长 ${short} 秒。${action}满意后进入第四步，试听 ${medium} 秒。`;
  case 'medium':case 'medium-edited':return `当前是${stepNames.medium}。${task?.mediumEdited?'这是调整后的样片，确认满意后还会进行一次七秒复验。':'沿用你刚才确认的设置。'}${action}`;
  case 'verify':return `当前是${stepNames.verify}。换一个镜头确认刚才的调整是否合适。${action}确认满意后进入第五步，制作完整视频。`;
  case 'full':return `当前是${stepNames.full}。正在按照你确认的设置准备完整影片，完成后会提示你观看或保存。`;
  case 'complete':return `当前是${stepNames.complete}。《${film.title||'你的影片'}》已准备好。选择“播放完整视频”观看，或选择“加入我的视频”保存。${navigation}`;
  case 'watch':return `当前是完整观看页面，影片《${film.title||'当前影片'}》。按空格播放或暂停，也可再听角色介绍，或返回我的视频。${navigation}`;
  case 'chat':return `当前是旁白调整对话，正在修改${stepNames[task?.stage]||'当前步骤'}。在输入框写下你的意见，按回车发送；也可选择示例意见。按 Esc 返回当前步骤。`;
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
