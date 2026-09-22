# #75 Terminal-Bench pilot｜Criteria1.1

Product 评测适配；Builder 候选，等待独立 Regulator。合同：
[#75 Criteria1.0](https://github.com/pym96/Pan-agent/issues/75#issuecomment-5774791581)。
[Criteria1.1 修订与限定裁定](https://github.com/pym96/Pan-agent/issues/75#issuecomment-5775497812)与 1.0 共同生效。
基线 `d1bc6c3938cd68b151b653178d977557a8921a0b`。本轮只做离线准备，真实模型请求、真实凭证读取、任务/Oracle/verifier 容器、镜像拉取/构建均为零。

## 固定公开输入

[manifest](../../scripts/harbor/pilot/manifest.json) 保存 Harbor
`f9deaca7f44ab0b91f1dd445d79629e4d97a0716` registry 的完整 terminal-bench@2.0 条目。
registry SHA256 `da1446bce05eabbd72a25eb9eef5a2f5db94645ce88c28e2497581433b3d2e60`。
总体 89 个 canonical ID，不过滤、不补题；重复 ID 报错。
排序键为 SHA256(UTF-8(`pan-tbench-pilot-v1\n` + ID)) 的小写十六进制，平局按 ID UTF-8 字节排序，取前五。
五题均来自 `https://github.com/laude-institute/terminal-bench-2.git` 的
`69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`，路径与 ID 相同。

| 顺序 / ID | agent / verifier / build 秒 | CPU / 内存 MiB / 磁盘 MiB | 官方镜像标签 |
|---|---|---|---|
| 1 overfull-hbox | 750 / 360 / 600 | 2 / 4096 / 10240 | alexgshaw/overfull-hbox:20251031 |
| 2 dna-insert | 1800 / 1800 / 600 | 1 / 4096 / 10240 | alexgshaw/dna-insert:20251031 |
| 3 nginx-request-logging | 900 / 900 / 600 | 1 / 2048 / 10240 | alexgshaw/nginx-request-logging:20251031 |
| 4 merge-diff-arc-agi-task | 900 / 900 / 600 | 1 / 4096 / 10240 | alexgshaw/merge-diff-arc-agi-task:20251031 |
| 5 break-filter-js-from-html | 1200 / 1200 / 600 | 1 / 2048 / 10240 | alexgshaw/break-filter-js-from-html:20251031 |

镜像 digest、架构、可启动性、网络依赖与 verifier 安装链均未实际核实。manifest 中明确为 unknown/null/false；不得把标签当成不可变镜像身份。
Builder 为集成核验取得了五题 instruction.md、task.toml、environment/Dockerfile、tests/test.sh 的字节并做静态读取/哈希；Git tree 仅取得文件名、大小和 blob ID。没有下载/阅读 solution 内容、test_outputs.py 内容、任务数据或模型权重。manifest.exposure 逐文件记录机器读取范围。它是公开开发基线，不是未见 holdout；没有成绩观察影响抽样。

## SC-TBP-75-01：官方测试可见性冲突

**Criteria1.1 已裁定：仅允许原题原有可见测试；实际镜像未验证。**
固定 `break-filter-js-from-html/environment/Dockerfile`（blob `77d131ae0ec556e851a6290e07b1387a8e9a935f`）
将 `environment/tests/test_outputs.py` 复制到 `/app/test_outputs.py`；该源和 verifier tests/test_outputs.py
均为 blob `1bf2128a002d4014d85094c2223f87c62ae9088d`。Builder 重新核对固定 Git tree 和 Dockerfile 源身份，manifest 重建时强制核对 repo、commit、path 与三个 blob。
许可仅属于该固定文件；不额外注入隐藏测试、solution、答案或控制侧 verifier 日志，不删除、改写或搬迁原文件。
Agent 自行调用原题可见测试不等于提前调用控制侧正式 verifier，不能直接记为正式成绩。其他任务不获得测试注入许可。
旧 Criteria1.0 的冲突与永久阻断记录保留在原 SHA / Handoff；本修订只移除已裁定的 SC 分支，所有签名、身份、预算、环境和凭证检查保持。
CLI 的模块接口允许离线测试显式注入宿主快照、隔离 home、假环境、合成凭证和假 transport；命令行没有这些覆盖选项，也没有跳过授权的测试开关。

`overfull-hbox` 的部分同名测试目录文件是被 Dockerfile 拷贝的题目输入，不将其等同于上述可执行评分代码冲突。

## 运行路径与边界

Node 控制进程加载基线打包安装的 GeneralAgentSession、PanKimiModelAdapter 和 KimiFetchTransport；
真实 Adapter 的私有连续性对象不 JSON 克隆，原始 reasoning 不归档。
未来凭证只通过 Node 中 `() => process.env.KIMI_API_KEY` 读取；本轮入口未进入此回调，测试使用随机合成值。
Python 子进程没有密钥环境、密钥 argv 或密钥 IPC；只收到固定任务配置、源目录、镜像 ID 和输出目录。
显式 child env 只有 PATH/HOME/DOCKER_CONFIG/DOCKER_HOST/PYTHONDONTWRITEBYTECODE；Docker socket 仅供控制进程连接 daemon，不挂入容器。

Harbor `Task.instruction`（包括官方 canary 去除规则）经 IPC 原样交给 Session。
模型唯一工具 `task_command` 仅允许 command 与 0 < timeout <= 30 秒；参数不能选择环境、宿主或别的容器。
Python Bound 调用固定 BaseEnvironment.exec，保留非零退出。没有宿主 shell fallback、oracle 或正式入口预设解题命令。
Agent 完成后才调用 Harbor 官方 Verifier，保留其退出码列表、异常类型、raw reward 文件与 reward 原值。
取消/工具超时停止当前任务环境，复用 #74 已接受的 `PanAgent.stop_target` 停止及 Running/Pid 确认；无确认即停止推进。
官方 verifier 源文件不修改，异常不计作零分；任意 reward=0 不自动推断为 Agent 失败。

装包身份见 [package-identity](../../scripts/harbor/pilot/package-identity.json)：80 个 Pan 文件及 363 个 Harbor Python 源文件有哈希。
安装包 SHA256 `e7da84c88b4eadb1395914720b85514d54cfdb52a93a2b87bd3c8b0baf8c7ecb`，来自 accepted 基线的干净归档构建。
Node 入口必须是验证包的 dist/index.js；运行 Python 路径/二进制和 Harbor 导入源码固定。
这些路径是本机复用 #74 已安装依赖的显式绑定；迁机需重建/核实相同闭包并通过新的候选复核，不能静默换 Python/Harbor。

## 授权与持久账本

模板始终 `authorized:false`。未创建真实 authority、签名授权或 campaign run ID。
未来 Human/Master 在控制侧维护 `~/.local/state/pan-agent/wo75/authority.json` 的可信 Ed25519 公钥和 acceptedRunnerSha；私钥不交给 runner。
activation 是签名的 canonical JSON：递归按键排序、紧凑 JSON，排除 signature 字段；签名编码为 base64。
签名覆盖 Human 授权 ID、notBefore/expiresAt、独占 UUID、runner 完整 SHA、包/manifest 哈希、固定 model/endpoint、预算、五题 ID/顺序及解析的镜像 ID。
时间/身份/签名/预算/取消在账本占用与每次密钥解析、HTTP 发送前复查。接受状态不能由候选自封，可信根由 Human/Master 外部配置。

账本固定在 `~/.local/state/pan-agent/wo75/ledger/<runId>.jsonl`，wx 独占创建；同步写完、fsync 后才发送或执行工具。
同一 run 的并发、重复及中断重启均拒绝；一题最多一个 attempt。失败请求消耗 dispatch，不回滚、不重试、不重置。
模型 profile 固定 kimi-code / k3-256k / high；endpoint 固定 `https://api.kimi.com/coding/v1/chat/completions`。
逐题上限 20 dispatch / 40 tools，全程 100 dispatch；max_tokens 4096，请求 131072 字节，响应 524288 字节，dispatch 120 秒。
预算可签署更小值，不能超过合同；CLI 没有提高额度或替换 endpoint 的开关。
usage input/output 各自记录；未报告为 null，不能写零。缺 usage、限流或额度用尽停止 attempt。
控制宿主文件与公钥信任根属于 Human 管理边界；本 runner 不声称防御拥有宿主写权限的人类主动删除账本/改程序。

## 未授权 live 提案

SC-TBP-75-01 的限定裁定已记录；仍需取得独立技术复核及 C-TBP-03 新候选的有限 Human 两项明确 pass（或不同模型家族复核）。
#74 已接受的 Human 审阅不重做，#70 已消费授权不复用。
随后另行授权任务数据获取、镜像解析/拉取和这一轮最多 100 次的额度；不假定会员剩余额度，不换算 CNY 或充值。
完整源文件目录须与五题 manifest 精确匹配；不允许额外 compose 文件、软链接逃逸或源字节漂移。
镜像 ID 必须解析为不可变 sha256，再写入签名 activation；本轮不提供伪 digest。

命令形状（**无有效真实 activation 仍拒绝；不是执行许可**）：

```sh
node scripts/harbor/pilot/cli.mjs --activation /controller/approved-activation.json --entry /private/tmp/wo75-work/consumer/node_modules/pan-agent/dist/index.js --task-root /private/tmp/wo75-live/tasks --output /private/tmp/wo75-live/new-run
```

五题串行、各一次，不自动补题。按官方配置最高同时 2 CPU / 4 GiB 内存；磁盘声明每题 10 GiB，不把五题总额当成已保留空间。
环境仍用公开 Docker 网络，不用 host network、privileged、SYS_ADMIN、GPU/设备或用户目录/Docker socket 挂载；唯一 bind 为该题空 verifier 日志目录。
与 #74 单核/2GiB 控制不同，#75 保留各题上述官方 CPU/内存/时限；存储字段不是本机 Docker 的硬磁盘配额，架构仿真与网络实际行为仍待核实。
活跃文件须位于内置盘；运行开始及每 5 秒检查宿主可用 >=60 GiB、当次输出加 Docker.raw 新增分配 <24 GiB，触限取消并停止当前环境。
这是运营保护，不声称防止采样间突增；未来拉镜像前需另按完整源/镜像预计体积做准入，超限不启动。
本轮公开文件下载/离线打包前已有盘检查，原始证据最终保存在 WD_BLACK。没有 prune、清理其他 worktree 或删除用户文件。

汇总固定分母 5，保留未开始、基础设施失败、Agent 停止、官方评分、评分错误；raw reward 文件始终可查。
只称固定公开小样本 pilot，不声称榜单、性能提升或新增简历事实。仓库导航仅在合同授权范围追加；不越权改根 SOURCE_OF_TRUTH、VPF、Wiki 或 main。
