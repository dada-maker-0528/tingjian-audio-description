export const SCHEMA_VERSION=1;
export const GROUPS=[{id:'sound',name:'声音',hint:'音色、语速与音量'},{id:'people',name:'人物',hint:'称呼、外貌与指代'},{id:'action',name:'动作',hint:'动作、表情与视线'},{id:'scene',name:'场景',hint:'地点、人数与环境'},{id:'text',name:'画面文字',hint:'读取类型与方式'},{id:'style',name:'信息与风格',hint:'信息量、重点与措辞'}];
const field=(group,key,label,values,value,help)=>({group,key,label,options:values.map(v=>typeof v==='object'?v:{value:v,label:String(v)}),default:value,help});
export const FIELDS=[
 field('sound','voice_id','音色',[{value:'male',label:'沉稳男声'},{value:'female',label:'清亮女声'},{value:'neutral',label:'中性声线'}],'neutral','音色为生成要求；实际使用的配音另行标注。'),
 field('sound','speech_rate','旁白语速',[{value:.85,label:'慢 · 0.85 倍'},{value:1,label:'标准 · 1.00 倍'},{value:1.15,label:'快 · 1.15 倍'}],1,'只调整旁白，原片画面与原声保持 1.00 倍。'),
 field('sound','narration_gain_db','旁白音量',[{value:-3,label:'较轻 · −3 dB'},{value:0,label:'标准 · 0 dB'},{value:3,label:'较响 · +3 dB'}],0,'相对当前旁白基准；不改变原声音量。'),
 field('sound','delivery','语气',['平稳','温和'],'平稳','平稳：均匀陈述；温和：柔和、舒缓。'),
 field('sound','sentence_pause','句间停顿',[{value:120,label:'紧凑 · 120 毫秒'},{value:220,label:'标准 · 220 毫秒'},{value:350,label:'舒缓 · 350 毫秒'}],220,'先检查音频时长，再放入原片空隙。'),
 field('people','naming_mode','人物称呼',['已揭示姓名','外形称呼','用户别名'],'已揭示姓名','姓名揭示前使用稳定外形称呼；别名只绑定选定人物。'),
 {...field('people','character_alias','用户别名',[],{},'用户称呼不改写原片真实姓名。'),type:'alias'},
 field('people','appearance_detail','外貌内容',['识别版','完整版'],'识别版','识别版：发型与衣服；完整版增加已识别的配饰、发色与体态。'),
 field('people','appearance_timing','外貌介绍时机',['首次出场','首次＋外观变化','每个场景首次'],'首次＋外观变化','换装等信息只使用对应场景记录。'),
 field('people','reference_mode','人物指代',['切换人物点名','每个动作点名'],'切换人物点名','每个动作点名：每个新动作明确人物称呼。'),
 field('action','action_detail','动作描述',['结果','过程','细节'],'过程','细节增加画面中已确认的部位、方向与物体变化。'),
 field('action','expression_detail','表情描述',['关键变化','逐次变化'],'关键变化','只描述可见变化，不推定内心动机。'),
 field('action','gaze_detail','视线描述',['关键视线','每次转移'],'关键视线','说明已识别的视线对象，不补猜视线。'),
 field('action','posture_detail','姿态描述',['动作相关','逐次变化'],'动作相关','使用已确认的站、坐、蹲、转身等变化。'),
 field('scene','scene_intro','地点提示',['每场景开头','地点变化时'],'每场景开头','地点变化时：相邻场景地点相同不重复。'),
 field('scene','people_count','人数提示',['开场播报','开场＋进出变化'],'开场播报','只报该时刻已出现的人；辨认不清时说明人数未确定。'),
 field('scene','spatial_detail','空间关系',['简要关系','详细方位'],'简要关系','详细方位增加已确认的前后左右、远近和遮挡。'),
 field('scene','environment_detail','环境内容',['基础环境','完整环境'],'基础环境','基础：地点与光照；完整：增加已确认的陈设与天气。'),
 field('scene','prop_detail','道具范围',['事件相关','全部已识别'],'事件相关','只使用原片中清晰识别的道具。'),
 field('scene','camera_cue','视角提示',['内容描述','视角＋内容'],'内容描述','视角＋内容：视角变化时先说明画面转向。'),
 {...field('text','text_categories','读取类型',['手机消息','信件纸条','时间地点','人物名条','片名标题','招牌路牌'],['手机消息','信件纸条','时间地点','人物名条'],'多选；补充一种类型会保留其他已选类型。'),type:'set'},
 field('text','text_source','来源介绍',['先报载体','直接读内容'],'先报载体','先报载体：例如“手机短信写着”。'),
 field('text','long_text','长文字处理',['片内摘要','暂停读全文'],'片内摘要','全文阅读由用户主动发起，暂停原片后读取。'),
 field('text','duplicate_text','对白重复',['跳过重复','按请求补读'],'跳过重复','正常播放跳过重复内容；按请求暂停补读。'),
 field('style','information_level','信息量',['精简','标准','丰富'],'标准','始终保留理解剧情所需信息，明确要求的细节优先。'),
 field('style','description_focus','描述重点',['人物动作','空间环境','均衡'],'均衡','只改变描述顺序和重点，不省略必需剧情。'),
 field('style','writing_style','文案风格',['直白口语','中性书面'],'直白口语','只改变措辞，不增添煽情或剧情判断。'),
 field('style','sentence_structure','句子结构',['短句','连贯句'],'短句','短句：一句一个动作；连贯句：连接同一人的连续动作。'),
 field('style','terminology','术语表达',['日常名称','专业名称＋解释'],'日常名称','专业名称第一次出现时提供简短解释。')
];
export const FIELD_MAP=Object.fromEntries(FIELDS.map(f=>[f.key,f]));
export const clone=value=>JSON.parse(JSON.stringify(value));
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function initialTags(legacy){const tags=Object.fromEntries(FIELDS.map(f=>[f.key,clone(f.default)]));tags.characterOverrides={};if(legacy){if(legacy.speed==='slow')tags.speech_rate=.85;if(legacy.gain===1)tags.narration_gain_db=3;if(legacy.density==='concise')tags.information_level='精简';if(legacy.voice)tags.voice_id=legacy.voice==='yunzhou'?'male':legacy.voice==='vivi'?'female':'neutral';}return tags;}
export function formatValue(key,value){if(key==='character_alias')return value||'未设置';const f=FIELD_MAP[key];if(Array.isArray(value))return value.join('、')||'不主动读取';return f?.options.find(o=>o.value===value)?.label??String(value??'未设置');}
export const SCOPE_LABELS={current:'当前场景',specified:'指定场景',current_and_following:'当前场景及后续'};
