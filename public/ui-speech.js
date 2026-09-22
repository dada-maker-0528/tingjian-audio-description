import {films} from './catalog-config.js';
import {VOICES,VOICE_PREVIEW_TEXT} from './voices.js';

export const HOME_SPACE_HINT='按空格键，首页新建项目，上传页选择文件，播放时暂停或继续。';
export const KEYBOARD_NAV_HINT='Tab 向后，Shift 加 Tab 向前，选中后按回车打开。';
export const NAV_FOCUS_PROMPTS=Object.freeze({home:'首页，导航按钮，按回车进入。',library:'我的视频，导航按钮，按回车进入。','prompt-library':'提示词库，导航按钮，按回车打开。'});
export const STOP_FOCUS_PROMPT='停止提示按钮，按回车停止当前语音；按 Tab 继续浏览。';

// Shared spelling is also the cache identity: whitespace/punctuation alone must not bill again.
export const normalizePrompt=text=>String(text??'').replace(/\s+/g,' ').trim().replace(/[。.!！]+$/u,'')+'。';
const labels=`返回首页|首页|我的视频|停止提示|语音设置|操作帮助|重听提示|创建新视频|开启语音引导|查看全部|搜索我的视频|继续上次制作|重新开始|返回我的视频|上传视频|认识角色|试听短片|试听长一点|完成整片|选择视频文件|粘贴链接|使用演示视频|重听全部|修改角色介绍|角色介绍清楚，继续制作|重听人物介绍|播放|暂停|播放视频|播放／暂停|重新播放|重听本段|后退 10 秒|前进 10 秒|后退10秒|前进10秒|全屏|旁白开启|原片声音|口述字幕开启|口述字幕关闭|口述旁白：开启|口述旁白：关闭|查看本版旁白文字|重新加载|重试加载媒体|切换音色|和 AI 说说问题|满意，继续制作 45 秒|满意，制作完整视频|修改满意，进行短片复验|复验满意，制作完整视频|加入我的视频|已加入我的视频|返回观看|关闭弹窗|关闭对话|完成|试听音色|使用此音色|准备按钮语音|知道了|重置演示|取消|确认重置|继续制作|保存草稿并返回|视频链接|使用预设链接：demo://user-film|开始解析|你的修改意见|开始录音|停止录音|停止录音并转写|重试转写已有录音|提交修改并重做|发送|旁白慢一点|声音大一点|描述少一点|暂停制作|重试／继续制作|重试打开任务|重试上传|返回查看已上传任务|播放完整视频|认识主要人物|语音输入（演示）|说说你的感受`;
const switches=['Tab 焦点播报','在线语音合成','产品语音引导','读屏优先','数字快捷键'];
export const UI_PROMPTS=Object.freeze([...new Set([
 ...labels.split('|'),'全屏播放','查看这一段的旁白文本','查看口述旁白文本','重听这段','从头播放','查看角色介绍','旁白大声一点','模拟语音输入',...switches.flatMap(x=>[x+'，已开启',x+'，已关闭']),
 ...VOICES.map(v=>'选择音色，'+v.label),VOICE_PREVIEW_TEXT,...Object.values(NAV_FOCUS_PROMPTS),STOP_FOCUS_PROMPT,
 '豆包语音暂时不可用，请稍后重试。已准备的提示仍然可以播放。',
 `这里是你的视频库。${KEYBOARD_NAV_HINT}${HOME_SPACE_HINT}按数字键播放当前编号的视频。`,
 '请选择视频文件，或者使用演示视频。',
 '这里是保存的全部视频，可以搜索，也可以继续播放。',
 ...films.flatMap(f=>[
  ...Object.values(f.guides||{}),
  `播放《${f.title}》`,`继续播放《${f.title}》`,
  ...(f.roles||[]).flatMap(r=>[`重听${r.name}介绍`,`重听${r.name}`]),
  `现在是《${f.title}》，时长 ${Math.floor(f.duration/60)} 分 ${Math.floor(f.duration%60).toString().padStart(2,'0')} 秒。按空格播放或暂停。`,
 ]),
 `这里是你的视频库，公开片库有 ${films.length} 部视频。当前列表共 ${films.length} 个条目。${KEYBOARD_NAV_HINT}${HOME_SPACE_HINT}`,
].map(normalizePrompt))]);
