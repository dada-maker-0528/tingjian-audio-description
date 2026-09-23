const presentationScreen = matchMedia('(min-aspect-ratio: 3/1)');
const isPresentationContent = window.name === 'tingjian-presentation-content';
if (!isPresentationContent) {
  presentationScreen.addEventListener('change', () => window.location.reload());
}

if (isPresentationContent || !presentationScreen.matches) {
  import('./app.js');
} else {
  // Render the normal desktop page inside its own viewport, then fit it as a whole.
  const canvasWidth = 1848;
  const canvasHeight = 911;
  const frame = document.createElement('iframe');
  frame.name = 'tingjian-presentation-content';
  frame.title = '听见完整页面';
  frame.src = window.location.href;
  frame.allow = 'autoplay; microphone; fullscreen';
  frame.allowFullscreen = true;
  frame.style.cssText = `position:fixed;display:block;width:${canvasWidth}px;height:${canvasHeight}px;` +
    'border:0;background:#000;transform-origin:top left;';

  document.documentElement.style.background = '#000';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.cssText = 'margin:0;width:100vw;min-height:100dvh;height:100dvh;' +
    'overflow:hidden;background:#000;';
  document.body.replaceChildren(frame);

  const fit = () => {
    const scale = Math.min(window.innerWidth / canvasWidth, window.innerHeight / canvasHeight);
    frame.style.left = `${(window.innerWidth - canvasWidth * scale) / 2}px`;
    frame.style.top = `${(window.innerHeight - canvasHeight * scale) / 2}px`;
    frame.style.transform = `scale(${scale})`;
  };
  fit();
  window.addEventListener('resize', fit);
}
