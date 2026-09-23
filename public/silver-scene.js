// Art direction controls. Motion is decorative, never an audio analyser.
export const SILVER_SCENE = Object.freeze({
  amplitude: .007, flowSpeed: 1, highlight: .95, textureDensity: 185,
  grain: .018, parallax: 6, upperPeriod: 27, lowerPeriod: 23, maxPixelRatio: 1.35,
  waveAmplitude: .30, wavePeriod: 4.8, brightnessBreath: .14,
  pulseTravelSeconds: 3.4, pulseStrength: .34, microAmplitude: .035,
});

const vertexSource = `attribute vec2 position;varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragmentSource = `precision highp float;
varying vec2 uv;
uniform vec2 resolution,pointer;
uniform float time,amplitude,speed,highlight,density,grain,mobile,upperPeriod,lowerPeriod;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float bell(float d,float width){return exp(-d*d/(width*width));}
float ribbon(vec2 p,float layer){
 float x=p.x,t=time*speed;
 float phase=t*6.283185/(layer<.5?upperPeriod:lowerPeriod);
 float curve,width,light,along;
 if(layer<.5){
   curve=.074+.51*pow(max(x,0.),3.3);
   curve+=amplitude*sin(x*5.2-phase)*sin(x*3.14);
   width=.052+.105*pow(max(x,0.),.6);
   light=.20+.69*bell(x-.67,.24)+.53*bell(x-1.02,.10);
   along=x*1.3;
 }else{
   curve=.574+.35*x-.07*x*x+.016*sin(x*5.);
   curve+=amplitude*1.25*sin(x*6.1+phase+.8)*sin(x*3.14);
   width=.035+.14*bell(x-.45,.42);
   light=.17+.84*bell(x-.27,.10)+.24*bell(x-.65,.25);
   along=x*1.7;
 }
 float d=p.y-curve;
 // A broad reflection, a turned dark face, and a fine rim share the same surface coordinates.
 float fold=sin(x*7.3+phase*.24+layer*2.)*.015;
 float v=d/width;
 float face=bell(v-(layer<.5?-.45:.62),.72)*.46;
 face+=bell(v-(layer<.5?.52:1.27),.4)*.14;
 float edge=bell(d,.00135)*.65+bell(d,.005)*.27+bell(d,.028)*.34;
 float filament=sin(v*density+x*18.+noise(vec2(x*8.,v*12.))*3.8);
 float fine=pow(.5+.5*filament,12.);
 float woven=noise(vec2(x*42.,v*230.));
 float texture=(fine*.067+woven*.045)*bell(v-.22,1.25);
 // Unequal filament families fan out through the broad face, following its changing curvature.
 float folds=noise(vec2(x*3.8+layer,v*5.+sin(x*3.8+layer)*2.));
 face*=.69+.40*folds;
 float travelling=pow(.5+.5*sin(along*6.2-phase*.72+layer*2.8),8.);
 float gleam=travelling*(bell(d-.002,.008)*.23+bell(d-fold,.048)*.13);
 float edgeFade=smoothstep(.06,.38,x);
 if(layer>.5)edgeFade=.55+.45*smoothstep(0.,.35,x);
 return (face+texture+(edge+gleam)*highlight)*light*edgeFade;
}
void main(){
 vec2 p=vec2(uv.x,1.-uv.y)-pointer/resolution;
 if(mobile>.5){p.y=(p.y-.54)*2.+.14;p.x=p.x*.86+.14;}
 float low=noise(p*vec2(3.,4.));
 float value=.026+low*.009;
 value+=ribbon(p,0.);
 float bottom=ribbon(p,1.);
 float inner=p.y-(.578+.27*sin(p.x*2.8));
 float innerFold=(bell(inner,.018)*.043+bell(inner,.065)*.03)*smoothstep(.2,.6,p.x);
 // Foreground folds open beneath the lower ribbon; their width changes toward the viewer.
 float x=p.x;
 float drape=.63+.69*pow(max(x,0.),1.23)+amplitude*sin(x*5.+time*.20);
 float d=p.y-drape;
 float fold=bell(d,.10)*(.020+.043*bell(x-.32,.28));
 fold+=bell(d-.045,.032)*.022;
 float thread=pow(.5+.5*sin(d*1900.+x*28.+noise(vec2(x*15.,d*18.))*4.),10.);
 fold+=thread*bell(d,.12)*.016;
 value+=fold+bottom+innerFold;
 // Protect the text area without putting an opaque cover over the artwork.
 float quiet=(1.-smoothstep(.23,.46,p.x))*bell(p.y-.40,.23);
 value*=1.-quiet*.64;
 float vignette=1.-.28*pow(length((uv-.5)*1.15),1.5);
 value*=vignette;
 value+=(hash(gl_FragCoord.xy)-.5)*grain*smoothstep(.065,.3,value);
 if(mobile>.5)value*=.79;
 gl_FragColor=vec4(vec3(value)*vec3(.982,.993,1.),1.);
}`;

export function mountSilverScene(root) {
  const scene=root.querySelector('.silver-scene'),canvas=root.querySelector('canvas'),eye=root.querySelector('.silver-eye');
  const button=root.querySelector('.silver-motion'),label=button.querySelector('span');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),finePointer=matchMedia('(pointer: fine)');
  const abort=new AbortController(),opts={signal:abort.signal};
  let gl,program,buffer,shaders=[],uniforms={},frame=0,last=0,elapsed=0,visible=true,disposed=false,paused=false;
  let width=1,height=1,px=0,py=0,targetX=0,targetY=0;
  try{paused=sessionStorage.getItem('silver-motion-paused')==='true';}catch{}
  const breath=root.querySelector('.silver-eye-breath');
  const pupil=root.querySelector('.silver-pupil'),halo=root.querySelector('.silver-core-halo');
  const fields=[...root.querySelectorAll('.silver-sense-field')];
  const bars=[...root.querySelectorAll('.silver-wave-bar')].map(el=>({el,u:Number(el.dataset.position),opacity:Number(el.dataset.opacity),origin:el.getAttribute('transform')}));
  const set=(key,value)=>gl.uniform1f(uniforms[key],value);
  function release(){if(gl&&!gl.isContextLost()){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);}buffer=null;program=null;shaders=[];}
  function create(){
    gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL unavailable');
    function shader(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    for(const key of ['resolution','pointer','time','amplitude','speed','highlight','density','grain','mobile','upperPeriod','lowerPeriod'])uniforms[key]=gl.getUniformLocation(program,key);
    set('amplitude',SILVER_SCENE.amplitude);set('speed',SILVER_SCENE.flowSpeed);set('highlight',SILVER_SCENE.highlight);set('grain',SILVER_SCENE.grain);set('upperPeriod',SILVER_SCENE.upperPeriod);set('lowerPeriod',SILVER_SCENE.lowerPeriod);
    scene.dataset.renderer='webgl';
  }
  function draw(){
    if(disposed)return;
    if(program&&!gl.isContextLost()){
      gl.useProgram(program);set('time',elapsed);gl.uniform2f(uniforms.pointer,px,py);gl.drawArrays(gl.TRIANGLES,0,6);
    }
    eye.style.transform=`translate(${px}px,${py}px)`;
    const phase=elapsed*Math.PI*2/SILVER_SCENE.wavePeriod;
    breath.style.opacity=String(.88+.07*Math.cos(phase));
    pupil.setAttribute('r',String(10+.45*Math.cos(phase)));
    halo.style.opacity=String(.82+.15*Math.cos(phase));
    fields.forEach((field,i)=>{field.style.strokeOpacity=String(.84+.15*Math.cos(phase-i*.48));});
    for(const bar of bars){
      // A single travelling phase couples neighbouring bars; no random values or frame resets.
      const delayed=(elapsed-bar.u*SILVER_SCENE.pulseTravelSeconds)*Math.PI*2/SILVER_SCENE.wavePeriod;
      const pulse=Math.pow(.5+.5*Math.cos(delayed),5);
      const wave=Math.sin(delayed-.7)+.2*Math.sin(delayed*1.43+bar.u*3.8);
      const scale=.86+SILVER_SCENE.waveAmplitude*wave+SILVER_SCENE.pulseStrength*pulse+SILVER_SCENE.microAmplitude*Math.sin(elapsed*2.8-bar.u*16);
      bar.el.setAttribute('transform',`${bar.origin} scale(1 ${scale})`);
      bar.el.style.opacity=String(Math.min(.96,bar.opacity*(.84+SILVER_SCENE.brightnessBreath*Math.cos(delayed)+.26*pulse)));
    }
  }
  function resize(){
    const rect=root.getBoundingClientRect();width=rect.width;height=rect.height;
    const ratio=Math.min(devicePixelRatio||1,width<761?1:SILVER_SCENE.maxPixelRatio);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    if(program&&!gl.isContextLost()){gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uniforms.resolution,width,height);set('mobile',width<761?1:0);set('density',SILVER_SCENE.textureDensity*(width<761?.55:1));}
    draw();
  }
  const canRun=()=>!disposed&&!paused&&!reduced.matches&&!document.hidden&&visible;
  function tick(now){frame=0;if(!canRun())return;
    // Cap at 30fps: slow fabric does not benefit from 120fps on high refresh displays.
    if(!last||now-last>=32){const dt=last?Math.min((now-last)/1000,.065):0;last=now;elapsed+=dt;
      px+=(targetX-px)*.07;py+=(targetY-py)*.07;draw();}
    frame=requestAnimationFrame(tick);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;last=0;
    const stopped=paused||reduced.matches;
    button.setAttribute('aria-pressed',String(stopped));button.disabled=reduced.matches;
    label.textContent=reduced.matches?'静态画面':paused?'继续动效':'暂停动效';
    button.querySelector('svg').innerHTML=stopped?'<path d="m9 6 9 6-9 6Z"/>':'<path d="M9 6v12M15 6v12"/>';
    button.setAttribute('aria-label',reduced.matches?'已遵循系统减少动态效果设置':paused?'继续背景动效':'暂停背景动效');
    scene.dataset.motion=stopped?'paused':'running';
    if(reduced.matches){elapsed=0;px=py=targetX=targetY=0;draw();}
    if(canRun())frame=requestAnimationFrame(tick);
  }
  try{create();}catch(error){release();scene.dataset.renderer='fallback';console.info('Silver background: static surface fallback.',error.message);}
  resize();
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(root);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.01});intersection.observe(root);
  button.addEventListener('click',()=>{paused=!paused;try{sessionStorage.setItem('silver-motion-paused',String(paused));}catch{}sync();},opts);
  root.addEventListener('pointermove',event=>{if(!finePointer.matches||!canRun()||width<761)return;const box=root.getBoundingClientRect();targetX=((event.clientX-box.left)/width-.5)*SILVER_SCENE.parallax*2;targetY=((event.clientY-box.top)/height-.5)*SILVER_SCENE.parallax*2;},opts);
  root.addEventListener('pointerleave',()=>{targetX=targetY=0;},opts);
  document.addEventListener('visibilitychange',sync,opts);reduced.addEventListener('change',sync,opts);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();scene.dataset.renderer='fallback';},opts);
  canvas.addEventListener('webglcontextrestored',()=>{try{release();create();resize();sync();}catch{scene.dataset.renderer='fallback';}},opts);
  sync();
  return ()=>{disposed=true;cancelAnimationFrame(frame);abort.abort();resizeObserver.disconnect();intersection.disconnect();release();if(gl&&!gl.isContextLost())gl.getExtension('WEBGL_lose_context')?.loseContext();};
}
