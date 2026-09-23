// Titles describe visible actions. A model-generated title is not evidence of kinship.
const relations=/父子|父女|母子|母女|夫妻|夫妇|兄弟俩|姐妹俩|姐弟俩|兄妹俩/g;
export function groundedSceneTitle(scene,transcript={}){
 const title=String(scene.title||'');
 const segments=transcript?.segments||[];
 const evidence=segments.length?segments.filter(s=>s.start<scene.end&&s.end>scene.start).map(s=>s.text).join(' '):String(transcript?.text||'');
 return title.replace(relations,term=>evidence.includes(term)?term:'两人');
}
