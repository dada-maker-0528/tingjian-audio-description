const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token}=process.env;
if(!account||!token)throw new Error('Missing Cloudflare deployment configuration');
const name='tingjian-video-reader-demo';
const branch='codex/video-reader-deploy';
const url=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects`;
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const existing=await fetch(`${url}/${name}`,{headers,signal:AbortSignal.timeout(20000)});
if(existing.ok){
 const data=await existing.json();
 if(!data.success||data.result.production_branch!==branch)throw new Error('Existing Pages project does not match this reader deployment branch');
 console.log('Reusing reader Pages project.');
}else if(existing.status===404){
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({name,production_branch:branch}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!response.ok||!data.success)throw new Error(`Pages project creation failed: HTTP ${response.status}; codes=${(data.errors||[]).map(e=>e.code).join(',')}`);
 console.log('Created reader Pages project.');
}else throw new Error(`Cannot inspect reader Pages project: HTTP ${existing.status}`);
