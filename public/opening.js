import {assetURL} from './asset-url.js';

export function openingPage(icon){
 return `<section class="opening" aria-labelledby="opening-title">
  <div class="opening-content">
   <p class="opening-eyebrow">AI 口述影像 · 无障碍观影</p>
   <h1 id="opening-title"><span class="sr-only">智享视界</span><img class="opening-wordmark" src="${assetURL('assets/zhixiang-title-provided.png')}" width="2172" height="724" alt="" aria-hidden="true" fetchpriority="high"></h1>
   <p class="opening-tagline">让故事，不止于看见。</p>
   <p class="opening-description">为视障用户讲述画面中的人物、动作与细节。<br>听懂一段影片，也能用一句话调整旁白。</p>
   <div class="opening-actions"><button class="opening-enter" data-action="library" data-focus-label="进入智享视界，打开我的视频">进入体验 <span aria-hidden="true">${icon('arrow')}</span></button><button class="opening-listen" data-action="intro-read">${icon('volume')}听项目简介</button></div>
   <p class="opening-shortcut"><kbd>Enter</kbd> 或空格，进入体验</p>
  </div>
  <div class="opening-footer"><span class="opening-credit">产品大王队 <span>出品</span></span><span class="opening-note">从画面到声音，让每个人走进故事。</span></div>
 </section>`;
}
