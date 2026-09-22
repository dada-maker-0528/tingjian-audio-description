import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'dist','node');
// Keep the complete upstream browser UI and the real Node processing service
// together. Credentials and local projects are deliberately outside this build.
async function check(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())await check(file);
  else if(/\.(mjs|js)$/.test(entry.name))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
 }
}
for(const name of ['public','backend','server'])await check(path.join(root,name));
await mkdir(output,{recursive:true});
for(const name of ['public','backend','server'])await cp(path.join(root,name),path.join(output,name),{recursive:true});
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(output,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,private:true,type:'module',scripts:{start:'node --env-file-if-exists=.env server/local.mjs'},engines:{node:'>=22'},dependencies:pkg.dependencies},null,2)+'\n','utf8');
console.log('Built real Node service and original browser UI: dist/node');
