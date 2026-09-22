# 实时语音上云说明

浏览器每约 100ms 上传麦克风 PCM；本站 Node 服务连接百炼实时识别，把中间结果直接回填原输入框。文字来自实际识别事件，没有逐字动画或等待整段录音后模拟输入。

## 部署设置

1. 使用 `npm run build` 生成的 `dist/node`，安装生产依赖，在 Node 22 常驻服务中运行 `server/local.mjs`。仍需现有后端的模型配置、FFmpeg/FFprobe 和持久化数据目录；旧 Worker 或纯静态托管不能替代这套后端。
2. 只在服务端环境配置 `TINGJIAN_ASR_BASE_URL`、`TINGJIAN_ASR_API_KEY`，可选 `TINGJIAN_ASR_MODEL`（默认 `qwen3-asr-flash-realtime`）。Base URL 使用百炼工作空间的 HTTPS 兼容接口地址。服务从同一工作空间域名连接 `/api-ws/v1/realtime`，密钥不返回浏览器、不放入构建产物。
3. 设置 `TINGJIAN_PUBLIC_ORIGIN=https://实际网站域名`（不带路径），`PORT=5298`。如果使用其他端口，相应修改代理。沿用真实后端所需的其他环境配置。
4. 网站提供有效 HTTPS 证书。浏览器自动使用当前网站的 WSS 地址 `/api/asr/realtime`，没有写死本机地址。HTTPS 是云端浏览器使用麦克风的必要条件。
5. 在现有 HTTPS 代理中加入 [Nginx 示例](nginx-realtime.conf.example)。保留原始 Host 和 Origin、WebSocket Upgrade，关闭流式缓冲，读写超时至少 120 秒。云负载均衡/CDN 也须允许 WebSocket，并允许服务端向百炼发起出站 WSS。当前会话必须由同一 Node 连接持续处理。
6. 上云后在真实域名检查：按 O 启动，结束前输入框持续更新；再按 O 停止，Enter 才发送；拒绝麦克风权限能正确提示；连接中断后按 O 重试保留录音。更新/重启服务会断开现有连接，应避免在用户录音时操作。

## 网络中断行为

录音在当前页面内存中保留。连接失败会停止采集、保留已显示文字并说明原因；按 O 或点击语音可重放已保留的录音进行识别，不要求重说，不自动发送。刷新/关闭页面会丢失内存录音。没有承诺网络永不掉线，也没有无提示的自动重试。

单次录音上限 60 秒；服务端有会话时限、来源检查和并发限制。大规模多人使用前需按实际容量调整，不能仅增加代理超时。

## 本地实测证据

- `work/real-check/realtime-browser.json`：真实中文录音经麦克风测试输入、实际百炼返回 27 次中间结果，首字约 1.1 秒。
- `work/real-check/realtime-reconnect.json`：实际断开连接后复用录音成功识别，麦克风只启动一次，无重复填字和自动发送。
- `work/real-check/realtime-https.json`：本地 HTTPS 页面 → WSS 代理 → Node → 实际百炼，中间文字在停止前出现。测试证书只用于本地测试，没有改系统信任。

以上是部署前的本地结果。用户随后授权上线，现已完成正式 HTTPS 域名与云代理实测，见 [上线记录](RELEASE-20260922.md)。正式服务沿用端口 5295，示例中的 5298 须据实替换。用户个人麦克风及网络仍需实际体验确认。

协议依据：[百炼实时语音识别官方文档](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)。
