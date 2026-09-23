# Agent 停止与评分交接｜#83 Criteria1.0

本设计属于 Product 的评测适配层，候选待独立验收；不改变 TypeScript 产品核心、安装包或上游 Harbor。原实现事实以 [Verified Project Facts](../evidence/verified-project-facts.md) 为准，本页不晋升事实。[合同](https://github.com/pym96/Pan-agent/issues/83#issuecomment-5792286554)批准本次阶段语义变更。

## 阶段及两类停止

`agent → handoff → verifier → ended` 单向推进；全局停止可在任一未结束阶段关闭环境。Agent 正常完成、agent_timeout、turn_limit、step_limit，及冻结 Ledger.reserve 直接抛出的 dispatch_budget/tool_budget 可进入 handoff。传输、协议、缺用量、输出截断、任意同名异常不因此获得评分资格。

软时限先关闭准入、向 broker 发 quiesce，再取消 Session 的在途模型／工具操作。它不会直接杀容器。运行、Session.close、交接都有额外有限等待；到期则停止确认失败，拒绝评分并停止环境。此等待不能接收新模型／工具操作。Ledger 预算异常只在直接调用冻结 Ledger 原方法处分类，policy/签名协议不改。

Agent 定时器在 Agent 结束或软停止时清除，回调还检查阶段以拒绝迟到事件。评分入口新设独立 verifier 定时器，包含准备时间且使用原任务 verifier.timeout_sec；不增加官方时限。用户取消／资源停止共用外部信号，授权到期单独保持有效；命令停止不确定仍硬停止。硬停止通知评分等待并停止实际环境，迟到评分响应不能写入已结束报告。评分在取消前完整返回时，结果与晚到取消分别保留。

## broker 的停止证据与服务边界

真实 broker ready 前抓取初始 Linux /proc PID、start-time、PGID 身份。它们属于可信环境建立阶段；不凭服务名称或模型自报放行。工具操作仍由 setsid 的受控进程组承载，锚点身份在放行命令前核对；正常结束和局部超时都会结束该命令组并确认无执行中成员。局部已确认超时继续支持下一轮工具反馈。

quiesce 永久关闭新的 exec，置位当前命令的中断事件，等待其有界进程组清理，再重新读取进程清单。只允许初始固定身份仍存在；新独立进程、PID重用或无法确认均拒绝评分，并停止整个容器。评分至少需要这一份真实清单确认，不能仅靠 Session 退出。

本切片只保留**Agent 开始前已固定身份的服务**。不提供 Agent 动态注册服务、通用 daemon 发现、任意服务派生进程白名单或对抗性隔离。初始服务后续产生未知独立进程也可能触发保守拒绝。停止范围与这些限制是 Human 新边界审阅的对象。

合成真实控制使用 PID1 的单进程 FIFO echo 服务（容器内部，无宿主端口）。Agent 操作写入产物并创建等待 grade-entry 的写入子进程；评分入口先检查该写入进程已不存在或为 zombie，再触发 grade-entry、检查无迟到写入、产物存在并请求服务响应。正常、Agent时限、调用预算都沿实际 Session/Adapter/broker 路径。未知进程负例真实启动新的 setsid 进程，触发拒绝评分。

## 报告与边界

`agentStatus`保留产品终态，`agentStopReason`保留 Agent 原因；兼容字段`stopReason`仍在。`globalStops`另列硬停止的原因／发生阶段，`quiescence`保存停止清单，`stopConfirmed`表示最后环境停止是否确认，`phases`记录单向阶段轨迹。verifier 状态/reward与Agent原因并存，不因原Agent超时清空已完成评分。合成结果为 synthetic_control，summary不把它归入official_scored；缺评分为null。

退出前停止环境，CLI对全局取消/过期/停止不确定等不再准入下一题。没有新live入口、自动重试或补题。旧#79/#82证据保持原值，#81旧“不评分”时限断言由本工单的新测试前瞻替代，不改历史日志。

## 验证与资源

[Evidence](../evidence/verifier-handoff-83.md)绑定实际控制源码SHA、完整账本和原始证据。真实控制需显式授权，Builder及Regulator分别使用固定排他锁账本；未完成区间拒绝新尝试，必须先恢复核对。每个区间从首个Docker操作前到停止/清理后计时，包含失败与等待，60秒或剩余额度中较小者为watchdog；必要清理即使超预算也记录。

缓存镜像、network none、2CPU/4GiB、无挂载/特权/额外设备；内置盘活跃证据、5秒采样与60GiB/24GiB保护保持。只有本次命名容器在确认停止后删除。测试使用真实安装Session与脚本transport，真实Provider、官方任务、官方verifier调用均为0。
