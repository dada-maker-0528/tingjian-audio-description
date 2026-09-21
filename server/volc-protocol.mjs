const encoder=new TextEncoder();
const decoder=new TextDecoder();
const connectionEvents=new Set([1,2,50,51,52]);
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function int32(n){const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n);return a;}
export function encodeEvent(event,payload={},sessionId=''){
 const data=encoder.encode(JSON.stringify(payload));const parts=[new Uint8Array([0x11,0x14,0x10,0]),int32(event)];
 if(!connectionEvents.has(event)){const sid=encoder.encode(sessionId);if(!sid.length)throw new Error('Session id is required');parts.push(int32(sid.length),sid);}
 parts.push(int32(data.length),data);return concat(parts);
}
export function decodeMessage(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<4)throw new Error('Protocol message too short');
 const version=bytes[0]>>4,headerSize=(bytes[0]&15)*4;
 if(version!==1||headerSize<4)throw new Error('Unsupported protocol version or header');
 const type=bytes[1]>>4,flags=bytes[1]&15,serialization=bytes[2]>>4,compression=bytes[2]&15;
 let pos=headerSize;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const readInt=()=>{if(pos+4>bytes.length)throw new Error('Truncated protocol integer');const n=view.getUint32(pos);pos+=4;return n;};
 const readBytes=n=>{if(n>bytes.length-pos)throw new Error('Truncated protocol payload');const r=bytes.subarray(pos,pos+n);pos+=n;return r;};
 let event=0,sessionId='',connectId='',errorCode=0;
 if(flags&1)readInt();if(type===15)errorCode=readInt();
 if(flags&4){event=readInt();if(!connectionEvents.has(event))sessionId=decoder.decode(readBytes(readInt()));else if([50,51,52].includes(event))connectId=decoder.decode(readBytes(readInt()));}
 const payload=readBytes(readInt());
 if(pos!==bytes.length)throw new Error('Unexpected trailing protocol data');
 return {type,flags,event,sessionId,connectId,errorCode,serialization,compression,payload};
}
export function joinAudio(chunks){return concat(chunks);}
export function pcmToWav(pcm,sampleRate=24000){
 if(pcm.length%2)throw new Error('Invalid PCM byte count');
 const header=new Uint8Array(44),v=new DataView(header.buffer);const text=(s,at)=>header.set(encoder.encode(s),at);
 text('RIFF',0);v.setUint32(4,36+pcm.length,true);text('WAVE',8);text('fmt ',12);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text('data',36);v.setUint32(40,pcm.length,true);return concat([header,pcm]);
}
