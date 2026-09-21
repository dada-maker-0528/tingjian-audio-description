const CONTROLS='button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="switch"],[role="slider"]';
export function preloadFocusPrompts({warm,enabled,voice}){
 let timer;
 const refresh=()=>{if(enabled())warm([...document.querySelectorAll(CONTROLS)].filter(e=>e.getClientRects().length&&!e.disabled).map(focusLabel).filter(Boolean),voice());};
 const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(refresh,30);});
 observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','data-focus-label','aria-checked']});
 refresh();window.addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(timer);},{once:true});
}
export function focusLabel(element){
 const referenced=element.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>element.ownerDocument.getElementById(id)?.textContent||'').join(' ');
 let label=element.getAttribute('data-focus-label')||element.getAttribute('aria-label')||referenced;
 if(!label&&element.labels?.length)label=[...element.labels].map(x=>x.textContent).join(' ');
 if(!label){const copy=element.cloneNode(true);copy.querySelectorAll('svg,[aria-hidden="true"],kbd').forEach(x=>x.remove());label=copy.textContent||element.getAttribute('title')||element.getAttribute('placeholder');}
 label=String(label||'').replace(/\s+/g,' ').trim();if(!label)return '';
 const tag=element.tagName.toLowerCase(),role=element.getAttribute('role'),type=element.getAttribute('type');
 if(tag==='select')return `${label}，${element.selectedOptions?.[0]?.textContent||'未选择'}。`;
 if(role==='switch'||type==='checkbox')return `${label}，${element.getAttribute('aria-checked')==='true'||element.checked?'已开启':'已关闭'}。`;
 if(type==='range'||role==='slider')return `${label}，${element.getAttribute('aria-valuetext')||element.value||''}。`;
 return label;
}
export class FocusReader{
 constructor({enabled,beforeSpeak,status,audioSource}){this.enabled=enabled;this.beforeSpeak=beforeSpeak;this.status=status;this.audioSource=audioSource;this.keyboard=false;this.sequence=0;this.timer=null;this.audio=new Audio();}
 start(){
  document.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.keyboard=true;this.stop();}},true);
  document.addEventListener('pointerdown',()=>{this.keyboard=false;this.stop();},true);
  document.addEventListener('focusin',e=>{const el=e.target.closest?.(CONTROLS);if(this.keyboard&&el&&this.enabled())this.read(el);},true);
  document.addEventListener('change',e=>{if(this.keyboard&&e.target===document.activeElement&&e.target.matches('select,[role="switch"],input[type="checkbox"],input[type="range"]')&&this.enabled())this.read(e.target);});
 }
 stop(){this.sequence++;clearTimeout(this.timer);this.abort?.abort();this.abort=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();if(this.status)this.status.dataset.state='idle';}
 read(el){
  this.stop();let label=focusLabel(el);if(!label)return;const token=this.sequence;
  this.timer=setTimeout(async()=>{if(token!==this.sequence||el!==document.activeElement||!this.enabled())return;
   this.beforeSpeak();label=focusLabel(el);if(!label)return;
   this.abort=new AbortController();this.render(label,'pending');
   try{
    const src=await this.audioSource(label,this.abort.signal);
    if(token!==this.sequence||el!==document.activeElement||!this.enabled())return;
    this.audio.src=src;this.audio.onended=()=>{if(token===this.sequence)this.render(label,'idle');};
    this.audio.onerror=()=>{if(token===this.sequence)this.render(label,'unavailable');};
    await this.audio.play();if(token!==this.sequence)return;
    this.render(label,'speaking');if(this.status){this.status.dataset.spokenLabel=label;this.status.dataset.provider='volcengine';}
   }catch{if(token===this.sequence)this.render(label,'unavailable');}
  },0);
 }
 render(label,state){if(!this.status)return;this.status.hidden=false;this.status.dataset.state=state;this.status.textContent=state==='unavailable'?'豆包提示音暂未开始，可在语音设置中重试。':'当前焦点：'+label;}
}
