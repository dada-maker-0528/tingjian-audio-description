export function overlayLayout(videoRect,surface,viewport,searching=false){
 const host=surface||{left:0,top:0,width:viewport.width,height:viewport.height};
 const local=videoRect?{left:videoRect.left-host.left,top:videoRect.top-host.top,width:videoRect.width,height:videoRect.height}:null;
 const frame=searching?(surface?{left:6,top:27,width:host.width-12,height:host.height-84}:{left:18,top:18,width:Math.max(100,host.width-36),height:Math.max(100,host.height-114)}):local;
 return {frame,captionWidth:surface?Math.max(100,host.width-76):local?Math.max(180,Math.min(760,local.width-32)):null,captionBottom:surface?210:local?Math.max(100,host.height-local.top-local.height+24):100,chipTop:surface?120:local?local.top+14:50};
}
