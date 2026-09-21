import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
export async function buildCatalog(){
 const root=path.resolve('public');const catalog=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));const films=[];const ids=new Set(),fileNames=new Set();
 if(!Array.isArray(catalog.manifests)||!catalog.manifests.length)throw new Error('Public catalog needs at least one film');
 for(const manifest of catalog.manifests){
  const file=path.resolve(root,manifest);if(!file.startsWith(root+path.sep))throw new Error('Catalog manifest must be under public/');
  const film=JSON.parse(await readFile(file,'utf8'));
  if(!film.id||ids.has(film.id)||!film.title||(!Number.isFinite(film.duration)||!(film.duration>0)))throw new Error('Duplicate or invalid public film');
  if(typeof film.video!=='string'||!film.fileName||film.fileName!==path.basename(film.video)||fileNames.has(film.fileName))throw new Error('Every public film needs a unique video fileName');
  if(!Array.isArray(film.covers)||!film.covers.length||film.covers.some(x=>!x.file||!x.alt))throw new Error('Every public film needs a cover and its description');
  ids.add(film.id);fileNames.add(film.fileName);
  for(const ref of [film.video,...film.covers.map(x=>'assets/'+x.file)]){const target=path.resolve(root,ref);if(!target.startsWith(root+path.sep))throw new Error('Media path is outside public/');await access(target);}
  films.push(film);
 }
 if(!ids.has(catalog.defaultFilmId))throw new Error('Default film is absent from public catalog');
 const js='export const films='+JSON.stringify(films)+';\nexport const defaultFilmId='+JSON.stringify(catalog.defaultFilmId)+';\nexport const findFilm=id=>films.find(f=>f.id===id);\nexport const defaultFilm=findFilm(defaultFilmId);\n';
 await writeFile('public/catalog-config.js',js);
 return films;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){const films=await buildCatalog();console.log('Public catalog:',films.length,'film(s)');}
