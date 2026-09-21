const CONTROLS='button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="switch"],[role="slider"]';
export function focusLabel(element){
 const referenced=element.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>element.ownerDocument.getElementById(id)?.textContent||'').join(' ');
 let label=element.getAttribute('aria-label')||referenced;
 if(!label&&element.labels?.length)label=[...element.labels].map(x=>x.textContent).join(' ');
 if(!label){const copy=element.cloneNode(true);copy.querySelectorAll('svg,[aria-hidden="true"],kbd').forEach(x=>x.remove());label=copy.textContent||element.getAttribute('title')||element.getAttribute('placeholder');}
 label=String(label||'').replace(/\s+/g,' ').trim();if(!label)return '';
 const tag=element.tagName.toLowerCase(),role=element.getAttribute('role'),type=element.getAttribute('type');
 if(tag==='select')return `${label}，下拉选择，当前是${element.selectedOptions?.[0]?.textContent||'未选择'}。`;
 if(role==='switch'||type==='checkbox')return `${label}，${role==='switch'?'开关':'复选框'}，${element.getAttribute('aria-checked')==='true'||element.checked?'已开启':'已关闭'}。`;
 if(type==='range'||role==='slider')return `${label}，滑块，${element.getAttribute('aria-valuetext')||element.value||''}。`;
 if(tag==='input'||tag==='textarea')return `${label}，输入框。`;
 if(tag==='summary')return `${label}，展开按钮，${element.parentElement?.open?'已展开':'已收起'}。`;
 if(tag==='a')return `${label}，链接。`;
 const pressed=element.getAttribute('aria-pressed');return `${label}，按钮${pressed!==null?'，'+(pressed==='true'?'已开启':'已关闭'):''}。`;
}
export class FocusReader{
 constructor({enabled,beforeSpeak,status}){this.enabled=enabled;this.beforeSpeak=beforeSpeak;this.status=status;this.keyboard=false;this.sequence=0;this.timer=null;}
 start(){
  document.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.keyboard=true;this.stop();}},true);
  document.addEventListener('pointerdown',()=>{this.keyboard=false;this.stop();},true);
  document.addEventListener('focusin',e=>{const el=e.target.closest?.(CONTROLS);if(this.keyboard&&el&&this.enabled())this.read(el);},true);
  document.addEventListener('change',e=>{if(this.keyboard&&e.target===document.activeElement&&e.target.matches('select,[role="switch"],input[type="checkbox"],input[type="range"]')&&this.enabled())this.read(e.target);});
 }
 stop(){this.sequence++;clearTimeout(this.timer);if(this.activeUtterance){window.speechSynthesis?.cancel();this.activeUtterance=null;}if(this.status)this.status.dataset.state='idle';}
 read(el){
  this.stop();let label=focusLabel(el);if(!label)return;const token=this.sequence;
  this.timer=setTimeout(()=>{if(token!==this.sequence||el!==document.activeElement||!this.enabled())return;
   this.beforeSpeak();label=focusLabel(el);if(!label)return;if(!window.speechSynthesis){this.render(label,'unavailable');return;}
   const utterance=new SpeechSynthesisUtterance(label);utterance.lang='zh-CN';utterance.rate=1.08;
   const voices=window.speechSynthesis.getVoices();const local=voices.find(v=>v.localService&&/^zh[-_]CN/i.test(v.lang))||voices.find(v=>v.localService&&/^zh/i.test(v.lang));if(local)utterance.voice=local;
   this.activeUtterance=utterance;this.render(label,'pending');
   utterance.onstart=()=>{if(token===this.sequence){this.render(label,'speaking');if(this.status)this.status.dataset.spokenLabel=label;}};
   utterance.onend=()=>{if(token===this.sequence){this.activeUtterance=null;this.render(label,'idle');}};
   utterance.onerror=()=>{if(token===this.sequence){this.activeUtterance=null;this.render(label,'unavailable');}};
   window.speechSynthesis.speak(utterance);
  },70);
 }
 render(label,state){if(!this.status)return;this.status.hidden=false;this.status.dataset.state=state;this.status.textContent=state==='unavailable'?'按钮语音暂未开始，可在语音设置中重试。':'当前焦点：'+label;}
}
