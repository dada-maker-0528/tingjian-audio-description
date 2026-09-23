# 听见视频读屏演示

全屏入口为 `/`，手机版为 `/portrait.html`。两页、视频、封面和豆包 Vivi 合成音频一起发布到独立的 Cloudflare Worker `tingjian-video-reader-demo`。

## GitHub 发布

发布分支为 `codex/video-reader-deploy`。推送本目录或 `.github/workflows/deploy-video-reader.yml` 的改动后，独立工作流执行测试、素材校验和部署预检，再发布读屏站点。

复用仓库已有的 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` Secrets。配音已随素材保存，不需要向这个 Worker 注入豆包密钥。现有原口述影像站点及其发布流程不变。

在仓库根目录安装已有依赖后可检查：

```sh
npm --prefix video-reader test
npm --prefix video-reader run check
npx wrangler deploy --dry-run --config video-reader/wrangler.jsonc
```

部署后用 `node video-reader/scripts/verify-deployment.mjs https://实际部署网址` 校验两个入口、脚本、样式、7段配音的摘要和视频的分段播放响应。

## 运行范围

播放控制、框选本页视频、手机内浮层和豆包缓存配音可实际操作。画面理解、问答和暂停时机为预设演示，不连接抖音账号，也不表示已经实现跨应用实时识别。

语音输入依赖浏览器提供的 SpeechRecognition 服务、麦克风授权及其网络连接；网站可访问不等于所有浏览器的在线语音识别服务都可用。文字指令入口仍可使用。

本目录的 `public/` 也可直接交给 Nginx 等静态服务器部署；应保留相对路径、HTTPS 和视频 Range 支持。中国大陆访问需要以具体网络实测为准。
