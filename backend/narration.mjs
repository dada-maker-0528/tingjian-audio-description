import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {openNodeSpeech} from '../server/node-speech.mjs';
import {pcmToWav} from '../server/volc-protocol.mjs';
import {DEFAULT_VOICE} from '../public/voices.js';
import {probe,run,ffmpeg} from './media.mjs';
import {dataRoot} from './store.mjs';

export const speechCacheKey=(text,{speed=1,voice=DEFAULT_VOICE,filmId='',promptHash='',delivery=''}={})=>createHash('sha256').update(JSON.stringify([filmId,text,voice,speed,promptHash,delivery,process.env.VOLC_TTS_RESOURCE_ID||'seed-tts-2.0'])).digest('hex');
export async function synthesizeDoubao(text,file,signal,{speed=1,voice=DEFAULT_VOICE,filmId='',promptHash='',delivery=''}={}) {
  if(![1,.8,.85,1.15].includes(speed))throw new Error('不支持此旁白语速');
  const key=speechCacheKey(text,{speed,voice,filmId,promptHash,delivery});
  const cache=path.join(dataRoot,'speech-cache');await mkdir(cache,{recursive:true});
  const cached=path.join(cache,key+'.wav');let bytes,cacheStatus='hit';
  try{bytes=await readFile(cached);}catch{
    cacheStatus='generated';
    const combined=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(55000)]);
    const connection=await openNodeSpeech(process.env,combined);
    try{bytes=pcmToWav(await connection.synthesize(text,speed,voice,{delivery}));}
    finally{connection.close();}
    if(combined.aborted)throw new Error('语音合成已取消');
    const tmp=cached+'.'+randomUUID()+'.tmp';await writeFile(tmp,bytes);await rename(tmp,cached);
  }
  if(signal?.aborted)throw new Error('语音合成已取消');
  await writeFile(file,bytes);const info=await probe(file,signal);return {file,duration:info.duration,cacheStatus,cacheKey:key};
}

// Narration only: the source audio never passes through this filter graph.
export async function renderNarration(scenes,output,duration,signal) {
  const cues=scenes.filter(s=>s.category!=='none'&&s.audio&&s.text?.trim()).sort((a,b)=>a.insertStart-b.insertStart);
  let previous=0;
  for(const s of cues){
    if(s.insertStart<previous-.015||s.insertStart+s.audio.duration>Math.min(duration,s.insertEnd)+.02)throw new Error('旁白重叠或超出原片空隙，需先调整');
    previous=s.insertStart+s.audio.duration;
  }
  const args=['-v','error','-f','lavfi','-i','anullsrc=r=24000:cl=mono'];
  for(const cue of cues)args.push('-i',cue.audio.file);
  const filters=[`[0:a]atrim=duration=${duration},asetpts=PTS-STARTPTS[base]`];
  cues.forEach((cue,i)=>filters.push(`[${i+1}:a]aresample=24000,aformat=channel_layouts=mono${cue.insertStart>0?`,adelay=${Math.round(cue.insertStart*1000)}`:''},apad,atrim=duration=${duration}[n${i}]`));
  filters.push(`[base]${cues.map((_,i)=>`[n${i}]`).join('')}amix=inputs=${cues.length+1}:duration=first:dropout_transition=0,volume=${cues.length+1}[out]`);
  args.push('-filter_complex',filters.join(';'),'-map','[out]','-c:a','pcm_s16le','-t',String(duration),'-y',output);
  await run(ffmpeg,args,{signal,timeout:300000});
  const info=await probe(output,signal);
  if(!info.hasAudio||Math.abs(info.duration-duration)>.1)throw new Error('独立旁白轨时长检查失败');
  await run(ffmpeg,['-v','error','-i',output,'-f','null','-'],{signal});
  return info;
}
