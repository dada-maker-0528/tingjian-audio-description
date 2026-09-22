import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {UI_PROMPTS,normalizePrompt} from '../public/ui-speech.js';
import {DEFAULT_VOICE,isVoice,voiceInfo} from '../public/voices.js';
import {pcmToWav} from './volc-protocol.mjs';
import {openNodeSpeech} from './node-speech.mjs';
import {SpeechError} from './volc-client.mjs';

export class UISpeechCache {
 constructor(directory,{env=process.env,connector=openNodeSpeech}={}){this.directory=directory;this.env=env;this.connector=connector;this.pending=new Map();this.jobs=new Map();}
 input(text,voice=DEFAULT_VOICE){
  if(typeof text!=='string'||!text.trim()||text.length>400)throw new SpeechError('bad_text','语音文字需要在 1—400 字之间。',400);
  if(!isVoice(voice))throw new SpeechError('bad_voice','请选择支持的音色。',400);
  const words=normalizePrompt(text),key=createHash('sha256').update(JSON.stringify(['doubao-ui-v1',this.env.VOLC_TTS_RESOURCE_ID||'seed-tts-2.0',voiceInfo(voice).speaker,'normal',24000,words])).digest('hex');
  return {words,key,file:path.join(this.directory,key+'.wav'),voice};
 }
 async read(text,voice){const item=this.input(text,voice);try{const bytes=await readFile(item.file);if(bytes.length>44&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE')return {...item,bytes};}catch(e){if(e.code!=='ENOENT')throw e;}return null;}
 async get(text,voice=DEFAULT_VOICE){
  const item=this.input(text,voice);if(this.pending.has(item.key))return this.pending.get(item.key);
  const work=(async()=>{
   const cached=await this.read(text,voice);if(cached)return {...cached,cached:true};
   if(!this.env.VOLC_TTS_KEY)throw new SpeechError('not_configured','豆包语音尚未连接，请配置后重试。',503);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);let connection,temp;
   try{
    connection=await this.connector(this.env,controller.signal);
    const pcm=await connection.synthesize(item.words,'normal',voice);
    if(!pcm.length||pcm.length%2)throw new SpeechError('empty_audio','豆包未返回完整音频，请重试。');
    const bytes=Buffer.from(pcmToWav(pcm));await mkdir(this.directory,{recursive:true});
    temp=path.join(this.directory,item.key+'-'+randomUUID()+'.tmp');await writeFile(temp,bytes);await rename(temp,item.file);
    return {...item,bytes,cached:false};
   }finally{clearTimeout(timer);connection?.close();if(temp)await unlink(temp).catch(()=>{});}
  })();
  this.pending.set(item.key,work);try{return await work;}finally{this.pending.delete(item.key);}
 }
 async status(voice=DEFAULT_VOICE){this.input('状态',voice);let ready=0;for(const text of UI_PROMPTS)if(await this.read(text,voice))ready++;const job=this.jobs.get(voice);return {voice,ready,total:UI_PROMPTS.length,state:job?.state|| (ready===UI_PROMPTS.length?'complete':'idle'),message:job?.message||'',provider:'volcengine'};}
 prepare(voice=DEFAULT_VOICE){
  this.input('准备',voice);const existing=this.jobs.get(voice);if(existing?.state==='running')return existing;
  const job={state:'running',message:'正在准备常用按钮和操作引导。'};this.jobs.set(voice,job);
  job.done=(async()=>{try{for(const text of UI_PROMPTS)await this.get(text,voice);job.state='complete';job.message='常用按钮和操作引导已准备好。';}catch{job.state='error';job.message='豆包提示音准备未完成，已生成的声音已保留。请检查连接后重试。';}})();
  return job;
 }
}
