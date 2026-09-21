export const DEFAULT_PROMPT_RATE=1;
export const PROMPT_CHANNELS=Object.freeze([
 {id:'focus',label:'Tab 播报语速',hint:'选中按钮、输入框等操作时的名称播报。'},
 {id:'guide',label:'操作引导语速',hint:'当前步骤说明和“再听提示”。'},
 {id:'role',label:'角色介绍语速',hint:'逐个或连续播放人物介绍。'}
]);
export function promptRate(value){
 const rate=Number(value);
 return Number.isFinite(rate)&&rate>=1&&rate<=5?Math.round(rate*2)/2:DEFAULT_PROMPT_RATE;
}
export const promptRateLabel=value=>`${promptRate(value)} 倍`;
export const promptRates=saved=>Object.fromEntries(PROMPT_CHANNELS.map(({id})=>[id,promptRate(saved?.[id])]));
export const rateForGuide=(key,rates)=>promptRate(rates?.[/^role-\d+$/.test(key)?'role':'guide']);
export function setChannelRate(rates,channel,value){
 if(!PROMPT_CHANNELS.some(({id})=>id===channel))throw new Error('Unknown prompt channel');
 return {...promptRates(rates),[channel]:promptRate(value)};
}
export const promptText=value=>String(value??'').replace(/重听/g,'再听');
export function applyPromptAudioRate(audio,rate){
 audio.defaultPlaybackRate=promptRate(rate);
 audio.playbackRate=promptRate(rate);
 audio.preservesPitch=true;
}
export function promptUtterance(text,rate){
 const utterance=new SpeechSynthesisUtterance(promptText(text));
 utterance.lang='zh-CN';utterance.rate=promptRate(rate);
 const voices=globalThis.speechSynthesis?.getVoices()||[];
 const local=voices.find(v=>v.localService&&/^zh[-_]CN/i.test(v.lang))||voices.find(v=>v.localService&&/^zh/i.test(v.lang));
 if(local)utterance.voice=local;
 return utterance;
}
