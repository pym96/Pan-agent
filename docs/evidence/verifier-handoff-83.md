# #83 Agent停止与评分交接｜Criteria1.0 候选

Builder 实现及自行验证完成，等待独立 Regulator 和 Human `H-GRADE83-BOUNDARY`。本报告不是 accepted Verdict；不新增 [Verified Project Facts](verified-project-facts.md)、简历披露或官方分数。

[正式合同](https://github.com/pym96/Pan-agent/issues/83#issuecomment-5792286554)，授权 `H-GRADE83-SCOPE-20260923-001`；基线 `739bed6c6d1643940ff2cf8411c3aa5a6214cf09`。候选分支 `workorder/83-candidate`，完整最终 SHA 由外部 Handoff 绑定。最终真实控制 runner：`60ed5d87787521b1db8a465f6f6c591de4626c06`；其后仅追加报告／设计／导航，执行文件逐字节一致检查在归档中。

## 修复与证据范围

#82 已验收证据显示：Agent completed 后，旧 Agent 定时器在官方评分准备阶段停止整个环境。这里分离 Agent、handoff、verifier、ended 阶段，正常完成及批准的时间／调用预算结束先停止Agent动作并核对真实进程，再进入一次独立计时的评分。原 Agent 原因、评分结果、全局取消和最终环境停止各自保留。详细接口和限制见[设计](../design/verifier-handoff-83.md)。

真实模型／Provider／凭证／余额请求 **0**；官方任务和官方 verifier 执行 **0**。所有响应为脚本输入，所有评分为 synthetic_control，不能当作官方成功。真实安装的 GeneralAgentSession、Kimi Adapter 和实际 broker 均被覆盖，未重写玩具 Agent 循环。未修改产品核心、policy、manifest、安装包、上游 Harbor、历史 Evidence 或 main。

冻结 Harbor 身份已只读核对：trial/single_step.py SHA256 `fbf03d5e721177b3d35b0a778ec5224f2bb07b55d540542c8339843f21f0b06e`；trial/trial.py `04f95b4197a77c948f81e4f848adbdd383ba6f62db03cfd4a2be590084a95c7a`。其捕获 AgentTimeoutError/NonZeroAgentExitCodeError 后评分的流程是参考；Pan四类调用预算映射来自Human本工单批准，不归因于上游规定。

## 最终验证

- `node --test scripts/harbor/pilot/test_*.mjs`：50 pass、13显式opt-in控制skip、0 fail。
- 冻结Python unittest discovery：20 pass，0 fail。
- 最终源码的真实缓存容器矩阵：7 pass，0 fail；此前取消修复的定向真实控制1 pass。
- 原症状离线复现、扩展fixture失败、并发时钟测试问题及后续修正日志全部保留。
- 16个实际控制archive均有唯一 run.terminal / run.settled；最终runner中工具开始事件与effects条数一致。原重复effects案例仍保留。

| 最终矩阵场景 | 脚本请求／工具 | Agent 原因 | 合成评分／终态观察 |
|---|---:|---|---|
| normal | 2 / 1 | completed，原因null | 一次合成评分；服务响应，产物保留，写入进程停止 |
| deadline | 1 / 1 | cancelled / agent_timeout | 一次合成评分；无追加解题请求，写入操作中断并确认 |
| budget | 1 / 1 | incomplete / turn_limit | 一次合成评分；原预算原因保留 |
| cancel | 1 / 1 | cancelled / operator_cancelled | 不评分；全局取消记录及环境停止 |
| verifier_cancel | 2 / 1 | completed，原因null | 评分中取消，缺reward为null；环境停止 |
| uncertain | 1 / 1 | cancelled / operator_cancelled | 真实未知setsid进程触发拒绝评分；全局停止记录 |
| timeout | 3 / 2 | completed，原因null | 确认局部超时后工具反馈进入下一请求，后续操作及合成评分完成 |

各次耗时、全部早期尝试、实际源码SHA、原始目录和阶段结果见[机器摘要](verifier-handoff-83-summary.json)。真实控制中的服务是已明确建立的PID1单进程FIFO服务，仅在容器内响应。写入子进程等待 grade-entry，评分前核对其不存在或为zombie，然后触发grade-entry、检查无迟到写入、产物存在及服务实际响应。证据是进程身份／文件／服务结果，不只是控制进程退出或mock布尔值。

额外离线覆盖正常完成、agent_timeout、turn_limit、step_limit、冻结Ledger的dispatch_budget/tool_budget，以及三阶段的用户取消／过期／资源停止、未知停止、迟到Agent回调、评分超时、完整评分后取消、取消后迟到评分、交接超时和合成评分分类。阶段事件使用显式调度顺序断言，不以模糊睡眠容差证明竞态正确。旧#81局部超时回归保留；旧“Agent deadline不评分”断言前瞻更新，历史日志不改。

## 累计预算、资源与终态

Builder固定账本 `/private/tmp/wo83-work/builder-container-budget.jsonl`，16次已结账，无未结束记录；累计 **59.34770695696352 / 1800秒**，剩余1740.6522930430365秒。首次正常控制、第一次矩阵、修复后定向取消及最后矩阵全部相加，没有按场景或源码版本重置。Regulator预算未使用，独立账本路径仍由合同指定。

每次区间在首次Docker镜像核对前写入并fsync，排他锁覆盖全区间，含启动、验证、等待、重复stop和最终清理。watchdog为60秒与剩余额度的较小值；本轮未触限，也没有超预算必要清理。所有容器只由本工单唯一命名创建；stop后inspect确认Running=false/Pid=0，再删除自有容器。旧资源未清理，无新镜像、网络、服务端口或依赖安装。

固定镜像 `sha256:41217bae6667f04a767dc1b2c5c12b034dfc51a18226202003313aaf86832055`，network none，2CPU/4GiB，无敏感挂载、特权或额外设备。35个资源样本，最低空闲87681548288字节、按首样本复算最大记账增长1339392字节；满足60GiB／24GiB约束。仅声明采样观测，不宣称捕捉瞬时峰值。旧#77/#79/#82三份消费账本哈希复核未变，未复用旧授权。

## 失败与判断修正

1. 原症状复现红：短Agent时限在合成评分等待期间仍触发agent_timeout。结合#82原始Evidence，修复对象从“延长等待”确定为阶段计时／停止耦合；没有延长官方时限。
2. 扩展脚本测试最初缺少Kimi工具轮所需的合成continuation字段，四类预算测试先报protocol。补齐fixture后才测试到实际预算路径；这不是模型或预算实现失败，原日志保留。
3. 完整并发回归暴露80ms墙钟复现受负载影响，以及旧CLI mock没有quiesce。改为可控制的事件顺序与阶段能力mock，未放宽行为断言。
4. 第一版真实矩阵通过原断言，但人工复查发现cancel下同一操作被effects记录两次。原因是已记录结果后再次检查全局gate进入catch，又补一条失败。补充精确条数断言并消除重复记录；旧候选 `f0bd2405efdd5d79ccd914520852575eabc6563f` 与其8次控制证据保留。修复后 `60ed5d87787521b1db8a465f6f6c591de4626c06` 定向及完整矩阵通过。

Human指定目标、预算和可评分原因；Master冻结合同与验收范围；Builder实现、诊断和自行验证；Regulator尚待独立复核。上述实现和测试操作由Agent完成，不写成人类独立实现。对任务成功率、真实网络错误根因和实际官方评分耗时的收益仍未知，需另行授权评测。

## 复核位置与限制

原件 `/private/tmp/wo83-work/`，归档 `/Volumes/WD_BLACK/pan-agent/wo83-verifier-handoff-20260923/`：

- `builder-evidence.tar.gz` SHA256 `ad0d4a59035c6679775eb0df589498ea8b9ba4632b20b50d36d5d1bbf93802e2`。
- `evidence-index.json` SHA256 `bd63170cba9aabac3ec9b66809a7f8242e0e8a5e8a9cc0a6464188d8bef799e0`；202个文件逐一回读验证。tar根wo83-work，含固定累计账本、所有控制输入/RPC/结果/原始archive/终态、所有失败日志、回归及范围身份检查。
- 原始合成fixture请求日志包含字面占位符`synthetic-private`；它是固定脚本测试输入，不是从真实模型取得的私有reasoning或凭证。真实凭证未读取，provider请求为0；候选只放脱敏统计和证据定位。

C-GRADE83-01～04均有上述Builder证据，最终判定由独立Regulator完成。尤其C-GRADE83-02：只保留Agent开始前已固定PID/start-time身份的服务，不支持任意新后台进程自动成为服务，也不证明对抗性隔离。Human应在技术复核后一次审阅“写入停止／服务保留／未知进程拒绝”的材料并确认H-GRADE83-BOUNDARY；本次不提前索取pass。

人类反馈检查PASS、整包结构PASS；根路径仍因已有`.DS_Store`和`潘佳祥——agent简历.pdf` BLOCK。范围外文件不修改。根SOURCE_OF_TRUTH已导航#83合同，集成/验收状态留Master更新。Handoff后Builder停止，不自行合main或宣布accepted。
