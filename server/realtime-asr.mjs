import WebSocket,{WebSocketServer} from 'ws';
import {randomUUID} from 'node:crypto';

export function realtimeConfig(env=process.env){
 const key=env.TINGJIAN_ASR_API_KEY,base=env.TINGJIAN_ASR_BASE_URL;
 if(!key||!base)return null;
 const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw new Error('实时识别地址必须使用 HTTPS');
 url.protocol='wss:';url.pathname='/api-ws/v1/realtime';url.search='';
 const model=env.TINGJIAN_ASR_MODEL||'qwen3-asr-flash-realtime';url.searchParams.set('model',model);
 return {url,key,model};
}
export function allowedSpeechOrigin(req,publicOrigin){
 const host=req.headers.host,local=[`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`].includes(host);
 const external=publicOrigin&&host===publicOrigin.host;
 return !!(local||external)&&req.headers.origin===(external?publicOrigin.origin:`http://${host}`)&&req.headers['sec-fetch-site']!=='cross-site';
}
export function installRealtimeASR(server,{publicOrigin}={}){
 const sockets=new WebSocketServer({noServer:true,maxPayload:65536});
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/api/asr/realtime'||!allowedSpeechOrigin(req,publicOrigin)||sockets.clients.size>=8){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  sockets.handleUpgrade(req,socket,head,client=>bridge(client));
 });
 function bridge(client){
  let upstream,ready=false,finished=false,finishing=false,total=0,turn=0;
  const send=data=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(data));};
  const fail=message=>{if(finished)return;finished=true;send({type:'error',message});upstream?.close();client.close();};
  const timer=setTimeout(()=>fail('语音连接超时，录音保留后可重试。'),95000);
  const heartbeat=setInterval(()=>{if(client.readyState===WebSocket.OPEN)client.ping();},15000);
  client.on('error',()=>{});
  client.on('close',()=>{clearTimeout(timer);clearInterval(heartbeat);upstream?.close();});
  const event=data=>{if(upstream?.readyState===WebSocket.OPEN)upstream.send(JSON.stringify({event_id:randomUUID(),...data}));};
  try{
   const config=realtimeConfig();if(!config){fail('实时语音识别尚未配置，请联系维护者连接百炼。');return;}
   upstream=new WebSocket(config.url,{headers:{Authorization:'Bearer '+config.key,'OpenAI-Beta':'realtime=v1'},handshakeTimeout:12000,maxPayload:1_000_000});
   upstream.on('open',()=>event({type:'session.update',session:{modalities:['text'],input_audio_format:'pcm',sample_rate:16000,input_audio_transcription:{language:'zh'},turn_detection:{type:'server_vad',threshold:.2,silence_duration_ms:400}}}));
   upstream.on('error',()=>fail('百炼实时识别连接失败，录音已保留，可重试。'));
   upstream.on('close',()=>{if(!finished)fail('实时识别连接中断，录音已保留，可重试。');});
   upstream.on('message',bytes=>{
    let value;try{value=JSON.parse(bytes.toString());}catch{fail('实时识别返回格式异常，请重试。');return;}
    if(value.type==='session.updated'){ready=true;send({type:'ready',model:config.model});}
    else if(value.type==='conversation.item.input_audio_transcription.text')send({type:'transcript',id:value.item_id||String(turn),text:String(value.text||'')+String(value.stash||''),final:false});
    else if(value.type==='conversation.item.input_audio_transcription.completed'){send({type:'transcript',id:value.item_id||String(turn),text:String(value.transcript||''),final:true});turn++;}
    else if(value.type==='session.finished'){finished=true;send({type:'done'});upstream.close();client.close();}
    else if(value.type==='error'||value.type==='conversation.item.input_audio_transcription.failed')fail('百炼未完成本次识别，请检查服务配置或重试；录音已保留。');
   });
   client.on('message',(bytes,binary)=>{
    if(!ready||finished||finishing)return;
    if(binary){
     total+=bytes.length;if(total>2_100_000||bytes.length%2){fail('录音超过 60 秒或音频格式无效。');return;}
     if(upstream.bufferedAmount>1_000_000){fail('语音网络暂时拥堵，录音已保留。');return;}
     event({type:'input_audio_buffer.append',audio:bytes.toString('base64')});
    }else{
     let value;try{value=JSON.parse(bytes.toString());}catch{fail('语音控制指令无效。');return;}
     if(value.type==='finish'){finishing=true;event({type:'session.finish'});}
     else fail('语音控制指令无效。');
    }
   });
  }catch{fail('实时识别配置不可用，请联系维护者检查。');}
 }
 server.on('close',()=>{for(const client of sockets.clients)client.terminate();sockets.close();});
 return sockets;
}
