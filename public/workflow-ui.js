import {focusLabel} from './focus-reader.js';
export const WORKFLOW_LABELS=['素材导入','内容解析','样片审校','连续性复核','成片交付'];
export const SPOKEN_STAGE_LABELS=['上传视频','认识角色','试听短片','试听长一点','完成整片'];
export const workflowIndex=stage=>stage==='analyzing'?1:stage==='roles'?1:stage==='short'?2:['medium','verify'].includes(stage)?3:4;
const copy=new Map(Object.entries({
 '分析视频':'内容解析','短片复验':'修订版本复验','上传视频':'素材导入','认识角色':'内容解析','试听短片':'样片审校','试听长一点':'连续性复核','完成整片':'成片交付',
 '01 / 选择素材':'01 / 素材导入','02 / 认识角色':'02 / 内容解析','03 / 试听短片':'03 / 样片审校','04 / 连续试听':'04 / 连续性复核','05 / 制作完成':'05 / 成片交付',
 '先选择你想听的视频':'导入视频素材','从一段视频开始，我们会先介绍故事里的人。':'选择源视频，建立内容解析与口述制作任务。',
 '先认识这段视频中的人物':'人物信息与内容解析','先听 7 秒，找到喜欢的旁白':'7 秒样片审校','再听 45 秒，看看连续观看是否合适':'45 秒连续性复核',
 '用更新后的设置，再确认 7 秒':'修订版本复验','你的故事，现在可以听见了':'口述成片已完成',
 '正在认识这个故事':'正在解析视频内容','按照你确认的方式，完成整段视频':'正在生成完整口述成片','继续准备完整视频':'正在恢复成片生成任务',
 '正在准备另一个镜头的 7 秒复验':'正在准备修订版本复验','正在准备 7 秒样片':'正在生成 7 秒审校样片','正在准备 45 秒样片':'正在生成 45 秒复核样片',
 '这次的旁白设置':'旁白参数配置','等待你试听确认':'待审校确认','稍慢，更从容':'舒缓语速','更清晰':'增强音量','关键画面，少说一点':'精简描述',
 '和 AI 说说问题':'提交修订意见','修改角色介绍':'人物信息反馈','角色介绍清楚，继续制作':'确认内容解析，生成样片',
 '满意，继续制作 45 秒':'确认样片，进入连续性复核','满意，继续制作45秒':'确认样片，进入连续性复核',
 '满意，制作完整视频':'确认复核，生成完整成片','修改满意，进行短片复验':'确认修订，进入版本复验','复验满意，制作完整视频':'确认复验，生成完整成片',
 '先认识故事里的人':'解析人物与场景','听角色介绍，熟悉人物':'核对人物信息与内容结构','先听 7 秒，再听 45 秒':'样片审校与连续性复核',
 '告诉 AI 你的感受，随时调整':'提交修订意见并验证旁白参数','保存，随时再听':'成片交付与归档','喜欢的故事，留在你的视频库':'保存确认版本，支持后续回看',
 '一点点确认，安心听完整片':'分阶段审校，完成口述制作','每一步，都有语音陪伴。':'覆盖内容解析、样片验证与成片交付。',
 '把想看的，变成能听的':'创建口述影像项目','创建新视频':'新建制作项目','创建我的口述影像':'创建制作任务','上传视频，或从演示短片开始':'导入视频素材，或使用预设演示项目',
 '第一次来？从演示短片开始':'预设演示项目','使用演示视频':'载入演示项目','上传视频文件':'导入本地视频','拖到这里，或选择设备上的视频':'拖入视频文件，或从本地设备选择素材',
 '听听声音、节奏和描述。想调整的地方，直接告诉 AI。':'审校旁白音色、语速与描述准确性，按需提交修订意见。',
 '沿用你刚才确认的设置，听听连续的故事是否自然。':'沿用已确认参数，复核连续旁白的衔接、节奏与信息密度。',
 '换一个镜头，确认刚才的调整在后续内容里也合适。':'通过不同片段验证修订参数，确认其对后续内容的适用性。',
 '按照你确认的旁白设置，整段视频已准备好。':'完整口述版本已按确认参数生成，可预览并归档。',
 '加入我的视频':'归档至视频库','已加入我的视频':'已归档至视频库','播放完整视频':'预览完整成片','继续上次制作':'恢复制作任务',
 '重新开始':'新建制作任务','重听这段':'重新播放样片','重听全部':'播放全部介绍','修改当前试听短片':'样片修订','修改当前试听长一点':'连续性复核修订',
 '应用本次旁白设置':'绑定旁白参数','准备对应样片版本':'构建审校样片','检查播放资源':'媒体完整性校验','准备完整旁白版本':'构建完整旁白版本',
 '整理人物介绍':'人物信息解析','读取视频与场景':'素材与场景解析','检查试听范围':'审校范围校验','准备对应旁白版本':'构建旁白版本',
}));
function visualText(text){
 if(copy.has(text))return copy.get(text);
 if(/^样片版本 \d+ · /.test(text))return text.replace('等待你试听确认','待审校确认');
 if(/^上次制作停在「/.test(text))return text.replace('上次制作停在','当前项目阶段').replace('认识角色','内容解析').replace('7 秒样片','样片审校').replace('45 秒样片','连续性复核').replace('完整制作','成片生成');
 if(/^先介绍片中的 \d+ 位主要人物。先熟悉他们，听起来就更容易。$/.test(text))return text.replace(/^先介绍片中的 (\d+) 位主要人物。.*$/,'已整理 $1 位主要人物，供核对身份、特征与出场信息。');
 return text;
}
export function setVisibleCopy(element,text){
 if(!element)return;
 const old=element.cloneNode(true);old.querySelectorAll('[aria-hidden="true"]').forEach(el=>el.remove());
 const wrap=document.createElement('span');wrap.dataset.visualCopy='';
 const visible=document.createElement('span');visible.setAttribute('aria-hidden','true');visible.textContent=text;
 const spoken=document.createElement('span');spoken.className='sr-only';spoken.textContent=old.textContent;
 wrap.append(visible,spoken);element.replaceChildren(wrap);
}
// Visible terminology and spoken guidance deliberately have separate channels.
// Exact UI strings only: never rewrite media transcripts, user content or code.
export function applyWorkflowCopy(root){
 if(!root?.isConnected)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),changes=[];
 while(walker.nextNode()){
  const node=walker.currentNode,parent=node.parentElement;
  if(!parent||parent.closest('[data-visual-copy],.sr-only,script,style,code,textarea,input,option,.chat-bubble,#transcript-text,.role-card p,.film-card h3'))continue;
  const old=node.textContent.trim(),next=visualText(old);if(next!==old)changes.push({node,parent,old,next});
 }
 for(const {node,parent,old,next} of changes){
  const control=parent.closest('button,summary,a,[role="button"]');
  if(control&&control.tagName!=='SUMMARY'&&!control.hasAttribute('data-focus-label'))control.dataset.focusLabel=focusLabel(control);
  const span=document.createElement('span');span.dataset.visualCopy='';
  const visible=document.createElement('span');visible.setAttribute('aria-hidden','true');visible.textContent=next;
  const spoken=document.createElement('span');spoken.className='sr-only';spoken.textContent=old;
  span.append(visible,spoken);node.replaceWith(span);
 }
}
export function installWorkflowCopy(){
 const observer=new MutationObserver(records=>{const roots=new Set();for(const r of records){const el=r.target.nodeType===Node.TEXT_NODE?r.target.parentElement:r.target;if(el?.nodeType===Node.ELEMENT_NODE&&!el.closest('[data-visual-copy],.sr-only'))roots.add(el);}for(const root of roots)applyWorkflowCopy(root);});
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});applyWorkflowCopy(document.body);
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}
