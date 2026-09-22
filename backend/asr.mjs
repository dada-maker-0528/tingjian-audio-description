import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataRoot} from './store.mjs';
import {settings,transcribe} from './ai.mjs';
import {probe,run,ffmpeg} from './media.mjs';
export const asrStatus=()=>({configured:settings().hasKey,provider:settings().provider,model:settings().asrModel});
export async function recognizeAudio(bytes,signal){
 if(!settings().hasKey)throw Object.assign(new Error('语音识别服务尚未配置，请联系维护者提供 ASR 服务。'),{status:503});
 if(bytes.length<44||bytes.length>8*1024*1024)throw new Error('录音为空或超过大小限制');
 const dir=path.join(dataRoot,'asr');await mkdir(dir,{recursive:true});
 const id=randomUUID(),raw=path.join(dir,id+'.input'),wav=path.join(dir,id+'.wav');
 try{
  await writeFile(raw,bytes);
  await run(ffmpeg,['-v','error','-i',raw,'-t','61','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-y',wav],{signal});
  const info=await probe(wav);if(info.duration>60||info.duration<.15)throw new Error('请录制 0.2 至 60 秒语音');
  const result=await transcribe(wav,signal);return {text:result.text.trim(),provider:settings().provider};
 }finally{await Promise.allSettled([unlink(raw),unlink(wav)]);}
}
