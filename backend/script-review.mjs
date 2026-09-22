import { createHash } from 'node:crypto';

// Approval follows script content, not audio-generation or mix revisions.
export function scriptHash(p){
  const fields=['id','title','start','end','evidenceTime','evidence','facts','dialogue','text','category','insertStart','insertEnd','uncertainty','factResolution','timingOverride'];
  const scenes=(p.scenes||[]).map(s=>Object.fromEntries(fields.map(key=>[key,s[key]??null])));
  return createHash('sha256').update(JSON.stringify({source:p.sourceInfo?.sha256||p.source,duration:p.duration,scenes})).digest('hex');
}
export function scriptReview(p){
  const scenes=p.scenes||[],issues=[];
  if(!scenes.length)issues.push({scene:null,label:'请先生成制作脚本'});
  for(const s of scenes){
    if(s.category==='uncertain'||s.uncertainty?.trim()&&!s.factResolution?.trim())issues.push({scene:s.id,label:'画面事实还需要核实'});
    if(s.category==='none')continue;
    if(!s.text?.trim())issues.push({scene:s.id,label:'请填写旁白或标为无需口述'});
    if(!Number.isFinite(s.insertStart)||!Number.isFinite(s.insertEnd)||s.insertStart<Math.max(0,s.start-.05)||s.insertEnd<=s.insertStart||s.insertEnd>Math.min(p.duration,s.end)+.05)issues.push({scene:s.id,label:'请将旁白窗口安排在对应场景内'});
  }
  const approved=issues.length===0&&p.scriptApproval?.hash===scriptHash(p);
  return {approved,issues,approvedAt:approved?p.scriptApproval.approvedAt:null,needsReconfirmation:Boolean(p.scriptApproval&&!approved)};
}
export function requireScriptApproval(p){
  if(!scriptReview(p).approved)throw new Error('请先核对并确认当前制作脚本，再进行配音或合成；改稿后需要重新确认');
}
