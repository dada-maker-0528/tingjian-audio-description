import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for (const dir of ['backend','server','public','scripts']) {
  for (const name of await readdir(dir)) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const result=spawnSync(process.execPath,['--check',`${dir}/${name}`],{stdio:'inherit',windowsHide:true});
    if(result.status!==0)process.exit(result.status||1);
  }
}
console.log('JavaScript syntax checks passed');
