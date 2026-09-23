import { spawnSync } from 'node:child_process';

const required = [
  ['AIMEDIA_API_KEY (or OPENAI_API_KEY)', process.env.AIMEDIA_API_KEY || process.env.OPENAI_API_KEY],
  ['VOLC_TTS_KEY', process.env.VOLC_TTS_KEY],
  ['TINGJIAN_ASR_API_KEY', process.env.TINGJIAN_ASR_API_KEY],
  ['TINGJIAN_ASR_BASE_URL', process.env.TINGJIAN_ASR_BASE_URL],
];
let missing = false;
for (const [name, value] of required) {
  const ready = Boolean(value?.trim());
  console.log(`${ready ? '已填写' : '缺少'} ${name}`);
  missing ||= !ready;
}
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const probe = spawnSync(ffmpeg, ['-version'], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
const ffmpegReady = probe.status === 0;
console.log(`${ffmpegReady ? '已找到' : '未找到'} FFmpeg`);
if (!ffmpegReady) missing = true;
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.log('需要 Node.js 22 或更新版本');
  missing = true;
}
console.log('此检查只核对配置项与 FFmpeg，不会输出或上传密钥。');
process.exitCode = missing ? 1 : 0;
