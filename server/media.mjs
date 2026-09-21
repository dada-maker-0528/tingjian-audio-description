// A fixed media route preserves seeking even when the asset binding ignores Range.
export async function serveDemoVideo(request,assets){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
 const url=new URL(request.url);url.pathname='/assets/rain-before.mp4';
 const headers=new Headers(request.headers);headers.delete('Range');
 const source=await assets.fetch(new Request(url,{method:'GET',headers}));
 if(!source.ok)return new Response('Video unavailable',{status:502});
 const bytes=await source.arrayBuffer();const size=bytes.byteLength;let start=0,end=size-1,status=200;
 const range=request.headers.get('Range');
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  status=206;
 }
 const outputHeaders={'Content-Type':'video/mp4','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600'};
 if(status===206)outputHeaders['Content-Range']=`bytes ${start}-${end}/${size}`;
 return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status,headers:outputHeaders});
}
