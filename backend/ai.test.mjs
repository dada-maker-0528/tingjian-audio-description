import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AIMEDIA_API_KEY='test-placeholder';
const {analyze,validateAnalysis,shorten}=await import('./ai.mjs');
const frames=[.5,1.5,2.5].map((time,i)=>({time,file:`frame-${i}.jpg`,url:'data:image/jpeg;base64,dGVzdA=='}));
const valid=()=>({scenes:[
  {title:'海面',firstFrame:0,lastFrame:1,evidenceFrame:0,evidence:'蓝色海面与浅色天空',facts:['蓝色海面'],category:'required',text:'蓝色海面。',uncertainty:'采样无法确认浪的运动方向。'},
  {title:'留白',firstFrame:2,lastFrame:2,evidenceFrame:2,evidence:'相同海面，无新事实',facts:[],category:'none',text:'',uncertainty:''}
]});
const envelope=(value,name='submit_scene_analysis')=>({choices:[{message:{content:'不得把这段文本当作场景结果',tool_calls:[{type:'function',function:{name,arguments:JSON.stringify(value)}}]}}]});
async function mocked(values,fn){
  const original=globalThis.fetch,requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push(JSON.parse(options.body));assert.ok(requests.length<=values.length,'Repair attempts must be bounded');
    return new Response(JSON.stringify(values[requests.length-1]),{status:200});
  };
  try{return await fn(requests);}finally{globalThis.fetch=original;}
}
const run=()=>analyze(frames,{text:'',segments:[]},[{start:0,end:3}],3);
test('personal analysis advertises and enforces the same 12-group limit',async()=>{
  const many=Array.from({length:13},(_,i)=>({time:i+.5,file:`frame-${i}.jpg`,url:frames[0].url}));
  const value={scenes:many.map((_,i)=>({...valid().scenes[0],firstFrame:i,lastFrame:i,evidenceFrame:i}))};
  await mocked([envelope(value),envelope(value)],async requests=>{
    await assert.rejects(analyze(many,{segments:[]},[{start:0,end:26}],26,undefined,{personal:true}),/最多12个/);
    assert.equal(requests[0].tools[0].function.parameters.properties.scenes.maxItems,12);
    assert.match(requests[0].messages[0].content,/绝对不得超过 12 组/);
    assert.equal(requests.length,2);
  });
});
test('uses typed tool arguments and preserves no-narration scene and uncertainty',async()=>{
  await mocked([envelope(valid())],async requests=>{
    const scenes=await run();assert.equal(scenes.length,2);assert.equal(scenes[1].category,'none');
    assert.equal(scenes[0].uncertainty,valid().scenes[0].uncertainty);assert.equal(scenes[1].end,3);
    assert.equal(requests[0].tool_choice,'required');
    const schema=requests[0].tools[0].function.parameters.properties.scenes.items.properties;
    assert.deepEqual(schema.firstFrame,{type:'integer',minimum:0,maximum:2});
  });
});
test('missing frame numbers trigger one repair with original facts retained',async()=>{
  const invalid=valid();delete invalid.scenes[0].firstFrame;
  await mocked([envelope(invalid),envelope(valid())],async requests=>{
    assert.equal((await run()).length,2);assert.equal(requests.length,2);
    assert.ok(requests[1].messages.some(m=>m.role==='assistant'&&m.content.includes('采样无法确认浪的运动方向')));
    assert.match(requests[1].messages.at(-1).content,/firstFrame/);
  });
});
test('repeated invalid numbering fails after exactly one repair',async()=>{
  const invalid=valid();invalid.scenes[0].firstFrame='0';
  await mocked([envelope(invalid),envelope(invalid)],async requests=>{
    await assert.rejects(run,/一次结构修复后仍有问题.*firstFrame/);assert.equal(requests.length,2);
  });
});
test('unknown or multiple tool calls cannot be used as scene results',async()=>{
  await mocked([envelope(valid(),'delete_files'),envelope(valid(),'delete_files')],async()=>{
    await assert.rejects(run,/模型仍未返回有效的场景 JSON/);
  });
  const two=envelope(valid());two.choices[0].message.tool_calls.push(two.choices[0].message.tool_calls[0]);
  await mocked([two,two],async()=>{await assert.rejects(run,/模型仍未返回有效的场景 JSON/);});
});
test('coverage gaps, overlap and evidence outside its group remain invalid',()=>{
  for(const mutate of [s=>s[1].firstFrame=1,s=>s[0].lastFrame=0,s=>s[0].evidenceFrame=2,s=>s.pop()]){
    const value=valid();mutate(value.scenes);
    assert.throws(()=>validateAnalysis(value,frames,{segments:[]},3,[{start:0,end:3}]));
  }
});
test('narration shortening also uses structured arguments with its length budget',async()=>{
  await mocked([envelope({text:'浪峰隆起。',reason:'保留可见形状，去掉重复描述。'},'submit_narration_edit')],async requests=>{
    const result=await shorten({text:'蓝绿色海面上，近处的浪峰隆起。',evidence:'可见浪峰',facts:['浪峰隆起'],insertStart:0,insertEnd:3,audio:{duration:5}});
    assert.equal(result.text,'浪峰隆起。');assert.equal(requests[0].tools[0].function.name,'submit_narration_edit');
    assert.equal(requests[0].tools[0].function.parameters.properties.text.maxLength,9);
  });
});

test('shortener repairs using measured character count, and accepts validated text JSON only when tool calls are absent',async()=>{
  const scene={text:'车手戴好手套，仪表盘亮起。',evidence:'车手与仪表盘',facts:['仪表盘亮起'],insertStart:0,insertEnd:3,audio:{duration:4}};
  await mocked([envelope({text:scene.text,reason:'自称九字'},'submit_narration_edit'),{choices:[{message:{content:JSON.stringify({text:'仪表盘亮起。',reason:'只保留仪表盘，省略手套。'})}}]}],async requests=>{
    assert.equal((await shorten(scene)).text,'仪表盘亮起。');assert.equal(requests.length,2);
    assert.match(requests[1].messages.at(-1).content,new RegExp(`上次text有${scene.text.length}个字符`));
  });
  await mocked([envelope({text:'短句'},'unknown_action'),envelope({text:'短句'},'unknown_action')],async()=>await assert.rejects(shorten(scene),/未按要求/));
});
