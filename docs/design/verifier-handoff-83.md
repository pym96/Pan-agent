# Agent 停止与评分交接｜#83 Criteria1.1

Product 评测适配候选，待独立 Regulator 与新边界 Human 材料审阅，不晋升项目事实。[正式修订](https://github.com/pym96/Pan-agent/issues/83#issuecomment-5793143932)前瞻替换冲突的 1.0 边界；旧候选 `5552200379c3f4d45288b6942966d3ac755e3314`、技术 PASS、缺 Human 回执的 rejected Verdict 和原始日志保留。

## 三个不同的对象

| 对象 | 生命周期与本地映射 | 冻结依据 |
| --- | --- | --- |
| 已启动任务进程（服务、编译、计算） | 正常工具返回不杀进程组；工具等待到期可能仍运行。保留共享容器到评分后，最终停止整个自有容器。没有初始 PID/PGID 门禁、服务注册或名称放行。 | Harbor `SingleStepTrial._run` 的共享环境先评分后停止；Docker exec 超时终止宿主客户端，未扫描或终止容器进程组。 |
| 在途工具等待 | `timeout` 仍为 `(0,30]` 秒。超时／交接中断只结束宿主 Docker 客户端等待；TERM 等待至多 5 秒，再 KILL 等待至多 2 秒，输出收尾至多 2 秒。必须得到客户端已收尾的证据，不能把它写成任务进程已停止。 | 冻结 `DockerEnvironment._collect_buffered_output`、`_collect_streamed_output` 和 `_terminate_process`；Unix `exec_shell_args` 为 `bash -c`。 |
| 可发起新动作的 Agent 控制器 | 正常完成、Agent 时限或明确调用预算结束关闭新决策、transport 与工具准入；取消 Session，有限等待控制器及工具收尾，再评分一次。保留任务状态不授权继续模型调用。 | `BaseAgent.run`、`Trial._run_agent_phase` 的 agent timeout 与 `_run_shared_verifier` 的独立 verifier timeout。 |

这里是薄的本地 Docker exec 适配，不宣称直接调用 Harbor exec 或完全等同所有平台／服务路由。绑定原容器和 workdir，使用冻结 Linux shell 包装；输出每流保留 65536 字节。冻结 streamed collector 会累计全部输出，本地保留既有输出上限；冻结 buffered collector 没有通用取消收尾，本地为交接增加显式中断与有限收尾。这两处是本地安全映射，不是上游新增能力。

模型可见工具描述与返回明确说明：等待超时不证明命令终止；后台服务须重定向标准输入输出；后续命令可检查任务状态，不可启动后台 Agent 控制循环。没有增加模型工具次数、请求预算或官方任务／评分时限。任务进程保留到评分后并非新增 Agent 准入。

## 冻结源码与五题需求

Harbor commit `f9deaca7f44ab0b91f1dd445d79629e4d97a0716`，package-identity 固定 363 个 Harbor 文件、80 个安装包文件和 Python 身份。此次逐文件复核一致。原件 SHA256 及十份 instruction/config 身份在 Evidence 的 `source-identities.json`。

- `trial/single_step.py`：`fbf03d5e721177b3d35b0a778ec5224f2bb07b55d540542c8339843f21f0b06e`。
- `trial/trial.py`：`04f95b4197a77c948f81e4f848adbdd383ba6f62db03cfd4a2be590084a95c7a`。
- `environments/docker/docker.py`：`071d8d1f13dcb59b5f02cdcbf88dce36108cac4ccb3dd0db4a063fc988b5b35b`。
- `environments/docker/docker_unix.py`：`56f1655b29ad222c315b2ea3c6d4172d6fdcd4a3788697eb9d3f80d1264b3152`。
- `agents/base.py`：`5a0a59edb7406c8ad77f3667f5a4eff2a755509c6d0d2cd0c25ce8405de7773c`。

只读取五题 instruction.md/task.toml，未读取解题答案或运行任务。Nginx 题明确要求配置后服务仍可访问，并持续记录请求；其服务及评分触发的日志写入必须保留。overfull 的编译、dna 的计算、merge 的获取／合并及 break-filter 的产物生成可能需要较长操作，但 instruction 本身未要求普遍持久服务。不能从这些文本推导所有后台任务必须被杀，也不宣称本夹具已证明五题成功。

## 阶段、取消与报告

`agent → handoff → verifier → ended` 单向推进。正常完成、agent_timeout、turn_limit、step_limit 及直接由冻结 Ledger.reserve 抛出的 dispatch_budget/tool_budget 可以进入 handoff。传输、协议、缺用量及任意同名异常不因此获得评分资格。

quiesce 永久关闭 broker exec，置位客户端等待中断，等待在途 RPC 收尾，再检查实际容器仍运行。检查对象是控制等待与容器状态，不是任务进程身份。无法确认客户端／Session 停止、Docker 操作失败或环境已丢失则拒绝评分，记录实际失败并停止环境。局部超时及命令非零退出仍是可反馈工具结果。

Agent 定时器在软结束时清除，迟到回调受阶段约束。评分入口使用原 verifier.timeout_sec 独立计时，包括准备。用户取消、授权到期、资源保护仍为全局停止，取消 Agent 与评分并停止自有容器。完整结果先返回时与晚到取消分别保留；迟到结果不能改写已结束报告。没有自动重试、补题、评分回流模型或新 live 入口。

`wait.settled` 只证明宿主客户端等待收尾；`quiescence` 是 Agent 准入关闭后的交接结果；`stopConfirmed` 是最终整个环境停止确认。`agentStatus`、`agentStopReason`、`globalStops`、verifier 与 phases 分开保留。合成分数为 synthetic_control；无评分为 null，不混入官方成绩。

## 真实控制与限制

ready 时只有 idle 容器。实际 Agent 工具第一步写产物并启动无害 FIFO 服务，无 PID 注册；第二步请求服务并留下成功标记；合成评分再次请求并写服务日志。正常和预算结束必须完成这一路径。

长操作在第二步写 start 后等待 release，跨过工具等待超时；第三步释放并观察 done。Agent 时限控制则由评分释放并观察 done，允许任务状态在交接后继续变化。取消必须真正停止整个容器。实际控制失败负例停止本次自有容器，使 handoff 观察 environment_not_running，禁止评分；不再以新 PID 充当失败。

全部真实夹具遵守原缓存镜像、network none、2CPU/4GiB、无挂载/特权/设备，独占累计 1800 秒账本、60 秒或剩余额度 watchdog、5 秒采样与 60GiB/24GiB 宿主保护。仅删除本次创建且确认停止的容器。旧 WO81 执行夹具前瞻停用，历史源码和原始 Evidence 不变。

本轮红测发生一次未入账的虚构容器 docker exec，详见 [Evidence](../evidence/verifier-handoff-83.md) 的偏差记录。不得声称全部 Docker 操作均已入账；由独立方裁定 C-GRADE83-04。这不改变后续操作必须入原账本的约束。
