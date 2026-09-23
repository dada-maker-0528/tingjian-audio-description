import {focusLabel} from './focus-reader.js';

// Refresh on route/dialog changes and voice changes. Only prepare sounds: never
// play them, request microphone access, or change the user's guidance settings.
export function installAudioPreload({speech,enabled,voice,guides}){
 let timer;const controls='button,a[href],input:not([type="hidden"]):not([type="range"]),select,textarea,summary,[role="button"]';
 const refresh=()=>{
  if(document.hidden||!enabled())return;
  const labels=[...document.querySelectorAll(controls)].filter(e=>e.getClientRects().length&&!e.disabled).map(focusLabel).filter(t=>t&&t.length<=160);
  speech.warmGuides([...labels,...guides()],voice());
 };
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(refresh,80);};
 const observer=new MutationObserver(schedule);
 observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-checked','aria-pressed','disabled','hidden']});
 document.addEventListener('change',schedule);document.addEventListener('visibilitychange',schedule);
 // Browsers initialize their built-in voice list lazily, even in offline mode.
 globalThis.speechSynthesis?.getVoices();
 window.addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(timer);document.removeEventListener('change',schedule);document.removeEventListener('visibilitychange',schedule);},{once:true});
 schedule();return refresh;
}
