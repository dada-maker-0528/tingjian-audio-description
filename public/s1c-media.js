export const FIRST_SCENE_VOICE_PROMPT='整片换成男声，旁白讲解更加简洁。';

// The delivered MP4 already mixes the film audio and the revised narration.
export const firstSceneVoiceRevision={
 id:'s1-c-5e12f2a7',
 video:'assets/NZ2_S1C_male_concise_h264.mp4',
 duration:39.066667,
 sha256:'5e12f2a7e1269f1e8fe8628f7eb90ea0b63aae7122f8a456ce5f6dbb769521b9',
 audioMode:'mixed-narration',
 contentApproved:true,
 effects:[
  {field:'voice_id',value:'male'},
  {field:'reference_mode',value:'每个动作点名'},
  {field:'information_level',value:'精简'},
 ],
 cues:[
  {id:'s1-c-1',start:.62,end:3.208083,maxDuration:2.588083,text:'飞猪驮着哪吒和太乙，穿过云雾。',kind:'narration'},
  {id:'s1-c-2',start:3.57,end:4.576229,maxDuration:1.006229,text:'哪吒半眯着眼。',kind:'narration'},
  {id:'s1-c-3',start:6.28,end:8.587417,maxDuration:2.307417,text:'太乙大口吃东西，满嘴油渍。',kind:'narration'},
  {id:'s1-c-4',start:18.68,end:19.817729,maxDuration:1.137729,text:'哪吒斜眼看他。',kind:'narration'},
 ],
};
