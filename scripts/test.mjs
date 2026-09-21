import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
const files=[];
for(const dir of ['tests','backend'])for(const name of await readdir(dir))if(name.endsWith('.test.mjs'))files.push(`${dir}/${name}`);
// Test doubles must never inherit a production speech key or provider selection.
const env={...process.env,AIMEDIA_API_KEY:'test-placeholder',OPENAI_API_KEY:'',VOLC_TTS_KEY:'',AIMEDIA_PROVIDER:'minimax',AIMEDIA_BASE_URL:'https://api.minimaxi.com/v1',TINGJIAN_TTS_PROVIDER:'minimax'};
const result=spawnSync(process.execPath,['--test',...files],{env,stdio:'inherit',windowsHide:true});
process.exit(result.status??1);
