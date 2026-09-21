export const DEFAULT_VOICE='vivi';
export const VOICES=Object.freeze([
 {id:'vivi',name:'Vivi',label:'Vivi · 自然女声',speaker:'zh_female_vv_uranus_bigtts'},
 {id:'xiaohe',name:'小何',label:'小何 · 柔和女声',speaker:'zh_female_xiaohe_uranus_bigtts'},
 {id:'yunzhou',name:'云舟',label:'云舟 · 清晰男声',speaker:'zh_male_m191_uranus_bigtts'}
]);
export const isVoice=id=>VOICES.some(v=>v.id===id);
export const voiceInfo=id=>VOICES.find(v=>v.id===id)||VOICES[0];
export const VOICE_PREVIEW_TEXT='你好，这里是听见。选择你喜欢的声音，一起听见画面里的故事。';
