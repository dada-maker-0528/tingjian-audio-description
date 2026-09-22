import path from 'node:path';
import {run,ffmpeg,probe} from './media.mjs';
import {projectDir,assetUrl} from './store.mjs';

export function narrationFile(p,url){
 const prefix=`/media/${p.id}/`;if(typeof url!=='string'||!url.startsWith(prefix))throw new Error('旁白文件不属于当前项目');
 const root=projectDir(p.id),file=path.resolve(root,decodeURIComponent(url.slice(prefix.length)));
 if(!file.startsWith(root+path.sep)||path.extname(file)!=='.wav')throw new Error('旁白文件路径无效');return file;
}
export async function overlayNarration(base,items,output,duration,signal){
 const args=['-v','error','-i',base];for(const x of items)args.push('-i',x.file);
 const filters=[],muted=items.map(x=>`gte(t,${x.at})*lt(t,${x.at+x.duration})`).join('+');
 filters.push(`[0:a]${muted?`aeval=exprs='val(ch)*not(${muted})'`:'anull'}[base]`);
 items.forEach((x,i)=>filters.push(`[${i+1}:a]atrim=start=${x.offset||0}:duration=${x.duration},asetpts=PTS-STARTPTS,volume=${x.gain??1}${x.at>0?`,adelay=${Math.round(x.at*1000)}`:''},apad,atrim=duration=${duration}[n${i}]`));
 filters.push(`[base]${items.map((_,i)=>`[n${i}]`).join('')}amix=inputs=${items.length+1}:duration=first:dropout_transition=0,volume=${items.length+1}[out]`);
 args.push('-filter_complex',filters.join(';'),'-map','[out]','-t',String(duration),'-c:a','pcm_s16le','-y',output);
 await run(ffmpeg,args,{signal,timeout:300000});const info=await probe(output,signal);
 if(!info.hasAudio||Math.abs(info.duration-duration)>.15)throw new Error('重制音轨未通过时长检查');
 await run(ffmpeg,['-v','error','-i',output,'-f','null','-'],{signal});return info;
}
export async function applyAcceptedAssistantAudio(p,version,signal){
 const accepted=(p.assistant?.audioOverrides||Object.values(p.assistant?.accepted||{})).filter(x=>x.start<version.end&&x.end>version.start);
 if(!accepted.length)return;
 const file=path.join(projectDir(p.id),`narration-${version.id}-assistant.wav`);
 const items=accepted.map(c=>{const start=Math.max(c.start,version.start),end=Math.min(c.end,version.end);return {file:narrationFile(p,c.narrationUrl),at:start-version.start,offset:start-(c.sourceStart??c.start),duration:end-start,gain:c.masterGain/(version.settings.gain||1)};});
 await overlayNarration(narrationFile(p,version.result.narrationUrl),items,file,version.end-version.start,signal);
 version.result.narrationUrl=assetUrl(p,file);
 version.result.cues=[...version.result.cues.filter(c=>!accepted.some(a=>c.start+version.start>=a.start&&c.start+version.start<a.end)),...accepted.flatMap(a=>a.cues.filter(c=>c.start>=version.start&&c.start<version.end).map(c=>({...c,start:c.start-version.start,end:c.end-version.start})))].sort((a,b)=>a.start-b.start);
 version.assistantOverrides=accepted.map(c=>c.id);
}
