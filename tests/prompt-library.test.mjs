import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.AIMEDIA_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'tingjian-prompts-'));
process.env.AIMEDIA_API_KEY='test-placeholder';
const {promptProfile,savePromptProfile,promptText}=await import('../backend/prompt-library.mjs');
const {assistPrompt,identifyRoles,shorten,proposeRevision}=await import('../backend/ai.mjs');
test('prompt profiles persist, reject concurrent overwrite and preserve a running task snapshot',async()=>{
 const original=await promptProfile(),snapshot=structuredClone(original);
 const first=await savePromptProfile({revision:original.revision,entries:{...original.entries,narration:'优先交代人物位置与空间关系。'}});
 assert.equal(first.revision,2);assert.equal((await promptProfile()).entries.narration,first.entries.narration);
 await assert.rejects(()=>savePromptProfile({revision:original.revision,entries:original.entries}),e=>e.status===409);
 assert.equal((await promptProfile()).revision,2);assert.ok(!(await promptText('narration',snapshot)).includes('优先交代人物位置'));
 assert.ok((await promptText('narration')).includes('优先交代人物位置'));
 await assert.rejects(()=>savePromptProfile({revision:2,entries:{...first.entries,roles:''}}),/1—6000/);
 assert.equal(JSON.parse(await readFile(path.join(process.env.AIMEDIA_DATA_DIR,'prompt-library.json'),'utf8')).revision,2);
});
test('revision draft repairs one malformed model response and never saves the library',async()=>{
 const originalFetch=globalThis.fetch,before=await promptProfile();let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:calls===1?{content:'not structured'}:{tool_calls:[{type:'function',function:{name:'submit_revision_plan',arguments:JSON.stringify({settings:{speed:.8,gain:.88,density:'balanced',voice:'vivi'},narration:before.entries.narration,shorten:before.entries.shorten,summary:'语速稍慢',clarification:''})}}]}}]}));};
 try{const draft=await proposeRevision({settings:{speed:1,gain:.88,density:'balanced',voice:'vivi'},entries:before.entries,instruction:'旁白慢一点'});assert.equal(calls,2);assert.equal(draft.settings.speed,.8);assert.deepEqual(await promptProfile(),before);}
 finally{globalThis.fetch=originalFetch;}
});
test('AI suggestion requires adoption and saved prompt styles reach actual role and editing requests',async()=>{
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);const name=body.tools[0].function.name;
  const value=name==='submit_prompt_edit'?{text:'优先描述空间关系，句式简洁。',summary:'增加空间关系要求。'}:name==='submit_roles'?{roles:[]}:{text:'走近',reason:'保留主要动作'};
  return new Response(JSON.stringify({choices:[{message:{tool_calls:[{type:'function',function:{name,arguments:JSON.stringify(value)}}]}}]}));
 };
 try{
  const before=await promptProfile();const suggestion=await assistPrompt({id:'narration',text:before.entries.narration,instruction:'增加空间关系'});
  assert.equal(suggestion.text,'优先描述空间关系，句式简洁。');assert.deepEqual(await promptProfile(),before);
  const custom={revision:8,entries:{...before.entries,roles:'ROLE_STYLE_MARKER',shorten:'EDIT_STYLE_MARKER'}};
  await identifyRoles([{url:'data:image/png;base64,a',time:0,file:'frame'}],{},undefined,custom);
  await shorten({text:'人物向前走近。',insertStart:0,insertEnd:3,evidence:'行走',facts:['行走']},undefined,custom);
  assert.ok(requests.some(r=>r.messages[0].content.includes('ROLE_STYLE_MARKER')));
  assert.ok(requests.some(r=>r.messages[0].content.includes('EDIT_STYLE_MARKER')));
  await assert.rejects(()=>assistPrompt({id:'unknown',text:'a',instruction:'b'}),/请选择提示词/);
 }finally{globalThis.fetch=originalFetch;}
});
