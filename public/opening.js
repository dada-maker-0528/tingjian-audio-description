import {openingSignal} from './opening-signal.js';
export function openingPage(){
 return `<section class="opening silver-home" aria-labelledby="opening-title">
  <div class="silver-material" aria-hidden="true"></div>
  ${openingSignal()}
  <div class="silver-brand" aria-label="听见"><img class="silver-brand-mark" src="assets/tingjian-mark.svg" width="61" height="60" alt=""><img class="silver-brand-word" src="assets/tingjian-wordmark.svg" width="75" height="37" alt="听见"></div>
  <div class="silver-copy">
   <p class="silver-eyebrow">AI 口述影像</p>
   <h1 id="opening-title" aria-label="听见"><span>听</span><span class="silver-title-dot" aria-hidden="true">·</span><span>见</span></h1>
   <div class="silver-rule" aria-hidden="true"></div>
   <p class="silver-tagline">听见世界的更多可能</p>
   <button class="silver-entry opening-enter" type="button" data-action="library" data-focus-label="进入听见，打开我的视频"><span class="silver-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 4 13 8-13 8Z"/></svg></span><span>进入听见</span><svg class="silver-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5"/></svg></button>
  </div>
  <footer class="silver-footer">
   <p class="silver-signature"><span>AI + 社会公益赛道</span><span lang="en">MORE THAN A MOVIE</span></p>
  </footer>
 </section>`;
}
let currentRoot;
const main=document.getElementById('main');
function syncOpening(){
 const next=main.querySelector('.silver-home');if(next===currentRoot)return;
 currentRoot=next;
 document.body.classList.toggle('silver-home-mode',!!next);
 document.querySelector('meta[name="theme-color"]').content=next?'#08090a':'#ffffff';
}
const observer=new MutationObserver(syncOpening);observer.observe(main,{childList:true});syncOpening();
window.addEventListener('pageshow',event=>{if(event.persisted){currentRoot=null;syncOpening();}});
