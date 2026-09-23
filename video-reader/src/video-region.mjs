export function pictureRect(bounds,width,height,fit='contain'){
 if(!width||!height||bounds.width<=0||bounds.height<=0)return null;
 if(fit==='cover')return {left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height};
 const scale=Math.min(bounds.width/width,bounds.height/height),w=width*scale,h=height*scale;
 return {left:bounds.left+(bounds.width-w)/2,top:bounds.top+(bounds.height-h)/2,width:w,height:h};
}
export function findVideoRegion(candidates,viewport){
 let best=null,area=0;
 for(const candidate of candidates){
  if(candidate.visible===false)continue;
  const rect=pictureRect(candidate.bounds,candidate.width,candidate.height,candidate.fit);if(!rect)continue;
  const w=Math.max(0,Math.min(rect.left+rect.width,viewport.width)-Math.max(0,rect.left));
  const h=Math.max(0,Math.min(rect.top+rect.height,viewport.height)-Math.max(0,rect.top));
  if(w>=80&&h>=80&&w*h>area){area=w*h;best={candidate,rect};}
 }
 return best;
}
