# #76 五题官方环境准备｜Criteria1.0

Product 评测适配；Builder 候选，等待独立 Regulator。[正式合同](https://github.com/pym96/Pan-agent/issues/76#issuecomment-5776256546)。
基线/已接受 runner `a74c0675d0a3eefea282a62585925617a89a7da3`。
固定 manifest SHA256 `74433498d6a551c86ccc6e5faad2f9d8d3c099e5b872170e54edf23769fe6503`，原 manifest、broker、policy、核心及旧证据均未修改。

## 实际交付边界

五题原序：overfull-hbox、dna-insert、nginx-request-logging、merge-diff-arc-agi-task、break-filter-js-from-html。
仅获取这五题的完整官方文件，按 Git blob 机器校验；solution/隐藏测试作为完整源包保留，没有为调试阅读其解题内容、注入模型、执行或提交 Git。没有下载其他 84 题。
公开 Docker Hub 元数据保存标签 digest、具体平台 manifest、config digest 与层体积；优先 arm64，实际五题均只有所解析的 amd64 平台，使用已有 Docker Desktop 仿真，探针 uname 为 x86_64。
按平台 digest 拉取后核对本地 image ID/config digest 与架构，镜像保持官方原样，不构建替代镜像。

[环境清单](../../scripts/harbor/pilot/environment-prep/environments.json) 保留精确身份、源目录、五行状态、配置与原始收据路径。
五题均达到本工单的 prepared：真实 #75 broker ready、固定无害探针、配置核对与停止确认。**这不是正式 verifier 可用性、任务成功或 benchmark 成绩。**
没有调用 live CLI/Session/Provider、读取真实密钥、执行 oracle、test.sh 或测试套件。
仅查询 uname、pwd、命令存在性和限定的 `/app/test_outputs.py` 文件存在性；可见文件没有被运行或改写。
多个镜像缺少 Python/curl/uv/uvx/pytest 等命令，精确结果在逐题 report 的 probe.stdout；未因准备工作安装这些依赖。
正式 test.sh 的下载/安装路径、网络与测试行为尚未验证；其他未探测命令也不能推断可用。后续 live 合同应保留这些评测风险及原始零分/异常区分。

## 隔离与资源

复用接受的 broker，唯一 bind 是该题专用空 verifier 日志目录；记录真实容器 ID 与 HostConfig。CPU/内存保留官方值：overfull-hbox 2 CPU/4096MiB；dna-insert、merge-diff-arc-agi-task 1 CPU/4096MiB；其余 1 CPU/2048MiB。每题 build/start 600秒。
无 privileged、额外 capabilities、设备扩权、host network、用户目录或 Docker socket 挂载；不调整宿主代理/DNS/TLS或 Docker 全局设置。
每题串行，全新环境；工具目的地仅由 broker 绑定。探针最多30秒，停止沿用 #74/#75 Running=false、Pid=0确认。五个成功预检容器保留为已停止对象，仅用于审计，不用于正式 attempt。

首次准备包装层给 Node 控制进程设临时 HOME，使原 broker 按 homedir 计算的 Docker socket 指向不存在的临时目录。五题均在 ready 前失败。
保留原错误/收据，补充错误 socket 的只读负例后修正包装层：Node 控制进程保留实际 HOME，其他变量仍白名单；Python 子进程继续隔离 HOME/Docker配置。未修改 accepted broker。
修正后的第二轮每题成功启动一次；没有为补材料重新启动成功题。之后的镜像身份负例复用原 inspect，不再启动容器。

时间累计上限7200秒，所有准备命令和失败都入同一账本；中断 running 记录阻止静默重置。单请求/下载上限600秒，明确瞬时错误最多同 artifact 一次重试；本轮无下载重试。
资源起点在本工单下载之前；每5秒及命令前后采样 Docker.raw 已分配块与工作文件，新增上限24GiB、可用下限60GiB。压缩层体积不是落盘上界；拉取前以4倍压缩体积加512MiB作保守准入估计，并报告实际采样。
初始采样覆盖 Docker.raw 与活跃资产，后续补入候选准备代码/文档去重计量；原始采样不重写，最终收据包含此补充。所有观测均远离限额；不声称硬磁盘配额或采样间无突增。
独立 Regulator 的复用入口使用新工作目录与1800秒独立预算，不重下载；见[命令说明](../../scripts/harbor/pilot/environment-prep/README.md)。

## 未授权 live 提案

[草案](../../scripts/harbor/pilot/environment-prep/live-draft.json) 保持 authorized:false；run ID、Human 授权 ID/时间窗、signature 为空，不创建可信根或正式 campaign 账本。
绑定 #75 accepted runner、包 SHA256 `e7da84c88b4eadb1395914720b85514d54cfdb52a93a2b87bd3c8b0baf8c7ecb`、原 manifest 与五题本地 image ID。
Kimi profile 仍为 kimi-code / k3-256k / high，固定 endpoint；每题20 dispatch/40 tools、总100 dispatch，max_tokens4096，请求131072字节、响应524288字节、dispatch120秒。
官方 agent/verifier 秒数依次 750/360、1800/1800、900/900、900/900、1200/1200。原请求上限只是待 Human 批准的提案，不是当前执行许可。

未来命令形状（当前禁止执行）：

```sh
node /private/tmp/pan-wo75-builder/scripts/harbor/pilot/cli.mjs --activation /controller/human-approved.json --entry /private/tmp/wo75-work/consumer/node_modules/pan-agent/dist/index.js --task-root /private/tmp/wo76-work/tasks --output /private/tmp/wo76-live/new-campaign
```

使用干净、身份匹配的 accepted runner，另起全新正式环境和空日志目录，不复用预检容器。仍需 Human 明确额度与身份/时限签署，不能把本工单 prepared 或后续准备材料 accepted 视为 live 授权。
官方评分实际运行与环境联网依赖仍待未来受控执行确认；不申请充值、启用 DeepSeek、下载额外模型权重或登录付费账户。
