# #83 Agent 停止与评分交接｜Criteria1.1 候选

已完成本轮修订和 Builder 验证，待独立 Regulator；**已知一次 Docker 操作未入预算账本，不能声明 C-GRADE83-04 满足**。新边界 Human 材料审阅也尚未完成。本报告不是 accepted Verdict，不新增 [Verified Project Facts](verified-project-facts.md)、简历披露或官方成绩。

[正式 Criteria1.1](https://github.com/pym96/Pan-agent/issues/83#issuecomment-5793143932)，继承未冲突 1.0，授权 `H-GRADE83-SCOPE-20260923-001`。基线 main `739bed6c6d1643940ff2cf8411c3aa5a6214cf09`，原候选 `5552200379c3f4d45288b6942966d3ac755e3314` 原分支追加，未重写历史。新完整 SHA 由外部 Handoff 绑定。

## 改动与实际依据

移除初始 PID/PGID 白名单及正常命令返回即清理进程组；保留任务服务和状态，关闭 Agent 准入／控制循环并收尾宿主 Docker 客户端等待后评分。`wait.settled` 不再冒充容器任务进程停止。工具等待上限仍 30 秒，评分沿用原独立时限，全局取消最终停止整个自有容器。

冻结 Harbor 的 Docker exec 超时结束宿主客户端，共享环境先评分后停止。五题实际 instruction/config 中，Nginx 明确要求服务在配置后可访问；评分请求产生服务日志是任务行为。其余四题的产物／计算需求不支持普遍“新进程即失败”的推断。[设计](../design/verifier-handoff-83.md)列出三类对象、源码哈希、本地适配与上游的差异。363 个 Harbor 文件、80 个安装文件与 Python 身份全量匹配原 package-identity，十份任务 instruction/config 匹配 manifest。

真实模型／Provider／凭证／余额请求 **0**，官方任务／verifier **0**。真实安装的 Session/Adapter 搭配脚本响应，真实 broker 和缓存容器执行无害控制。未修改产品核心、policy、manifest、安装包、Harbor、任务定义、旧 Evidence、main 或 Regulator 账本。

## 验证结果与复查材料

离线 Node **50 pass / 8 skip / 0 fail**，Python **19 pass / 0 fail**。真实缓存容器 **7 pass / 0 fail**。旧 WO81 进程组测试入口已前瞻停用，历史版本及原始证据保留，纯账本准入测试保留；没有用固定测试数作为验收门槛。

| 场景 | 脚本请求 / 工具 | 观察 |
| --- | ---: | --- |
| normal | 3 / 2 | ready 后工具启动服务，后续工具与合成评分均成功请求，产物保留 |
| budget | 2 / 2 | turn_limit 后同一服务可评分，未增加请求 |
| deadline | 2 / 2 | agent_timeout 中断宿主等待后评分；长操作在评分释放后完成，原终止原因保留 |
| timeout | 4 / 3 | 长操作跨过 2 秒等待期限；模型可见 timeout，下一工具释放并观察完成，再评分 |
| cancel | 2 / 2 | 工具等待中用户取消，不评分，整个自有容器停止 |
| verifier_cancel | 3 / 2 | 评分中取消，reward=null，环境停止 |
| uncertain | 3 / 2 | 真实停止本次容器，交接读到 environment_not_running，拒绝评分；不是未知 PID 门禁 |

每例初始只有 idle 容器，没有预启动 FIFO 服务、PID 清单或动态注册。服务由实际 Agent 工具创建；后续工具写 later-tool 标记、评分发送 grade 请求并由服务写日志。timeout 的 start/done 标记证明等待结束不等于任务进程结束。所有控制最终 inspect 确认 Running=false/Pid=0，随后只删除自己的容器。合成 reward=1 不计官方成功。

两个实际 runner：`ece11c603915d225debe2459092e2db491e30452`（normal/timeout）与 `6cdafcb0d3d0bcf0dbd8fbe99767ec45e38bf502`（其余五例）。两者执行文件及真实夹具字节完全一致；差别仅设计文档及离线测试末尾空行。`runner-equivalence.json`记录核对；后续交付提交只更新文档／摘要／导航，不把未运行的实现冒充已测。

保留原有六种可评分结束路径、三阶段用户取消／到期／资源保护、迟到响应、评分与取消有序竞争、局部命令错误、独立评分时限及一次终态测试。新增客户端正常／非零／超时／交接中断／启动失败、有界输出、真实容器状态交接与失败禁止评分测试。完整原始日志见归档。

## 预算、偏差与资源

固定 Builder 账本 `/private/tmp/wo83-work/builder-container-budget.jsonl` 原前缀逐字节保留，现 **23 个完成区间，79.88078095798846 / 1800 秒**，账面剩余 **1720.1192190420115 秒**；本修订新增 7 区间。无未结束区间。Regulator 原 8 区间／27.373108915024204 秒逐字节未变，Builder 未使用其额度。

**已知偏差：**首次离线红测只 mock `broker.docker`，但旧 `ManagedCommand.confirm_quiescent` 直接调用 subprocess，因而意外执行一次 `docker exec synthetic /bin/sh -c …`。命令失败，没有创建容器、运行正式任务或模型。该操作没有进入固定账本，实际 Docker 单调时钟端点未知；工具报告整个 shell 0.433583542 秒、unittest 0.118 秒，这些不是可倒填的 Docker 区间。原 `red-offline.log` 与 `budget-deviation.md`保留，不补造、重置账本或把实际总耗时写成精确已知。此偏差需由独立方按 C-GRADE83-04 裁定；后续成功不能消除它。

修正测试隔离后，新增实际控制全部由固定排他锁账本包围，从首次 image inspect 到最终 stop/inspect/rm，包含等待与失败，watchdog 为 60 秒与剩余额度较小者。缓存镜像 `sha256:41217bae6667f04a767dc1b2c5c12b034dfc51a18226202003313aaf86832055`；network none、2CPU/4GiB、无挂载／特权／额外设备／端口。内置盘活跃证据，5 秒资源采样与 60GiB/24GiB保护不变；无下载／安装／新镜像／旧资源清理。

## 判断修正与归属

1. 旧 1.0 以“Agent 停止”等同全部新任务进程停止，正常返回也清组；其原技术 PASS 证明的是旧合同边界。Human 指出服务／长操作应按冻结上游和任务语义保留，Master 发布前瞻 1.1；不是追溯声称旧测试未通过。
2. Builder 读取冻结执行／超时／共享环境源码与五题说明后，移除自制 PID 规则，采用薄的宿主等待收尾；真实服务和跨等待操作控制验证此修正。仍不证明对抗性后台 Agent 检测、任意环境兼容或五题成绩收益。
3. 红测隔离失误及未入账命令是 Builder 操作错误。原因和日志公开保留；后续在实际 subprocess seam mock，真实 Docker 全走固定夹具。不得归因于 Human，也不能用模拟计时补齐审计历史。
4. 首轮 Node 回归失败是旧 mock 仍返回 termination.confirmed，修订为 wait.settled 后通过；原日志保留。源码等价审计初版误把 ignore-space-at-eol 当成忽略空白行，改为读取 Git blob 的 rstrip 精确比较，未重复容器运行。

Human 提供目标纠偏，Master 冻结合同，Builder 完成实现与自测，独立 Regulator 尚待复核。C-GRADE83-02 新边界材料需在技术复核后由 Human 一次审阅；不再请求旧 PID 边界的 pass。

## 原件与交接

新归档 `/Volumes/WD_BLACK/pan-agent/wo83-verifier-handoff-20260923/criteria11/`，含 `builder-evidence.tar.gz`、`evidence-index.json`、`Handoff.md`。归档哈希由[机器摘要](verifier-handoff-83-summary.json)及外部 Handoff 绑定。活跃原件在 `/private/tmp/wo83-work/criteria11/` 与 `criteria11-<scenario>-<uuid>/`，固定累计账本保持原位置。

旧归档 `../builder-evidence.tar.gz` SHA256 `ad0d4a59035c6679775eb0df589498ea8b9ba4632b20b50d36d5d1bbf93802e2` 复核未变；旧 `../regulator-20260923/Verdict.md` 的技术 PASS、rejected/evidence_incomplete 原样保留。请求文件中的 synthetic-private 是固定脚本占位符，不是真实模型 reasoning 或凭证。

人类反馈无待处理；整包结构检查 PASS。根路径仍因已有 `.DS_Store` 与 `潘佳祥——agent简历.pdf` BLOCK，未改范围外文件。根 SOURCE_OF_TRUTH 已导航 1.1，验收／集成状态留 Master 维护。交接包含已知预算违规，Builder 不宣布 accepted，不合 main。
