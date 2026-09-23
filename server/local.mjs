import {interpretAssistant} from '../backend/assistant-interpret.mjs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReadStream} from 'node:fs';
import {mkdir,open,stat,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeStore,projects,projectDir,getProject,dataRoot} from '../backend/store.mjs';
import {initializeAI,settings,assistPrompt,proposeRevision} from '../backend/ai.mjs';
import {promptProfile,savePromptProfile,promptHistory,validatePromptEntries} from '../backend/prompt-library.mjs';
import {revisionContext,validateRevision} from '../backend/revision.mjs';
import {registerUpload} from '../backend/service.mjs';
import {startWorkflow,projectView,workflowAction,transcribeRecording,stopWorkflows} from '../backend/workflow.mjs';
import {handleTTS} from './worker.mjs';
import {openNodeSpeech} from './node-speech.mjs';
import {films,defaultFilm} from '../public/catalog-config.js';
import {VOICES} from '../public/voices.js';
import {UISpeechCache} from './ui-speech.mjs';
import {SpeechError} from './volc-client.mjs';
import {assistantContext,assistantVoice,readAssistantText,beginAssistantRun,assistantJob,acceptAssistant,stopAssistantJobs} from '../backend/assistant.mjs';
import {asrStatus,recognizeAudio} from '../backend/asr.mjs';
import {installRealtimeASR,realtimeConfig} from './realtime-asr.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(status<400?{ok:true,data:value}:{ok:false,...value}));}
async function readBody(req,max=1_000_000){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('提交内容过大'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
async function readJSON(req,max){try{return JSON.parse((await readBody(req,max)).toString('utf8'));}catch{throw new Error('请求内容格式不正确');}}
async function sendFile(req,res,file){
  let info;try{info=await stat(file);}catch{res.writeHead(404).end();return;}
  if(!info.isFile()){res.writeHead(404).end();return;}
  const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
  let start=0,end=info.size-1,status=200;
  if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
    if(!match[1])start=Math.max(0,info.size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);
  if(req.method==='HEAD'){res.end();return;}const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
function contained(base,relative){const file=path.resolve(base,relative);if(!file.startsWith(base+path.sep))throw Object.assign(new Error('路径不可访问'),{status:403});return file;}
export function createLocalServer(){
  const uploads=new Set();
  const publicOrigin=process.env.TINGJIAN_PUBLIC_ORIGIN?new URL(process.env.TINGJIAN_PUBLIC_ORIGIN):null;
  if(publicOrigin&&(publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password||publicOrigin.pathname!=='/'))throw new Error('线上入口必须配置为完整HTTPS域名');
  const uiSpeech=new UISpeechCache(path.join(dataRoot,'ui-speech'));
  const server=http.createServer(async(req,res)=>{
    try{
      const port=req.socket.localPort;
      const external=publicOrigin&&req.headers.host===publicOrigin.host;
      if(!external&&![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){json(res,{error:'访问地址不受支持'},403);return;}
      const origin=external?publicOrigin.origin:`http://${req.headers.host}`,url=new URL(req.url,origin);
      if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){json(res,{error:'不支持跨网站访问本地服务'},403);return;}
      if(!['GET','HEAD'].includes(req.method)&&req.headers['x-tingjian-request']!=='1'){json(res,{error:'缺少本地请求标识'},403);return;}
      if(url.pathname==='/healthz'&&['GET','HEAD'].includes(req.method)){json(res,{ready:true,app:'tingjian',release:process.env.TINGJIAN_RELEASE||'local'});return;}
      if(url.pathname==='/api/asr/status'&&req.method==='GET'){const realtime=realtimeConfig();json(res,realtime?{configured:true,realtime:true,provider:'bailian',model:realtime.model}:{...asrStatus(),realtime:false});return;}
      if(url.pathname==='/api/asr'&&req.method==='POST'){
        const controller=new AbortController();res.on('close',()=>controller.abort());
        const result=await recognizeAudio(await readBody(req,8*1024*1024),controller.signal);
        if(!res.destroyed)json(res,result);return;
      }
      if(url.pathname==='/api/capabilities'){json(res,{local:true,visionReady:settings().visionReady,ttsReady:Boolean(process.env.VOLC_TTS_KEY),ttsProvider:process.env.TINGJIAN_TTS_PROVIDER||'doubao',maxUploadMB:500,maxDuration:3600});return;}
      if(url.pathname==='/api/tts/status'){
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({configured:Boolean(process.env.VOLC_TTS_KEY),provider:'volcengine',label:'豆包语音',filmId:defaultFilm.id,voices:VOICES}));return;
      }
      if(url.pathname==='/api/tts/ui-status'&&req.method==='GET'){json(res,await uiSpeech.status(url.searchParams.get('voice')||undefined));return;}
      if(url.pathname==='/api/tts/prepare-ui'&&req.method==='POST'){const {voice}=await readJSON(req);uiSpeech.prepare(voice);json(res,await uiSpeech.status(voice));return;}
      if(url.pathname==='/api/tts/ui-audio'&&['GET','HEAD'].includes(req.method)){
        const cached=await uiSpeech.read(url.searchParams.get('text'),url.searchParams.get('voice')||undefined);
        if(!cached){json(res,{error:'这段豆包语音尚未准备。'},404);return;}
        await sendFile(req,res,cached.file);return;
      }
      if(url.pathname==='/api/tts'&&req.method==='POST'){
        const bytes=await readBody(req,6000),controller=new AbortController();res.on('close',()=>controller.abort());
        let input;try{input=JSON.parse(bytes.toString('utf8'));}catch{}
        if(input?.kind==='guide'){
          const result=await uiSpeech.get(input.text,input.voice);
          if(!res.destroyed){res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store','X-TTS-Provider':'volcengine','X-TTS-Voice':result.voice,'X-TTS-Cache':result.cached?'hit':'miss'});res.end(result.bytes);}return;
        }
        const response=await handleTTS(new Request(url,{method:'POST',headers:req.headers,body:bytes,signal:controller.signal}),process.env,openNodeSpeech);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(url.pathname==='/api/prompt-library/history'&&req.method==='GET'){
        const versions=await promptHistory(),usage=[];
        for(const p of projects.values())if(p.workflow&&!p.archived)for(const v of [...p.workflow.history,p.workflow.current].filter(Boolean))if(v.execution)usage.push({projectId:p.id,title:p.title,versionId:v.id,settingsVersion:v.settingsVersion,stage:v.stage,promptRevision:v.promptRevision,promptHash:v.execution.promptHash,scope:v.promptProfile?.scope||'library',status:v.execution.attempts.at(-1)?.status});
        json(res,{versions,usage});return;
      }
      if(url.pathname==='/api/prompt-library'&&req.method==='GET'){json(res,{...await promptProfile(),aiAvailable:settings().visionReady});return;}
      if(url.pathname==='/api/prompt-library'&&req.method==='PUT'){json(res,await savePromptProfile(await readJSON(req)));return;}
      if(url.pathname==='/api/prompt-library/assist'&&req.method==='POST'){
        const controller=new AbortController();res.on('close',()=>controller.abort());
        const result=await assistPrompt(await readJSON(req),controller.signal);if(!res.destroyed)json(res,result);return;
      }
      if(url.pathname==='/api/bootstrap'&&req.method==='GET'){json(res,{projects:[...projects.values()].filter(p=>p.workflow&&!p.archived&&!p.assistantCatalog).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(projectView)});return;}
      if(url.pathname==='/api/upload'&&req.method==='POST'){
        const requestId=req.headers['x-request-id'];if(typeof requestId!=='string'||requestId.length>100)throw new Error('缺少上传请求标识');
        const existing=[...projects.values()].find(p=>p.uploadRequest===requestId);
        if(existing){req.resume();json(res,projectView(existing));return;}
        if(uploads.has(requestId))throw Object.assign(new Error('该文件仍在上传，请稍后查看任务列表。'),{status:409});
        const filename=decodeURIComponent(req.headers['x-filename']||'video.mp4'),ext=path.extname(filename).toLowerCase();
        if(!['.mp4','.webm','.mov','.m4v'].includes(ext))throw new Error('请选择 MP4、WebM 或 MOV 视频');
        const max=500*1024*1024;if(Number(req.headers['content-length'])>max)throw Object.assign(new Error('文件超过500MB'),{status:413});
        uploads.add(requestId);const id=randomUUID(),dir=projectDir(id);await mkdir(dir,{recursive:true});const file=path.join(dir,'source'+ext),handle=await open(file,'wx');let size=0;
        try{
          for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('文件超过500MB'),{status:413});await handle.write(chunk);}
          await handle.close();const p=await registerUpload(id,filename,file,{guided:true});p.uploadRequest=requestId;
          json(res,await startWorkflow(p,req.headers['x-voice'],{sceneFlow:req.headers['x-scene-flow']==='1'}));
        }catch(error){await handle.close().catch(()=>{});if(!projects.has(id))await unlink(file).catch(()=>{});throw error;}finally{uploads.delete(requestId);}
        return;
      }
      if(url.pathname==='/api/assistant/interpret'&&req.method==='POST'){
        const controller=new AbortController();res.on('close',()=>controller.abort());
        const input=await readJSON(req,50_000),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]);
        const result=await interpretAssistant(input,signal);if(!res.destroyed)json(res,result);return;
      }
      if(url.pathname==='/api/assistant/context'&&req.method==='POST'){json(res,await assistantContext(await readJSON(req)));return;}
      if(url.pathname==='/api/assistant/voice'&&req.method==='POST'){json(res,await assistantVoice(await readJSON(req,30_000_000)));return;}
      if(url.pathname==='/api/assistant/read'&&req.method==='POST'){const input=await readJSON(req,30_000_000),controller=new AbortController();res.on('close',()=>controller.abort());json(res,await readAssistantText(input,controller.signal));return;}
      if(url.pathname==='/api/assistant/run'&&req.method==='POST'){json(res,await beginAssistantRun(await readJSON(req,30_000_000)));return;}
      const assistantMatch=/^\/api\/assistant\/([a-zA-Z0-9-]+)\/(jobs\/([a-zA-Z0-9-]+)|accept)$/.exec(url.pathname);
      if(assistantMatch){
        if(req.method==='GET'&&assistantMatch[3]){json(res,assistantJob(assistantMatch[1],assistantMatch[3]));return;}
        if(req.method==='POST'&&assistantMatch[2]==='accept'){json(res,await acceptAssistant(assistantMatch[1],await readJSON(req)));return;}
      }
      const match=/^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/(listen-action|listen-voice|revision-context|revision-preview))?$/.exec(url.pathname);
      if(match){
        const p=getProject(match[1]);if(!p.workflow||p.archived)throw Object.assign(new Error('作品不存在'),{status:404});
        if(match[2]==='revision-context'&&req.method==='GET'){json(res,await revisionContext(p));return;}
        if(match[2]==='revision-preview'&&req.method==='POST'){
          const input=await readJSON(req),draft=await validateRevision(p,{...input,scope:'project'}),version=p.workflow.current.id;
          const controller=new AbortController();res.on('close',()=>controller.abort());
          const proposal=await proposeRevision({...draft,instruction:input.instruction},controller.signal);
          if(version!==p.workflow.current.id)throw Object.assign(new Error('项目已更新，请重新打开修订'),{status:409});
          if(proposal.clarification){json(res,{clarification:proposal.clarification});return;}
          const entries=validatePromptEntries({...draft.entries,narration:proposal.narration,shorten:proposal.shorten});
          await validateRevision(p,{...input,scope:'project',entries,settings:proposal.settings});
          if(!res.destroyed)json(res,{entries,settings:proposal.settings,summary:proposal.summary});return;
        }
        if(!match[2]&&req.method==='GET'){json(res,projectView(p));return;}
        if(req.method==='POST'&&match[2]==='listen-action'){json(res,await workflowAction(p,await readJSON(req)));return;}
        if(req.method==='POST'&&match[2]==='listen-voice'){json(res,await transcribeRecording(p,await readBody(req,8*1024*1024),url.searchParams.get('recordingId')));return;}
      }
      if(!['GET','HEAD'].includes(req.method)){json(res,{error:'不支持此操作'},405);return;}
      const media=/^\/media\/([a-zA-Z0-9-]+)\/(.+)$/.exec(url.pathname);
      if(media){
        const p=getProject(media[1]);if(!p.workflow||p.archived)throw Object.assign(new Error('作品不存在'),{status:404});
        const relative=decodeURIComponent(media[2]);if(!/\.(mp4|webm|mov|m4v|wav|mp3|jpg|png)$/i.test(relative)||relative.startsWith('feedback-'))throw Object.assign(new Error('媒体不可访问'),{status:403});
        await sendFile(req,res,contained(projectDir(p.id),relative));return;
      }
      const film=films.find(f=>url.pathname==='/api/media/'+f.fileName);
      if(film){await sendFile(req,res,contained(root,film.video));return;}
      if(url.pathname.startsWith('/api/')){json(res,{error:'接口不存在'},404);return;}
      await sendFile(req,res,contained(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1))));
    }catch(error){
      if(!res.headersSent)json(res,{error:error instanceof SpeechError?error.message:error.code?'本地文件处理失败，请检查文件和磁盘后重试。':error.message, ...(error.recordingId?{recordingId:error.recordingId}:{})},error.status||400);else res.destroy();
    }
  });
  installRealtimeASR(server,{publicOrigin});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  process.env.TINGJIAN_TTS_PROVIDER||='doubao';await initializeStore();await initializeAI();
  const server=createLocalServer();server.listen(Number(process.env.PORT||5294),'127.0.0.1',()=>console.log(`听见本地服务：http://127.0.0.1:${server.address().port}`));
  const stop=async()=>{server.close();await Promise.all([stopWorkflows(),stopAssistantJobs()]);process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
