# 听见 · AI 口述影像

中文助盲口述影像 Demo，内置用户指定的 3 分 04 秒真人影视片段，演示标题为《创业之路》。画面分析、角色信息和文字反馈理解为预设流程；在线语音使用火山引擎豆包 TTS 2.0 的双向 WebSocket 接口。

## 本地运行

安装依赖后，在项目根目录创建 `.dev.vars`，填入以下配置，再运行 `npm run dev`：

```dotenv
VOLC_TTS_KEY=YOUR_API_KEY
VOLC_TTS_RESOURCE_ID=seed-tts-2.0
```

`.dev.vars` 已被忽略，不应提交或发给浏览器。线上密钥保存在 Sites 的秘密环境变量中。网站的访问范围由 Sites 分享设置控制；当前按用户要求保持公开。

## 接入行为

- `/api/tts/status` 只返回是否配置和服务名称，不返回密钥。
- `/api/tts` 在服务端连接 `wss://openspeech.bytedance.com/api/v3/tts/bidirection`，完成连接、会话、合成及结束事件。
- 引导文字返回 WAV；影片旁白逐句返回 PCM，浏览器将其放回对应时点，并缓存到本地 IndexedDB。
- `speech_rate` 使用自然语速 `0` 或慢速 `-20`。旁白过长时先尝试更简洁的文案，仍超时则拒绝，避免覆盖原片对白。
- 原片速度、对白和音乐保持不变。旁白音量通过独立音轨控制。
- 语音设置可以选择在线语音或本地默认音频。默认音色在线失败时会明确提示并使用本地备用；其他音色失败会提示重试或切换默认音色，不会悄悄替换声音。切换页面和停止提示会取消等待。
- `/api/media/<fileName>` 按公开片库提供正确的 HTTP Range 响应，以支持每部影片的定位播放。

## 验证与发布

`npm test` 检查提供的二进制协议、输入范围、跨站请求、密钥错误处理、旁白时长及视频分段响应。`npm run build` 生成 `dist/server/index.js` 与 `dist/client/`。发布使用已有 `.openai/hosting.json` 中的项目，保持用户指定的访问范围。

## GitHub 自动部署

仓库中的 `.github/workflows/deploy-worker.yml` 会在拉取请求中执行测试、构建与部署预检；合并到 `main` 后部署到 Cloudflare Workers，也可以在 Actions 页面手动运行。前端文件、`server/worker.mjs`、视频素材和 `wrangler.jsonc` 会一起部署；豆包 TTS 仍由 Worker 在服务端调用。

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加三个 Repository secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`VOLC_TTS_KEY`。Cloudflare 令牌使用目标账户的 Workers 编辑权限。自动部署会把豆包密钥写入 Worker Secret，前端拿不到它。`VOLC_TTS_RESOURCE_ID` 是公开的产品标识，已在 `wrangler.jsonc` 设置为 `seed-tts-2.0`。

首次部署前需要登录自己的 Cloudflare 账户并配置上述 Secrets；缺少配置时工作流会明确失败，不会把缺少密钥的站点标记为部署成功。部署完成后，从 Actions 的部署输出获取新网址。GitHub + Cloudflare 的网址与原 OpenAI Sites 地址独立。

同事协作时，在 GitHub 仓库 Settings → Collaborators 添加同事；同事创建功能分支并提交拉取请求，检查通过后合并到 `main` 即会更新网站。仓库可保持私有，部署后的网站仍可公开访问。

部署接口依据：[Cloudflare GitHub Actions 文档](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)与[官方 Wrangler Action](https://github.com/cloudflare/wrangler-action)。

已通过真实 API 验证当前影片的 5 条在线旁白，完整默认口述音轨已提前准备好，首次观看无需等待重新合成。浏览器中已核验在线音频播放、独立原片速度、样片定位和生成结果缓存。离线 HTML 与当前素材保持一致，使用本地备用音频，不需要也不包含密钥。

协议依据：用户提供的 `TTS Websocket Bidirection protocols.zip`；火山引擎官方 V3 文档与真实响应事件。

## 当前用户素材

原始文件为用户明确指定的 a711ab9d820a95cfde88fe52df029e82.mp4。网页视频长 184.2 秒，仅转码画面；AAC 音轨摘要与原片一致。人物称呼来自片中字幕或稳定外貌描述；演示标题为自拟标题。

试听范围：0—7 秒、0—45 秒、110—117 秒复验，完整观看 184.2 秒。新素材拥有独立的保存键与语音缓存标识，旧影片的旁白不会套用到新视频。

## 音色与键盘播报

语音设置提供 Vivi、小何、云舟三种音色。预览声音由真实豆包 TTS 生成；应用后，引导与影片旁白使用所选音色。每个口述版本记录自己的音色，缓存也按影片、音色和设置隔离。中样片阶段换音色，会重新试听并进入短片复验。

Tab 焦点播报默认开启，使用浏览器即时中文语音读取简短的操作名称，例如“创建新视频”。不附加“按钮、链接、输入框”等类型名称；开关、音色选择和播放进度保留必要的当前状态。快速 Tab 会取消上一条；播报前暂停影片，点击播放可继续。读屏优先会关闭重复的站内播报。

“重听”操作统一用“再听”表达，避免多音字误读。语音设置新增 1—5 倍提示语速，以 0.5 倍递增，并提供试听与恢复 1 倍；设置保存在本机，同时用于 Tab 焦点朗读、在线或本地操作引导及角色介绍。影片原声与口述旁白不受提示语速影响。

Tab 选择下一个操作，Shift + Tab 返回上一个操作；首页、页脚与操作帮助均提供说明。

## 新增公开影片

首页按独立卡片展示已发布影片，每部使用自己的封面、片名、时长和播放位置。首页显示最近六个条目，更多条目在“我的视频”里搜索查看。现有真实素材只有用户已提供的一部；不会用重复素材冒充更多影片。

发布者把新的视频与说明准备到 public/assets/，为每部视频建立独立清单，并在 public/catalog.json 的 manifests 数组中追加清单路径。运行构建会验证媒体引用和影片 ID，生成共用的公开片库。旧的口述版本保留自己的设置。人物、旁白未准备的影片只能按原片播放，不使用另一部影片的预设结果。

对当前使用者，最直接的添加方式是在当前对话中继续提供视频文件和片名，由本项目发布流程新增卡片并更新公开站点；网页里的普通文件选择仍用于预览，不是匿名公开上传入口。
