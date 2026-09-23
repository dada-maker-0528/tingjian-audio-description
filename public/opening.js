// Decorative eye / sound-wave geometry. This is brand artwork, not an audio analysis.
function soundEye(){
  const arcs=Array.from({length:16},(_,i)=>{
    const r=31+i*10.5, h=31+i*5.3;
    return `<path d="M260 ${300-h} C${260-r*1.48} ${300-h},${260-r*1.48} ${300+h},260 ${300+h}" opacity="${.9-i*.035}"/>`;
  }).join('');
  const eye=Array.from({length:6},(_,i)=>`<path d="M260 ${269-i*4} Q${292+i*8} ${267-i*4} ${322+i*4} 300 Q${292+i*8} ${333+i*4} 260 ${331+i*4}" opacity="${.9-i*.07}"/>`).join('');
  const bars=Array.from({length:64},(_,i)=>{
    const x=262+i*7.9;
    const envelope=134*Math.exp(-i/16)+17;
    let h=envelope*(.36+.64*Math.abs(Math.sin(i*1.19+.6)));
    if([0,2,7,22,24,36,43,58].includes(i))h*=1.8;
    const gap=i<8?43+i*4:0;
    return `<path d="M${x} ${300-h}V${300-gap}${gap?`M${x} ${300+gap}`:''}V${300+h}" opacity="${.52+.25*Math.abs(Math.cos(i))}"/>${[0,2,7,22,24,36,43,58].includes(i)?`<g fill="currentColor" stroke="none"><circle cx="${x}" cy="${300-h}" r="1.7"/><circle cx="${x}" cy="${300+h}" r="1.7"/></g>`:''}`;
  }).join('');
  return `<svg class="opening-art" aria-hidden="true" focusable="false" viewBox="0 0 820 600" fill="none"><g stroke="currentColor" stroke-width="1.15">${arcs}${eye}<circle cx="260" cy="300" r="31"/><circle cx="260" cy="300" r="20"/><circle cx="260" cy="300" r="10.5" fill="currentColor" stroke="none"/><path d="M322 300H800" opacity=".6"/>${bars}<circle cx="800" cy="300" r="2" fill="currentColor" stroke="none"/></g></svg>`;
}

export function openingPage(icon){
 return `<section class="opening" aria-labelledby="opening-title">
  <p class="opening-eyebrow">AI 口述影像</p>
  ${soundEye()}
  <div class="opening-content">
   <h1 id="opening-title">听见</h1>
   <span class="opening-rule" aria-hidden="true"></span>
   <p class="opening-tagline">选一部电影，<br>听见画面中的每一个故事</p>
   <p class="opening-description">讲述人物、动作与细节。<br>听懂一段影片，也能用一句话调整旁白。</p>
   <div class="opening-actions"><button class="opening-enter" data-action="library" data-focus-label="进入听见，打开我的视频">进入体验 <span aria-hidden="true">${icon('arrow')}</span></button><button class="opening-listen" data-action="intro-read">${icon('volume')}听项目简介</button></div>
   <p class="opening-shortcut"><kbd>Enter</kbd> 或空格，进入体验</p>
  </div>
  <div class="opening-footer"><span class="opening-note">让每个人，都能走进故事。</span><span class="opening-credit">AI + 社会公益赛道<span class="opening-credit-divider" aria-hidden="true">/</span>产品大王队 <span class="opening-produced">出品</span></span></div>
 </section>`;
}
