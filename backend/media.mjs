import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const root = process.env.AIMEDIA_ROOT ? path.resolve(process.env.AIMEDIA_ROOT) : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
export function run(command, args, { signal, timeout = 120000, allowError = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('任务已取消'));
    const child = spawn(command, args, { windowsHide:true, shell:false });
    let stdout='', stderr='', settled=false;
    const finish=(error, result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
    const abort=()=>{child.kill();finish(new Error('任务已取消'));};
    const timer=setTimeout(()=>{child.kill();finish(new Error('处理超时，请重试当前阶段'));},timeout);
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',data=>stdout=(stdout+data).slice(-1500000));
    child.stderr.on('data',data=>stderr=(stderr+data).slice(-1500000));
    child.on('error',error=>finish(new Error(`工具无法启动：${command} (${error.code || 'unknown'})`)));
    child.on('close',code=>finish(code && !allowError ? new Error(`媒体处理失败：${stderr.slice(-900)}`) : null,{stdout,stderr,code}));
  });
}
export async function probe(file,signal) {
  const {stderr}=await run(ffmpeg,['-hide_banner','-i',file],{signal,allowError:true,timeout:25000});
  const match=stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if(!match) throw new Error('无法读取媒体时长，请更换有效文件');
  const duration=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  const dimensions=stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  return {duration:Math.round(duration*100)/100,width:Number(dimensions?.[1]||0),height:Number(dimensions?.[2]||0),hasAudio:/Audio:/.test(stderr)};
}
export async function verifyVideo(file,signal) {
  const info=await probe(file,signal);
  if(!info.width||!info.height)throw new Error('文件中没有可用的视频画面');
  await run(ffmpeg,['-v','error','-i',file,'-t','2','-f','null','-'],{signal,timeout:30000});
  return info;
}
export async function localSpeech(text,dir,{voice='Microsoft Huihui Desktop',rate=1,signal}={}) {
  if(process.platform!=='win32')throw new Error('当前系统没有 Windows 中文配音，请在模型设置中选择在线配音');
  const key=createHash('sha256').update(text+'|'+voice+'|'+rate).digest('hex').slice(0,16);
  const file=path.join(dir,`speech-${key}.wav`);
  try {const info=await probe(file,signal);return {file,duration:info.duration};} catch(error){if(signal?.aborted)throw error;}
  await mkdir(dir,{recursive:true});
  const textFile=path.join(dir,`speech-${key}.txt`);
  await writeFile(textFile,text,'utf8');
  const partial=path.join(dir,`speech-${key}.partial.wav`);
  await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'backend','speak.ps1'),'-TextFile',textFile,'-OutputFile',partial,'-Voice',voice,'-Rate',String(rate)],{signal,timeout:45000});
  const info=await probe(partial,signal);await rename(partial,file);return {file,duration:info.duration};
}
export async function extractFrames(file,dir,duration,signal) {
  await mkdir(dir,{recursive:true});
  const interval=Math.max(2,Math.ceil(duration/48));
  await run(ffmpeg,['-v','error','-i',file,'-vf',`fps=1/${interval},scale=640:-2`,'-q:v','4','-frames:v','48','-y',path.join(dir,'frame-%03d.jpg')],{signal});
  const {readdir}=await import('node:fs/promises');
  const names=(await readdir(dir)).filter(n=>/^frame-\d+\.jpg$/.test(n)).sort();
  const frames=[];
  for(let i=0;i<names.length;i++)frames.push({time:Math.min(duration,(i+.5)*interval),file:path.join(dir,names[i]),url:'data:image/jpeg;base64,'+(await readFile(path.join(dir,names[i]))).toString('base64')});
  return frames;
}
export async function extractAudio(file,output,signal) {
  await run(ffmpeg,['-v','error','-i',file,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-y',output],{signal});return output;
}
export async function trimSpeechEdges(file,output,signal){
  const info=await probe(file,signal);
  const {stderr}=await run(ffmpeg,['-hide_banner','-i',file,'-af','silencedetect=noise=-40dB:d=0.04','-f','null','-'],{signal});
  const events=[...stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)].map(x=>({kind:x[1],at:Number(x[2])}));
  let start=0,end=info.duration;
  if(events[0]?.kind==='start'&&events[0].at<=.04&&events[1]?.kind==='end')start=Math.max(0,events[1].at-.04);
  if(events.at(-1)?.kind==='start')end=Math.min(end,events.at(-1).at+.04);
  // Keep 40ms padding and all internal pauses; never shorten the spoken content.
  if(end-start<.15||start+info.duration-end<.12)return {file,duration:info.duration,boundaryTrimChecked:true};
  await run(ffmpeg,['-v','error','-i',file,'-af',`atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le','-y',output],{signal});
  return {file:output,duration:(await probe(output,signal)).duration,boundaryTrimChecked:true,boundaryTrim:{start,end,originalDuration:info.duration}};
}
export async function silentWindows(file,duration,hasAudio,signal) {
  if(!hasAudio)return [{start:0,end:duration}];
  const {stderr}=await run(ffmpeg,['-hide_banner','-i',file,'-af','silencedetect=noise=-35dB:d=0.65','-f','null','-'],{signal});
  const events=[...stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)];
  const windows=[];let start=null;
  for(const event of events){if(event[1]==='start')start=Number(event[2]);else if(start!==null){windows.push({start:Math.max(0,start+.12),end:Math.min(duration,Number(event[2])-.12)});start=null;}}
  if(start!==null)windows.push({start:Math.max(0,start+.12),end:duration});
  return windows.filter(w=>w.end-w.start>.5);
}
export function dialogueGaps(segments,duration,padding=.3){
  const spans=segments.filter(s=>s.text.trim()&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start).map(s=>({start:Math.max(0,s.start-padding),end:Math.min(duration,s.end+padding)})).sort((a,b)=>a.start-b.start);
  if(!spans.length)return [];
  let cursor=0;const gaps=[];
  for(const span of spans){if(span.start-cursor>.65)gaps.push({start:cursor,end:span.start});cursor=Math.max(cursor,span.end);}
  if(duration-cursor>.65)gaps.push({start:cursor,end:duration});
  return gaps;
}
export async function trimVideo(source,output,start,end,signal){
  await run(ffmpeg,['-v','error','-ss',String(start),'-i',source,'-t',String(end-start),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',output],{signal});
  return verifyVideo(output,signal);
}
export async function mixVideo(source,scenes,output,{duration,hasAudio,originalVolume=1,narrationVolume=1,duckLevel=.35,signal}={}) {
  if(!Number.isFinite(duckLevel)||duckLevel<0||duckLevel>1)throw new Error('原声压低比例无效');
  const active=scenes.filter(s=>s.category!=='none'&&s.text.trim());
  const args=['-v','error','-i',source];
  if(!hasAudio)args.push('-f','lavfi','-i','anullsrc=r=44100:cl=stereo');
  const first=hasAudio?1:2;
  for(const s of active)args.push('-i',s.audio.file);
  const envelopes=active.map(s=>`min(1,max(0,(t-${Math.max(0,s.insertStart-.12).toFixed(3)})/0.12))*min(1,max(0,(${(s.insertStart+s.audio.duration+.22).toFixed(3)}-t)/0.22))`);
  const baseGain=active.length?`'${originalVolume}*(1-${(1-duckLevel).toFixed(3)}*min(1,${envelopes.join('+')}))':eval=frame`:String(originalVolume);
  const filters=[`[${hasAudio?0:1}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${baseGain},apad,atrim=duration=${duration}[base]`];
  active.forEach((s,i)=>{const delay=Math.round(s.insertStart*1000);filters.push(`[${first+i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${narrationVolume},afade=t=in:d=0.03,afade=t=out:st=${Math.max(0,s.audio.duration-.06).toFixed(3)}:d=0.06${delay>0?`,adelay=${delay}|${delay}`:''},apad,atrim=duration=${duration}[n${i}]`);});
  // Disable the limiter's automatic gain and leave headroom for AAC encoding.
  if(active.length)filters.push(`[base]${active.map((s,i)=>`[n${i}]`).join('')}amix=inputs=${active.length+1}:duration=first:dropout_transition=0,volume=${active.length+1},alimiter=limit=0.8:level=false[mixed]`);
  else filters.push('[base]anull[mixed]');
  args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[mixed]','-c:v','libx264','-preset','veryfast','-crf','21','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','44100','-t',String(duration),'-movflags','+faststart','-y',output);
  await run(ffmpeg,args,{signal,timeout:300000});
  const info=await verifyVideo(output,signal);
  if(!info.hasAudio||Math.abs(info.duration-duration)>.3)throw new Error('成片完整性检查未通过：音轨或时长不一致');
  await run(ffmpeg,['-v','error','-i',output,'-f','null','-'],{signal,timeout:180000});
  return info;
}
