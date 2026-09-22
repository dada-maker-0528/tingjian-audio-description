import path from 'node:path';
import {cloudSpeech} from './ai.mjs';
import {run,ffmpeg,probe,trimSpeechEdges} from './media.mjs';

// Split at sentence boundaries, synthesize the actual words, then insert the
// requested silence. Neither source video nor its soundtrack is processed.
export async function assistantSpeech(text,file,signal,settings){
 const sentences=text.match(/[^。！？!?]+[。！？!?]*/g)?.map(s=>s.trim()).filter(Boolean)||[text];
 const parts=[];
 for(const [i,sentence] of sentences.entries()){
  const raw=file+'.sentence-'+i+'.wav';
  await cloudSpeech(sentence,raw,signal,settings);
  parts.push(await trimSpeechEdges(raw,raw+'.trim.wav',signal));
 }
 const pause=settings.sentencePause??220;
 if(![120,220,350].includes(pause))throw new Error('句间停顿值无效');
 const args=['-v','error'];for(const part of parts)args.push('-i',part.file);
 const filters=parts.map((_,i)=>`[${i}:a]aresample=24000,aformat=channel_layouts=mono,asetpts=PTS-STARTPTS${i<parts.length-1?`,apad=pad_len=${pause*24}`:''}[p${i}]`);
 filters.push(`${parts.map((_,i)=>`[p${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[out]`);
 args.push('-filter_complex',filters.join(';'),'-map','[out]','-c:a','pcm_s16le','-y',file);
 await run(ffmpeg,args,{signal});
 return {file,duration:(await probe(file,signal)).duration,sentenceCount:parts.length,pauseMilliseconds:pause,delivery:settings.delivery};
}
