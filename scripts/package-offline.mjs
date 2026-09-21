import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('outputs',{recursive:true});
const result=await build({entryPoints:['public/app.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,minify:true});
const types={'.mp4':'video/mp4','.m4a':'audio/mp4','.jpg':'image/jpeg','.png':'image/png'};
const assets={};
for(const name of await readdir('public/assets')){const ext=name.slice(name.lastIndexOf('.'));if(types[ext])assets['assets/'+name]={type:types[ext],data:(await readFile('public/assets/'+name)).toString('base64')};}
let html=await readFile('public/index.html','utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+await readFile('public/styles.css','utf8')+'</style>');
html=html.replace('<script type="module" src="app.js"></script>','<script>window.__TINGJIAN_ASSETS__='+JSON.stringify(assets)+';'+result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>');
await writeFile('outputs/听见_AI口述影像_Demo.html',html);
console.log('Packaged current film as an offline HTML demo');
