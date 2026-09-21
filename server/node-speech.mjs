import WebSocket from 'ws';
import {openSpeech,SpeechError} from './volc-client.mjs';

// Adapt only the transport; event framing and session handling remain shared.
export async function nodeUpgrade(url,{headers,signal}) {
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url.replace(/^https:/,'wss:'),{headers,handshakeTimeout:15000,maxPayload:5_000_000});
    socket.on('error',()=>{}); // Never expose upstream headers/credentials in errors.
    const abort=()=>{socket.terminate();reject(new SpeechError('aborted','语音连接已取消。',499));};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    socket.once('error',()=>{signal?.removeEventListener('abort',abort);reject(new SpeechError('connection_error','豆包语音连接失败，请检查服务配置。'));});
    socket.once('open',()=>{
      signal?.removeEventListener('abort',abort);
      socket.accept=()=>{};
      resolve({webSocket:socket});
    });
  });
}
export const openNodeSpeech=(env,signal)=>openSpeech(env,signal,nodeUpgrade);
