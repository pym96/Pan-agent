# #76 Environment preparation Evidence｜Criteria1.0

Builder 候选，不是 accepted，也不授权真实模型。[合同](https://github.com/pym96/Pan-agent/issues/76#issuecomment-5776256546)；[设计与限制](../design/terminal-bench-environments-76.md)。
基线 `a74c0675d0a3eefea282a62585925617a89a7da3`；完整新 SHA 在外部 Handoff 绑定。

原始证据根 `/Volumes/WD_BLACK/pan-agent/wo76-environments-20260922/`，`evidence-index.json` 逐文件哈希。
活跃源码 `/private/tmp/wo76-work/tasks`；镜像原始层保留在本机 Docker 镜像库，注册表原始元数据、inspect、全部任务源字节及日志在 WD_BLACK 归档。

| Criterion | Builder 原始证据 | 边界 |
|---|---|---|
| C-ENV76-01 | `sources.json` 与原 broker validation 日志；46 个固定源文件 Git blob；`registry/` 标签/平台/config/layers；`images.json` 与实际 inspect | 原五题及 manifest 未改；所有镜像为 amd64，使用现有仿真；没有其他题目下载 |
| C-ENV76-02 | `preflight-r2/*/report.json`、配置及 stop.json；五题 ready/探针/Running=false、Pid=0；累计 budget.json 和资源样本 | 原轮失败保留在 `preflight/`；probe 不执行正式 verifier/可见测试，不证明正式评分可用 |
| C-ENV76-03 | Git 中 environments.json / live-draft.json；复用命令；源/镜像和五个已停止容器身份 | 草案 authorized:false；没有真实信任根、授权或正式 campaign 账本；实际任务另起干净环境 |

实际五题状态均为 prepared，含义仅限环境启动和有限预检。多个镜像缺少 curl、Python 或 uv/uvx/pytest；不伪称依赖齐备或任务能获正分。逐题命令可用性为 report.probe.stdout，未探测项仍未知。

失败保留：首轮五题在 ready 前 broker_failed，因准备控制进程的隔离 HOME 改变了 accepted broker 计算的 Docker socket。`preflight-repair.json`、错误 socket 只读负例与首轮配置/日志记录原因；修正仅在新增包装层，第二轮串行完成。没有重跑已成功题、修改 #75 broker、放宽隔离或调整宿主网络设置。

新增离线检查覆盖预算/独占/中断账本拒绝重置、平台选择、错误 prepared/固定分母、实际缓存 inspect 的错 digest/平台负例、未授权草案被原授权函数拒绝；缺源负例在独立复制目录执行，不动复用资产。
准备命令/失败累计在同一账本，限额7200秒；原样保留初始采样，最终摘要追加候选代码/文档计量说明。实际资源与时间以 `summary.json` / budget.json 为准，未超过24GiB增量或60GiB剩余边界。

零 Provider/余额调用、零真实凭证读取、零 oracle/正式 verifier/解题。没有读取 solution/隐藏测试解题内容进行调试，没有充值、额外权重下载、全局 prune 或清理他人对象。

已接受 #75 Verdict SHA256 `eee96cecb44e8ec2d603821de921e0594edb93197933effafeef5c7d18e46748` 及原包/manifest/broker 身份复用；旧证据/失败/已消费账本未改。原宿主 `.DS_Store` 与根简历 PDF BLOCK 分列保留；新候选的隔离路径/整包收据在 `host-checks/`，不将隔离结果当作原宿主 PASS。
独立 Regulator 从远端同 SHA 复核三项 Criteria；可各一次 ready/停止，独立准备预算1800秒。Builder 推送 Handoff 后停止，不自行 accepted、修改 main 或登记事实。
