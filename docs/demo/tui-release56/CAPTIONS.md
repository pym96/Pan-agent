# 中文解说版：数据库恢复与 Trace 回放

[观看视频](https://github.com/pym96/Pan-agent/releases/download/v0.1.2/pan-agent-wal-captioned.mp4) · [下载 UTF-8 字幕](https://github.com/pym96/Pan-agent/releases/download/v0.1.2/pan-agent-wal-captioned.srt) · [校验文件](https://github.com/pym96/Pan-agent/releases/download/v0.1.2/SHA256SUMS)

这版给原有 11 幕补上中文解释：模型正在做什么、为什么需要这一步，以及画面中的反馈说明了什么。WAL、校验和、字节序、检查点和历史回放在首次介绍时都有简短说明。命令、实际输出和 LIVE / ARCHIVE DETAIL / 速度标识保留英文。

沿用 v0.1.1 的同一段真实运行与归档视图，没有新增模型调用、任务或工具执行。片长仍为 129.8 秒，原有两次错误完整保留在证据中，视频也继续展示两次错误。字幕区位于终端上方；概览缩放至原来的约 95%，细节放大保留。没有覆盖工具输出或改写终端文字。

这仍是 Terminal-Bench db-wal-recovery 的本地路径适配演示，**不是新增的官方评测成绩**。7 项检查是在任务结束后独立执行的；字幕明确区分这些检查与模型自己的结论。运行、任务来源及 Apache-2.0 归属说明见 [原演示说明](WAL-DEMO.md)。Pan 的可安装 Runtime 仍为 v0.1.0，原有发布版本保持不变。

## 重现渲染

使用已验收的原始 PTY 文件，按 [字幕与画面映射](wal-caption-map.json) 渲染。每幕的 `caption` 同时生成烧录文字和 SRT，`outputStart` / `outputEnd` 是成片时间，`capture` / `start` / `end` / `speed` 保留原有素材时间映射。

```sh
python render_wal_captioned.py SOURCE_ARTIFACT_ROOT wal-caption-map.json OUTPUT.mp4
```

脚本会在 MP4 旁生成同名 `.srt`。需要 Python、Pillow、pyte 和 FFmpeg；它只读取录像并调用本地编码器，不启动 Pan 或访问模型。此工具不是运行 Pan 的前置依赖。

记录环境使用 Pillow 12.3.0、pyte 0.8.2 和 macOS 系统 Menlo / Hiragino Sans GB 字体。字体文件不随项目分发。相同字体与编码器环境可复现；其他平台替换字体时应重新检查字形、行宽、时间与遮挡，不能假定输出字节相同。

[Builder 证据](../../evidence/tui-release56/CAPTIONS.md) · [原版无中文字幕视频](https://github.com/pym96/Pan-agent/releases/download/v0.1.1/pan-agent-wal-demo.mp4)
