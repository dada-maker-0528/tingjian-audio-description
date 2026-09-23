import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveRecognition,realtimeSocketURL} from '../public/assistant/live-recognition.js';
import {VoiceInput} from '../public/assistant/voice-input.js';
import {realtimeConfig,allowedSpeechOrigin} from '../server/realtime-asr.mjs';

test('realtime connection follows current HTTP or HTTPS site',()=>{
 assert.equal(realtimeSocketURL({protocol:'http:',host:'127.0.0.1:5298'}),'ws://127.0.0.1:5298/api/asr/realtime');
 assert.equal(realtimeSocketURL({protocol:'https:',host:'tingjian.example:8443'}),'wss://tingjian.example:8443/api/asr/realtime');
});
test('provider credentials stay out of websocket URLs',()=>{
 assert.equal(realtimeConfig({}),null);
 const config=realtimeConfig({TINGJIAN_ASR_BASE_URL:'https://workspace.example/compatible-mode/v1',TINGJIAN_ASR_API_KEY:'test-secret'});
 assert.equal(config.url.href,'wss://workspace.example/api-ws/v1/realtime?model=qwen3-asr-flash-realtime');
 assert.equal(config.url.href.includes('test-secret'),false);
 assert.throws(()=>realtimeConfig({TINGJIAN_ASR_BASE_URL:'http://workspace.example',TINGJIAN_ASR_API_KEY:'test'}));
});
test('cloud websocket requires configured same origin',()=>{
 const req=(host,origin,site)=>({headers:{host,origin,'sec-fetch-site':site},socket:{localPort:5298}});
 const production=new URL('https://tingjian.example');
 assert.equal(allowedSpeechOrigin(req('tingjian.example','https://tingjian.example'),production),true);
 assert.equal(allowedSpeechOrigin(req('tingjian.example','https://attacker.example'),production),false);
 assert.equal(allowedSpeechOrigin(req('attacker.example','https://attacker.example'),production),false);
 assert.equal(allowedSpeechOrigin(req('tingjian.example','https://tingjian.example','cross-site'),production),false);
 assert.equal(allowedSpeechOrigin(req('localhost:5298','http://localhost:5298')),true);
 assert.equal(allowedSpeechOrigin(req('localhost:5298',undefined)),false);
});
test('interim words replace previous hypotheses and retain original input',()=>{
 const recognition=new LiveRecognition();let words='',sent=0;
 recognition.start=()=>recognition.onstart();
 const voice=new VoiceInput({factory:()=>recognition,onText:text=>words=text,onSubmit:()=>sent++});
 try{
  voice.start('已有要求');
  recognition.accept({type:'transcript',id:'one',text:'旁',final:false});assert.equal(words,'已有要求\n旁');
  recognition.accept({type:'transcript',id:'one',text:'旁白慢一点',final:false});assert.equal(words,'已有要求\n旁白慢一点');
  recognition.accept({type:'transcript',id:'one',text:'旁白慢一点。',final:true});
  recognition.accept({type:'transcript',id:'one',text:'迟到',final:false});assert.equal(words,'已有要求\n旁白慢一点。');
  recognition.accept({type:'transcript',id:'two',text:'动作少一点。',final:true});
  recognition.accept({type:'done'});assert.equal(words,'已有要求\n旁白慢一点。动作少一点。');assert.equal(sent,0);assert.equal(voice.state,'idle');
 }finally{voice.cancel();}
});
test('abort ignores late speech events',()=>{
 const r=new LiveRecognition();let events=0;r.onresult=()=>events++;r.abort();r.accept({type:'transcript',id:'late',text:'过期',final:true});assert.equal(events,0);
});
test('connection failure keeps recording for automatic fallback',()=>{
 const r=new LiveRecognition();r.start=()=>r.onstart();const voice=new VoiceInput({factory:()=>r});voice.start('已有要求');
 try{r.saved=[new Blob(['audio'])];r.fail('连接中断');assert.equal(voice.state,'listening');assert.equal(voice.current.prefix,'已有要求');assert.equal(r.saved.length,1);assert(r.realtimeFailure);}finally{voice.cancel();}
});
