# 听见 · 组委会运行说明

本包取自 2026-09-23 正在运行的线上版本，含前端、真实 Node 后端、两场景及完整成片演示素材。包内没有团队生产密钥、服务器配置、用户作品或录音。

## 线上体验

打开 https://tingjian.43.129.168.70.sslip.io/ 。独立的赛事体验账号由参赛团队通过私密渠道交付；不要在公开附件中寻找账号密码。

## 独立部署

准备 Node.js 22 或更新版本、FFmpeg，以及可访问模型服务的网络。在此目录执行：

```sh
npm ci --omit=dev
cp .env.example .env
# 使用组委会自己的 MiniMax、豆包和百炼密钥填写 .env
npm run check:contest
npm start
```

Windows PowerShell 可用 `Copy-Item .env.example .env` 复制配置文件。浏览器打开 http://127.0.0.1:5294/ 。服务默认只监听本机回环地址，生成的作品保存在 `./data`。

组委会使用自己管理的账号准备三项凭据：

1. [MiniMax 开放平台](https://platform.minimaxi.com/)创建 API Key，填入 `AIMEDIA_API_KEY`，用于视频理解、文字分析和上传片原声转写。请确认账号能调用包内默认的 `MiniMax-M3` 与 `asr-1.0`；若模型权限不同，请按账号实际授权修改模型名。
2. [火山引擎音频技术控制台](https://docs.volcengine.com/docs/Audiotechnology/Createapps?lang=zh)开通豆包语音合成 2.0 并取得调用 Key，填入 `VOLC_TTS_KEY`。资源 ID 保持 `seed-tts-2.0`，详见[官方接口说明](https://docs.volcengine.com/docs/DoubaoVoice/HTTPChunkedSSEUnidirectionalStreaming-V3?lang=zh)。
3. [阿里云百炼 API Key 页面](https://help.aliyun.com/zh/model-studio/get-api-key)创建能访问实时语音识别模型的 Key，填入 `TINGJIAN_ASR_API_KEY`；同时把同地域、同业务空间的 HTTPS 接入域名填入 `TINGJIAN_ASR_BASE_URL`。模型默认为 `qwen3-asr-flash-realtime`。

`FFMPEG_PATH` 指向 FFmpeg；若 FFmpeg 已在 PATH，可保留默认值。`TINGJIAN_PUBLIC_ORIGIN` 本地运行时留空。模型 Key 只由组委会在自己的环境填写，参赛团队不提供或要求组委会使用团队的线上生产 Key。

内置演示视频可直接播放。实际上传、重新生成和麦克风实时识别需要对应模型服务、有效赛事密钥和网络。`npm run check:contest` 只检查配置是否填写及 FFmpeg 是否可运行；完成部署后还应实际走一遍上传、生成、播放、语音识别。

`.env` 只由本机 Node 服务读取，不会打进前端。不要将填好密钥的 `.env` 重新压进本包或提交到公开仓库。赛事结束后，参赛团队会停用单独创建的线上体验账号；组委会自行管理其模型密钥。
