// Reuse actual source analysis; avoid a second model inventing new scene cuts
// inside the complete scene the user has just selected for review.
export function reuseSceneAnalysis(parent,child,start,end){
 child.scenes=parent.scenes.filter(s=>s.start<end&&s.end>start).map(s=>({...structuredClone(s),start:Math.max(start,s.start)-start,end:Math.min(end,s.end)-start,evidenceTime:Math.max(0,s.evidenceTime-start),insertStart:Math.max(start,s.insertStart)-start,insertEnd:Math.min(end,s.insertEnd)-start,audio:null,suggestion:null,reviewedRev:0}));
 child.windows=(parent.windows||[]).filter(w=>w.start<end&&w.end>start).map(w=>({start:Math.max(start,w.start)-start,end:Math.min(end,w.end)-start}));
 const segments=(parent.transcript?.segments||[]).filter(s=>s.start<end&&s.end>start).map(s=>({...s,start:Math.max(start,s.start)-start,end:Math.min(end,s.end)-start}));
 child.transcript={...structuredClone(parent.transcript||{}),segments,text:segments.map(s=>s.text).join(' ')||(parent.hasAudio?parent.transcript?.text||'':'')};
 child.windowSource=parent.windowSource;
 child.analysisFrames=(parent.analysisFrames||[]).filter(f=>f.time>=start&&f.time<end).map(f=>({...f,time:f.time-start}));
 child.aiRun={...parent.aiRun,reusedFrom:parent.id,range:{start,end}};
 child.provenance=parent.provenance;
 child.scenePlanSource={projectId:parent.id,start,end,analyzedAt:parent.aiRun?.analyzedAt};
 delete child.narrationGrouping;
}
