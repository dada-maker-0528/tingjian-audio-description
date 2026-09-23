const knownPeople={'scene-01':['C01'],'scene-03':['C01'],'scene-04':['C01','C02'],'scene-06':['C01','C02','C03']};
export function characterRegistry(film){return(film.roles||[]).map((r,i)=>({id:'C'+String(i+1).padStart(2,'0'),name:r.name,visualName:r.visualName||(film.id==='user-film-a711ab9d-v1'?['短发男子','白衣中年男子','戴眼镜的男子'][i]:r.name)||r.name,detail:r.detail,nameRevealedAt:r.nameRevealedAt??(film.id==='user-film-a711ab9d-v1'&&i===0?34.35:null)}));}
export function makeContext(film,sceneId,playhead=0,taskId='demo'){
 const scene=film.scenes?.find(s=>s.id===sceneId);if(!scene)throw new Error('找不到这个场景。');
 if(film.actualContext){
  const registry=film.roles||[],cues=(scene.cues||[]).map(c=>({...c})),windows=cues.map(c=>({id:c.windowId,start:c.start,end:c.start+c.maxDuration,maxDuration:c.maxDuration}));
  return {taskId,filmId:film.id,film,scene,sceneId,number:scene.storyNumber||film.scenes.indexOf(scene)+1,playhead:Math.max(scene.start,Math.min(scene.end,playhead)),registry,characters:scene.characterIds?registry.filter(r=>scene.characterIds.includes(r.id)):[],cues,windows,protectedRanges:[],facts:scene.facts||[],limitations:['场景与人物来自现有素材或已有分析，内容仍需人工核对。','仅在当前版本已有旁白窗口内重制；不修改原片和原声。'],selectedCharacterId:null};
 }
 const registry=characterRegistry(film),ids=scene.characterIds||knownPeople[scene.id]||[];
 const cues=(film.narration?.['normal-balanced']||[]).filter(c=>c.start>=scene.start&&c.start<scene.end&&c.reviewStatus!=='pending').map((c,i)=>({...c,id:scene.id+'-n'+(i+1),windowId:scene.id+'-w'+(i+1),maxDuration:Math.min(c.maxDuration,scene.end-c.start)}));
 const windows=cues.map(c=>({id:c.windowId,start:c.start,end:c.start+c.maxDuration,maxDuration:c.maxDuration}));
 let cursor=scene.start;const protectedRanges=[];for(const w of windows){if(cursor<w.start)protectedRanges.push({start:cursor,end:w.start});cursor=w.end;}if(cursor<scene.end)protectedRanges.push({start:cursor,end:scene.end});
 const sceneAppearance=scene.id==='scene-01'?{C01:'黑色短发，穿黄色上衣、戴头盔。'}:scene.id==='scene-06'?{C02:'白色短袖上衣。',C03:'戴细框眼镜，穿西装和衬衣。'}:{};
 const characters=registry.filter(c=>ids.includes(c.id)).map(c=>({...c,detail:sceneAppearance[c.id]||'当前场景外观尚未逐项标注，请核对原片。'}));
 return {taskId,filmId:film.id,film,scene,sceneId,number:scene.storyNumber||film.scenes.indexOf(scene)+1,playhead:Math.max(scene.start,Math.min(scene.end,playhead)),registry,characters,cues,windows,protectedRanges,
  facts:[{id:scene.id+'-f1',revealedAt:scene.start,text:'场景：'+scene.title},...cues.map((c,i)=>({id:scene.id+'-f'+(i+2),revealedAt:c.start,text:c.text}))],
  limitations:['使用本片已核对的预设场景和现有旁白，未连接画面分析模型。','未提供完整分镜、人物进出时间、画面文字转写；缺失信息待核对，不补写。','旁白窗口之外保留原声；尚未逐句标注对白与重要音效。'],selectedCharacterId:null};
}
