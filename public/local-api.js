export class LocalAPI {
  async request(url,options={}){
    const timeout=url==='/api/upload'?300000:url.includes('/listen-voice')?220000:20000;
    let response;
    try{response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout),...options,headers:{'X-Tingjian-Request':'1',...options.headers}});}
    catch(error){throw new Error(error.name==='TimeoutError'?'等待服务响应超时。可以返回查看任务状态，或重试当前操作。':'暂时无法连接本地服务，请检查服务是否运行后重试。');}
    let body;try{body=await response.json();}catch{throw new Error('本地服务未返回可读取的结果，请检查服务是否仍在运行。');}
    if(!response.ok||!body.ok){const error=new Error(body.error||'请求未完成，请重试');error.status=response.status;error.recordingId=body.recordingId;throw error;}
    return body.data;
  }
  project(id){return this.request(`/api/projects/${encodeURIComponent(id)}`);}
  action(p,action,extra={},requestId=crypto.randomUUID()){
    return this.request(`/api/projects/${p.id}/listen-action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:p.workflow.revision,requestId,...extra})});
  }
  upload(file,id,voice){return this.request('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name),'X-Request-Id':id,...(voice?{'X-Voice':voice}:{})},body:file});}
  voice(p,blob,recordingId){return this.request(`/api/projects/${p.id}/listen-voice${recordingId?'?recordingId='+encodeURIComponent(recordingId):''}`,{method:'POST',body:recordingId?new Uint8Array():blob});}
}
