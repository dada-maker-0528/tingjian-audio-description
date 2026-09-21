export const DEFAULT_PROMPT_RATE=1;
export function promptRate(value){
 const rate=Number(value);
 return Number.isFinite(rate)&&rate>=1&&rate<=5?Math.round(rate*2)/2:DEFAULT_PROMPT_RATE;
}
export const promptRateLabel=value=>`${promptRate(value)} 倍`;
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
