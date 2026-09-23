import test from 'node:test';
import assert from 'node:assert/strict';
import {isListedVideo,mergePublicLibrary,visibleLibrary} from '../public/library.js';
import {pageGuide,briefPageGuide} from '../public/page-guidance.js';

const withdrawn=[
 'd53b3a70-3220-41b9-a45a-89c3e4043c92',
 '85d41865-6bc4-4d81-9f71-6d8972104fc9',
 '72bc6273-d3b0-43e3-a762-2fd11f4139d9',
 'fbfc9220-baaa-4750-9be6-adf35e7e50a8',
 '274c6da5-8f87-4a6b-8f0d-b67b2aac8d7d',
 '954ddbca-fa85-405d-9b97-6e3e0778a626',
 'ab005456-2180-4b20-a456-0299af9528e2',
];

test('withdrawn projects are excluded through every stored ID alias',()=>{
 for(const id of withdrawn)for(const field of ['id','sourceProjectId','projectId','assetId'])for(const prefix of ['','upload-','uploaded-']){
  const item={id:'saved-version',assetId:'published-film',title:'曾保存的测试版本',[field]:prefix+id};
  assert.equal(isListedVideo(item),false,`${field}: ${prefix}${id}`);
  assert.deepEqual(visibleLibrary([item],{all:true}),[]);
 }
});

test('catalog merge removes withdrawn films and saved aliases while preserving real versions and new uploads',()=>{
 const catalog=[{id:'film-a',title:'正式影片甲',duration:184},{id:'film-b',title:'正式影片乙',duration:240},{id:'upload-new-user-video',title:'QA是用户自选片名',duration:52},...withdrawn.map(id=>({id:'upload-'+id,title:'测试视频',duration:52}))];
 const original={id:'film-a-original',assetId:'film-a',title:'旧片名',position:42,settings:{voice:'yunzhou'}};
 const savedVersion={id:'saved-user-version',assetId:'film-a',title:'我的慢速版本',position:16,settings:{voice:'xiaohe'}};
 const newUpload={id:'uploaded-new-user-video',assetId:'upload-new-user-video',sourceProjectId:'new-user-video',title:'QA是用户自选片名',position:9,settings:{voice:'vivi'}};
 const saved=[original,savedVersion,newUpload,...withdrawn.map(id=>({id:'old-'+id,assetId:'film-a',sourceProjectId:id,title:'历史测试版本'}))];
 const merged=mergePublicLibrary(catalog,saved);
 assert.equal(merged.length,5);
 assert(merged.includes(savedVersion));assert(merged.includes(newUpload));
 assert.deepEqual(original,{id:'film-a-original',assetId:'film-a',title:'正式影片甲',description:'',duration:184,position:42,settings:{voice:'yunzhou'},public:true});
 assert.equal(savedVersion.position,16);assert.equal(savedVersion.settings.voice,'xiaohe');
 assert.equal(newUpload.position,9);assert.equal(isListedVideo(newUpload),true);
 assert(merged.every(isListedVideo));assert.equal(mergePublicLibrary(catalog,merged).length,merged.length);
 assert.deepEqual(visibleLibrary(merged,{query:'我的慢速',all:true}),[savedVersion]);
 assert.equal(visibleLibrary(merged,{query:'QA',all:true}).length,2);
});

test('library guidance reflects two visible cards and current keyboard shortcuts',()=>{
 const context={libraryCount:2,libraryTotal:2};
 assert.equal(briefPageGuide('library',context),'我的视频，共 2 部。');
 assert.match(pageGuide('library',context),/共 2 部.*数字 1 至 2/);
 assert.doesNotMatch(pageGuide('library',{...context,shortcuts:false}),/数字/);
 assert.match(pageGuide('library',{...context,shortcuts:false}),/Tab/);
});

test('library guidance distinguishes an empty library from an empty search',()=>{
 const empty={libraryCount:0,libraryTotal:0};
 assert.equal(briefPageGuide('library',empty),'还没有视频，按空格创建新视频。');
 assert.doesNotMatch(pageGuide('library',empty),/数字|找到相关视频/);
 const noMatches={libraryCount:0,libraryTotal:2,libraryQuery:'不存在的片名'};
 assert.equal(briefPageGuide('library',noMatches),'没有找到相关视频，可更换搜索词或按空格创建新视频。');
 assert.doesNotMatch(pageGuide('library',noMatches),/还没有视频|数字/);
 const oneMatch={libraryCount:1,libraryTotal:2,libraryQuery:'创业'};
 assert.equal(briefPageGuide('library',oneMatch),'找到 1 部相关视频。');
 assert.match(pageGuide('library',oneMatch),/数字 1 播放/);
 assert.doesNotMatch(pageGuide('library',oneMatch),/1 至 2|共 2 部/);
 assert.equal(briefPageGuide('library',{libraryCount:2,libraryTotal:2,libraryQuery:'   '}),'我的视频，共 2 部。');
});

test('opening guidance names Tingjian and its actual library destination',()=>{
 for(const guide of [pageGuide('home'),briefPageGuide('home')]){
  assert.match(guide,/听见.*进入我的视频/);
  assert.doesNotMatch(guide,/智享视界/);
 }
});
