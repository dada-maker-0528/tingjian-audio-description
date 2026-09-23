const active=new WeakMap(),running=new Set();
const preference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const ease='cubic-bezier(.22,.68,0,1)';
export const reduceMotion=()=>Boolean(preference?.matches);
preference?.addEventListener('change',()=>{if(reduceMotion())for(const animation of running)animation.cancel();});
function play(owner,element,frames,duration=300){
 if(reduceMotion()||!element?.animate)return;
 const animation=element.animate(frames,{duration,easing:ease});
 const list=active.get(owner)||[];list.push(animation);active.set(owner,list);running.add(animation);
 const cleanup=()=>{running.delete(animation);const current=active.get(owner);if(current){const index=current.indexOf(animation);if(index>=0)current.splice(index,1);}};
 animation.finished.then(cleanup,cleanup);return animation;
}
export function capturePanel(root){
 const shell=root.querySelector('.assistant-shell'),grid=root.closest('.assistant-workspace');
 const indicator=root.querySelector('.assistant-tab-indicator');
 const before=shell?{height:shell.getBoundingClientRect().height,grid,columns:grid?getComputedStyle(grid).gridTemplateColumns:null,tab:indicator?getComputedStyle(indicator).transform:null}:null;
 // Read the visible intermediate position before cancelling an interrupted move.
 for(const animation of active.get(root)||[])animation.cancel();active.delete(root);
 return before;
}
export function animatePanel(root,before,{content=false}={}){
 if(!before||reduceMotion())return;
 const shell=root.querySelector('.assistant-shell');if(!shell)return;
 const height=shell.getBoundingClientRect().height,columns=before.grid?getComputedStyle(before.grid).gridTemplateColumns:null;
 if(before.columns&&columns&&columns!==before.columns)play(root,before.grid,[{gridTemplateColumns:before.columns},{gridTemplateColumns:columns}]);
 if(Math.abs(height-before.height)>2)play(root,shell,[{height:before.height+'px',minHeight:'0px',maxHeight:'none'},{height:height+'px',minHeight:'0px',maxHeight:'none'}]);
 const indicator=root.querySelector('.assistant-tab-indicator');
 if(indicator&&before.tab){const transform=getComputedStyle(indicator).transform;if(transform!==before.tab)play(root,indicator,[{transform:before.tab},{transform}],260);}
 if(content)enterContent(root.querySelector('.assistant-scroll'),root);
}
export function enterContent(element,owner=element){
 return play(owner,element,[{opacity:.35,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],220);
}
