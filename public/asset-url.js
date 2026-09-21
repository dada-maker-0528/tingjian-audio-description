const cache=new Map();
export function assetURL(path){
 const entry=window.__TINGJIAN_ASSETS__?.[path];if(!entry)return path;
 if(!cache.has(path)){const data=atob(entry.data),bytes=new Uint8Array(data.length);for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);cache.set(path,URL.createObjectURL(new Blob([bytes],{type:entry.type})));}
 return cache.get(path);
}
