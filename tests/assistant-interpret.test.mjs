import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AIMEDIA_API_KEY='test-only';
const {interpretAssistant}=await import('../backend/assistant-interpret.mjs');
test('semantic request includes prompt library, scene context and all 29 fields; output is validated',async t=>{
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
 let result={kind:'patch',patches:[{field:'reference_mode',value:'每个动作点名'}],message:'点明每个动作的人物。'},seen;
 globalThis.fetch=async(url,options)=>{seen=JSON.parse(options.body);const content=JSON.stringify(result);return new Response(JSON.stringify({choices:[{message:{content,tool_calls:[{type:'function',function:{name:'submit_assistant_intent',arguments:content}}]}}]}));};
 const input={text:'我听不明白是谁在做什么',filmId:'nezha-s1-20260922',sceneId:'scene-s1',effective:{},history:[]};
 const value=await interpretAssistant(input);assert.equal(value.semantic.provider,'model');assert.match(value.semantic.promptHash,/^[a-f0-9]{64}$/);assert(seen.messages[0].content.includes('制作提示词库'));assert(seen.messages[0].content.includes('reference_mode'));assert(seen.messages[0].content.includes('sentence_pause'));assert(seen.messages[1].content.includes('哪吒'));
 result={kind:'patch',patches:[{field:'nonexistent_field',value:'yes'}],message:''};await assert.rejects(()=>interpretAssistant(input),/未知/);
 result={kind:'patch',patches:[{field:'reference_mode',value:'每个动作点名',targetCharacterId:'wrong-person'}],message:''};await assert.rejects(()=>interpretAssistant(input),/人物/);
 result={kind:'clarify',patches:[],message:'请明确想调整的地方。'};assert.equal((await interpretAssistant(input)).kind,'clarify');
 result={kind:'patch',patches:[],message:'当前方案已经包含这些设置。'};assert.equal((await interpretAssistant(input)).kind,'explain');
 result={kind:'explain',patches:[{field:'reference_mode',value:'每个动作点名'}],message:'沿用点名人物的方案。'};assert.equal((await interpretAssistant(input)).kind,'patch');
});
