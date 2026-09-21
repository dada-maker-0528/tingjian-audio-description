// Curated, reformatted excerpts of the named implementation. These explain
// a node's logic; only producer events establish execution and success.
const excerpt=(source,code)=>({source,lines:code.trim().split('\n')});
const snippets={
 settings:excerpt('demo-progress.js · 配置校验',`
const { voice, speed, gain, density } = settings;
const supportedSpeed = ['normal', 'slow'].includes(speed);
if (!voice || !supportedSpeed) throw new Error('无效设置');
const cues = film.narration?.[speed + '-' + density] || [];
`),
 range:excerpt('demo-progress.js · 片段筛选',`
const range = { start, end: start + duration, contentSeconds: duration };
const selected = cues.filter(cue => cue.start >= range.start && cue.start < range.end);
const selection = { matched: selected.length, source: 'preset_demo' };
const original = { playbackRate: 1, audio: 'preserved' };
`),
 cache:excerpt('speech-service.js · 缓存与任务调度',`
const key = [IDENTITY, film.id, 'narration', voice, start, duration, settings.speed, settings.density].join(':');
if (this.cache.has(key)) return this.cache.get(key);
return this.enqueue(async () => {
  aborted(signal); if (this.cache.has(key)) return this.cache.get(key);
  let stored = await readCache(key); aborted(signal);
  // 缓存未命中时读取预制音轨，或请求当前版本的在线旁白。
});
`),
 narration:excerpt('speech-service.js · 在线合成分支',`
const response = await this.request({ kind: 'narration', filmId: film.id, voice,
  start, duration, speed: settings.speed, density: settings.density }, signal);
const data = await response.json(); aborted(signal);
if (data.filmId !== film.id || data.voice !== voice || data.sampleRate !== SAMPLE_RATE)
  throw new Error('旁白音色或视频数据不匹配。');
const blob = wavFromSegments(data.segments, data.trackDuration);
`),
 audioReady:excerpt('speech-service.js · 音轨复用',`
aborted(signal); await saveCache(key, stored);
const result = { url: URL.createObjectURL(stored.blob), cues: stored.cues,
  provider: 'volcengine', voice };
this.cache.set(key, result); return result;
`),
 media:excerpt('task-progress.js · 双路媒体检查',`
await Promise.all([checkMedia(videoURL, 'video', signal), checkMedia(audio.url, 'audio', signal)]);
media.preload = 'metadata'; media.src = url;
media.onloadedmetadata = () => finish(Number.isFinite(media.duration) && media.duration > 0
  ? null : new Error('媒体时长无效'));
media.onerror = () => finish(new Error('媒体读取失败'));
signal?.addEventListener('abort', abort, { once: true });
`),
 mediaReady:excerpt('task-progress.js · 检查收尾',`
clearTimeout(timer); signal?.removeEventListener('abort', abort);
media.onloadedmetadata = media.onerror = null;
media.removeAttribute('src'); media.load();
error ? reject(error) : resolve();
`),
 presetMedia:excerpt('demo-progress.js · 演示素材',`
const metadata = { source: 'preset_demo', durationSeconds: film.duration };
await checkMedia(videoURL, 'video', signal);
const playback = { metadata: 'ready', playbackRate: 1 };
`),
 presetRoles:excerpt('demo-progress.js · 预设人物',`
if (!film.roles?.length) throw new Error('缺少人物预设');
const roles = { source: 'preset_roles', count: film.roles.length };
const introductions = film.roles.filter(role => role.detail).length;
const portraits = film.roles.filter(role => role.image).length;
`),
 presetScenes:excerpt('demo-progress.js · 预设试听范围',`
if (!film.samples?.short || !film.samples?.medium) throw new Error('缺少样片预设');
const starts = { short: film.samples.short.start, medium: film.samples.medium.start,
  verify: film.samples.verify?.start };
const flow = ['short', 'medium', 'verify_if_edited', 'full'];
`),
 presetTimeline:excerpt('demo-progress.js · 预设时间轴',`
if (!film.narration) throw new Error('缺少旁白预设');
const cues = film.narration?.[settings.speed + '-' + settings.density] || [];
const timeline = { narrationCues: cues.length, originalSpeed: 1, analysisSource: 'preset' };
const next = { stage: 'role_introduction', requiresConfirmation: true };
`),
 pipeline0:excerpt('service.mjs · 画面采样与对白定位',`
const frames = await extractFrames(p.source, path.join(dir, 'frames'), p.duration, signal);
p.poster = frames[0]?.file; p.analysisFrames = frames.map(({ time, file }) => ({ time, file }));
p.windows = await silentWindows(p.source, p.duration, p.hasAudio, signal);
if (p.hasAudio && !p.transcript) p.transcript = await transcribe(file, signal);
if (p.transcript.segments.length) p.windows = dialogueGaps(p.transcript.segments, p.duration);
await save(p);
`),
 pipeline1:excerpt('service.mjs · 场景与旁白编排',`
const scenes = await analyze(frames, p.transcript, p.windows, p.duration, signal,
  { personal, preferences: p.listeningPreferences });
if (signal.aborted) throw new Error('任务已取消');
p.scenes = scenes.map(scene => ({ ...scene, aiText: scene.text }));
p.provenance = 'live-ai'; p.revision++; await save(p);
`),
 pipeline2:excerpt('service.mjs · 配音窗口与时长适配',`
const candidates = p.windows.map(w => ({ start: Math.max(w.start, s.start), end: Math.min(w.end, s.end) }))
  .filter(w => w.end - w.start > .7).sort((a, b) => (b.end - b.start) - (a.end - a.start));
const window = candidates[0];
if (window) { s.insertStart = window.start; s.insertEnd = window.end; }
if (s.audio?.textRev !== s.textRev) await synthesizeScene(p, s, signal);
if (personal) await fitSpeechEdges(p, s, signal);
`),
 pipeline3:excerpt('service.mjs · 混音与版本检查',`
const snapshot = structuredClone(p), revision = p.revision;
await mixVideo(snapshot.source, snapshot.scenes, file, { duration: snapshot.duration,
  hasAudio: snapshot.hasAudio, originalVolume: snapshot.originalVolume,
  narrationVolume: snapshot.narrationVolume, duckLevel: snapshot.duckLevel ?? .35, signal });
if (signal.aborted) throw new Error('任务已取消');
if (p.revision !== revision) throw new Error('混音期间稿件已更新，请按最新修订重新合成');
`),
 pipeline4:excerpt('workflow.mjs · 产物确认',`
if (signal.aborted) throw new Error('已暂停制作');
if (child.job?.status !== 'done') throw new Error(child.job?.message || '处理尚未完成');
if (!child.versions.some(v => v.kind === 'personal' && v.revision === child.revision))
  throw new Error('旁白未通过时长检查');
`),
 liveSettings:excerpt('workflow.mjs · 版本绑定',`
const w = p.workflow, c = w.current;
if (!c) throw new Error('缺少当前制作版本');
const settings = { voice: c.settings.voice, speed: c.settings.speed,
  gain: c.settings.gain, density: c.settings.density };
const range = { start: c.start, end: c.end, duration: c.end - c.start };
`),
 liveParts:excerpt('workflow.mjs · 可恢复分段',`
let cursor = c.parts.at(-1)?.end ?? c.start;
const end = Math.min(c.end, cursor + 60);
let child = c.inFlight?.start === cursor ? projects.get(c.inFlight.id) : null;
if (!child) {
  await trimVideo(p.source, source, cursor, end, signal);
  child = await registerUpload(id, p.title + '-处理分段.mp4', source);
  c.inFlight = { id, start: cursor }; await save(p);
}
`),
 liveCheckpoint:excerpt('workflow.mjs · 时间对齐与保存',`
const cues = child.scenes.filter(scene => scene.category !== 'none' && scene.audio)
  .map(scene => ({ text: scene.text, category: scene.category,
    insertStart: scene.insertStart + cursor - c.start, insertEnd: scene.insertEnd + cursor - c.start,
    audio: { ...scene.audio } }));
c.parts.push({ start: cursor, end, childId: child.id, narrationFile, cues });
c.inFlight = null; cursor = end; await save(p);
`),
 liveMedia:excerpt('workflow.mjs · 音轨完整性',`
const info = await probe(file, signal);
if (Math.abs(info.duration - (c.end - c.start)) > .15 || !info.hasAudio)
  throw new Error('完整旁白音轨未覆盖原片范围，请重试');
await run(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { signal, timeout: 300000 });
if (signal.aborted) throw new Error('已暂停制作');
`),
 liveAnalysis:excerpt('workflow.mjs · 场景采样',`
if (!p.scenes.length) { pipeline(p, { stage: 'analyze' }); await waitPipeline(p, p, signal); }
const sampledFrames = p.analysisFrames || [];
if (!sampledFrames.length) throw new Error('尚未取得分析画面，请重试');
const summary = { sampledFrames: sampledFrames.length, scenes: p.scenes.length,
  transcriptSegments: p.transcript?.segments?.length || 0 };
`),
 liveRoles:excerpt('workflow.mjs · 人物整理',`
if (!p.workflow.rolesAnalyzed) {
  p.workflow.roles = await identifyRoles(frames, p.transcript, signal);
  p.workflow.rolesAnalyzed = true; await save(p);
}
if (signal.aborted) throw new Error('已暂停分析');
`),
 liveRange:excerpt('workflow-state.mjs · 试听窗口',`
for (const scene of p.scenes || []) for (const gap of p.windows || []) {
  const from = Math.max(scene.start, gap.start), to = Math.min(scene.end, gap.end);
  if (to - from < 1.8 || scene.category === 'none') continue;
  const preferred = from - scene.start <= 5 ? scene.start : from - .25;
  const start = Math.max(0, Math.min(preferred, duration - 7));
  available.push({ start, end: Math.min(duration, start + 7), score: Math.min(to, start + 7) - from });
}
`),
};

export const allTaskSnippets=()=>Object.values(snippets);
export function taskSnippet(event){
 const keys={'settings':'liveSettings','range':'liveParts','analysis-result':'liveAnalysis',
  'role-result':'liveRoles','sample-range':'liveRange','media-result':'liveMedia'};
 const pipeline=event.id?.match(/^pipeline:[^:]+:([0-4])$/);
 const key=event.node||keys[event.id]||(event.id?.startsWith('part:')?'liveCheckpoint':null)||(pipeline?'pipeline'+pipeline[1]:null);
 return Object.hasOwn(snippets,key)?snippets[key]:null;
}
