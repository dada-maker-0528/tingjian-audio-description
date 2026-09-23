import {readFile,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=path.join(root,'public');
for(const file of ['index.html','portrait.html']){
 const html=await readFile(path.join(publicRoot,file),'utf8');
 if(!html.includes('assets/doubao-vivi'))throw new Error(`${file}: missing Doubao voice cache`);
 for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(https?:|data:)/.test(match[1]))continue;
  const asset=path.resolve(publicRoot,match[1]);
  if(!asset.startsWith(publicRoot+path.sep))throw new Error('Asset outside public directory');
  await stat(asset);
 }
}
async function checkAssetSizes(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())await checkAssetSizes(file);
  else if((await stat(file)).size>25*1024*1024)throw new Error(`Cloudflare asset exceeds 25 MiB: ${entry.name}`);
 }
}
await checkAssetSizes(publicRoot);
const manifest=JSON.parse(await readFile(path.join(publicRoot,'assets/doubao-vivi/manifest.json'),'utf8'));
if(manifest.provider!=='volcengine'||manifest.voice!=='vivi'||manifest.records.length!==7)throw new Error('Unexpected voice manifest');
for(const record of manifest.records){
 const bytes=await readFile(path.join(publicRoot,'assets/doubao-vivi',record.file));
 if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw new Error(`Changed audio: ${record.file}`);
}
console.log('Verified fullscreen and phone pages, all referenced assets, 7 Doubao audio hashes, and asset sizes.');
