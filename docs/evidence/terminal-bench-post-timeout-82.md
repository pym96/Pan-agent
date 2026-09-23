# #82 固定五题真实评测｜Criteria1.0 候选

状态：Builder 已完成唯一授权 campaign，等待独立 Regulator 与 Human `H-LIVE82-RESULT: pass`；未自行验收。五题全部尝试、全部未评分：有效官方评分 0/5、有效官方成功 0/5、未评分 5/5。**这不是测得任务准确率 0%，也不证明任务解答错误。** 原始 reward 全部为 null，没有补题、重新启动或评分重试。

## 身份与授权

- [正式合同](https://github.com/pym96/Pan-agent/issues/82#issuecomment-5791146400) / [正式激活](https://github.com/pym96/Pan-agent/issues/82#issuecomment-5791146791)，Criteria1.0。
- runner／候选基线：`b4870e0b797de13d81fa043b4bbe30cf148c7fab`；实际干净 runner `/private/tmp/wo82-runner`。报告候选完整 SHA 由外部 Handoff 绑定，避免提交自引用。
- run ID：`60592f7d-ef87-4483-8cfb-e428a55e7063`；Human 授权 `H-LIVE82-20260923-001`。
- activation SHA256：`b220c2ece07e318676fa6a87de4066ab082f7ead011c7d26c53bf59b7f3231a3`；窗口 UTC 2026-09-23T07:51:49.011Z 至 2026-09-24T07:51:49.011Z。
- 包 SHA256：`e7da84c88b4eadb1395914720b85514d54cfdb52a93a2b87bd3c8b0baf8c7ecb`；manifest SHA256：`74433498d6a551c86ccc6e5faad2f9d8d3c099e5b872170e54edf23769fe6503`。
- 控制进程只检查 KIMI_API_KEY 非空，结果 true；无密钥值输出、搜索或模型探测。签名、80 个安装文件、363 个 Harbor 文件、Python、46 个任务文件及五个缓存镜像身份通过核对。结束后包／安装／任务身份再次核对不变。
- 预启动只读核对累计 85.22696754100616 / 1800 秒，含等待；未启动控制任务、修复宿主或下载镜像。启动前 run 账本及 campaign 目录不存在。
- CLI 仅一次，UTC 07:56:51 启动、08:21:52 退出，单调时钟耗时 1501.3263344169827 秒，exit 0。退出码只表示控制流程退出，不代表任务成功。

## 五行完整结果

| 任务 | 官方 reward／分类 | 请求／工具 | 已报告 input／output tokens | 未知 usage 请求 | 容器存活秒 |
|---|---|---:|---:|---:|---:|
| overfull-hbox | null；Agent 完成后，评分准备被 agent_timeout 取消 | 16 / 15 | 254478 / 11051 | 0 | 761.187275 |
| dna-insert | null；model_error / transport，未启动评分 | 6 / 7 | 36272 / 1782 | 1 | 265.129242 |
| nginx-request-logging | null；command_stop_unconfirmed，整容器停止已确认 | 4 / 4 | 11575 / 485 | 0 | 107.924553 |
| merge-diff-arc-agi-task | null；model_error / dispatch_error，未启动评分 | 10 / 10 | 61912 / 1181 | 1 | 218.074921 |
| break-filter-js-from-html | null；model_error / transport，未启动评分 | 2 / 1 | 423 / 90 | 1 | 139.178545 |

合计 38 次请求、37 次工具预占／结果、16 个工具错误；已报告 input 364660、output 14589，共 379249 tokens。三次失败请求 usage 未知，不补零，不能把已报告合计称为全量实际用量。未推断价格、账户剩余额度或费用。

容器存活秒来自 Docker StartedAt/FinishedAt，包含准备、Agent、可能的 verifier 与停止过程，不是模型推理耗时。账本没有逐请求时间戳。每题不超过40请求／80工具，全程不超过200请求；固定 max_tokens4096、请求131072字节、响应524288字节及单次120秒 dispatch。官方时限、30秒工具上限和实现均未修改。

唯一 verifier 调用属于 overfull-hbox：archive 已记录 Agent completed，随后出现官方 test-stdout.txt，末尾为 Python 下载；无 reward 文件或测试完成记录。stop.json 记录 agent_timeout。这是冻结 Agent 计时器覆盖评分阶段所致的取消，未取得有效评分；不能由 Agent 自称完成推定正确。

其余三次模型失败的公开事件只有 transport / kimi_transport_failure；merge 的 controller 额外记录 dispatch_error。底层网络、服务器或超时原因无法由这些事件区分，未作额外诊断请求。没有观测到明确认证／额度错误、Docker 不可用或资源超限；这些未知不能改写成认证正常的证明。

## 局部超时与实际后续行为

四次局部 timeout 的工具反馈均记录 termination.confirmed=true，随后存在 model.turn_started 与 tool.started：

| 任务 | 超时动作 | 后续可见动作 |
|---|---|---|
| overfull-hbox | Perl 搜索命令，29秒 | 重新编译 LaTeX，检查 overfull 日志及文件差异 |
| dna-insert | 更新软件源并安装 primer3，30秒 | 再发安装命令，检查可执行文件路径 |
| merge-diff-arc-agi-task | 第一次 apt-get update，30秒 | 再次发出 apt-get update |
| merge-diff-arc-agi-task | 第二次 apt-get update，30秒 | 读取安装日志，检查 Python/pip |

具体 toolCallId、输出字节数和 next_tool_call_id 见[机器摘要](terminal-bench-post-timeout-82-summary.json)，原始事件见各任务 pan/archive。事件及冻结 session 的 continuation 实现支持反馈进入后续模型交换；本轮未保存出站请求体，不声称直接抓取了 provider 收到的 payload，也不索取私有 reasoning。模型再次发出的命令是同一 attempt 内计费的独立工具步骤，不是 Builder 重启任务或评分重试。

nginx 不是上述四个“确认停止后恢复”的案例：安装 nginx/curl 时，在 termination_snapshot 发现 unmanaged_process_observed（PID 3818、PGID 3818），局部终止确认 false。执行器停止整个任务容器，report.stopConfirmed=true，stop.json 及结束后 Docker inspect 均证实 exited / Running=false / Pid=0，之后才进入下一题。此前 apt 源请求出现502；它与 unmanaged 进程的因果关系未知。本例只支持当前受控进程组边界，不能宣称覆盖所有软件安装行为或对抗性隔离。

## 停止、资源与保留

结束后只读 Docker inspect：五个自有容器均停止，五个自有网络均已由冻结 runner 释放且查询不存在。控制进程已退出，无持续任务；未删除容器、旧网络、镜像或历史失败证据。正常 container close 发生在后继任务前，无法局部确认的 nginx 已完成整容器停止；没有以杀控制进程代替停止证明。

307 个资源样本，最低空闲 86160392192 字节；按冻结算法 owned + max(0, docker分配量 − 首样本docker分配量) 复算，最大增长 202129408 字节。低于24GiB、空闲高于60GiB；五题串行，配置2CPU／4GiB。该数字是采样观测，不宣称捕捉采样间所有瞬时峰值。

原两份 ledger 哈希保持：6130046a…为 `61087c150935b7d19eba403e129e5ebf45c2a95d68c9359e660675b459a725f2`；fc6f81d3…为 `472dbdcfc52f2da0786ae9a7550dbccc1f285e0bda3fbc5fd0fd249d72ad73c5`。新账本完整副本保留，未重置；authority 旧备份与 activation 一并归档。

## 与 #79 的描述性比较及案例

#79 是2题官方成功、3题未评分；本轮0题有效评分、5题未评分。#79 请求／工具56／60、已报告408946 tokens、未知usage0次；本轮38／37、已报告379249、未知3次。相同公开五题、模型及请求上限不消除模型轨迹、联网依赖与实际时限消耗的差异。没有拼接跨轮最佳成绩；不能称同预算因果提升、稳定能力提升或未见 holdout 成绩。

目标是在冻结预算和实现下检验超时恢复后的实际任务表现，而非保证正分。Human 选择先运行冻结版本并批准预算；Master 固定合同和签名授权；Builder 执行、监督、离线核对与留证；模型自主生成任务命令，上游提供任务与官方评分。不能把 Agent 的实现或操作写成人类独立完成。

当时依据是 #81 受控测试 accepted，仅证明局部进程组超时恢复和全局停止。本轮四次恢复提供真实轨迹，但评分准备取消、安装产生新进程组与模型传输失败阻止有效任务结论。已验证的是上述事件和终态；传输根因与恢复对任务正确性的贡献未知。未来可由 Master 另行评估评分准备时间、安装进程边界及传输诊断的工单价值；本轮没有据此修代码、补实验或扩大授权。

## 证据及复核

本地原始证据：`/Volumes/WD_BLACK/pan-agent/wo82-post-timeout-20260923/`。

- `raw-evidence.tar.gz`，SHA256 `fc188d9310b0f3a0e329f5193a4d864d7407a5c3675fdfa57d188f9e6c0330bf`。
- `evidence-index.json`，SHA256 `11c08f3b1cb6bf29b86b1f0a5710a09709d9c77bf6eb6203d9e59ce62a622569`；67文件逐一回读归档验证。tar 根为 wo82-live，含全部五题日志／archive、资源样本、消费账本、预启动、启动与退出记录、监督记录、终态及离线检查。
- 活跃原件 `/private/tmp/wo82-live/` 保留；固定消费账本位于原 wo75/ledger 下本 run ID.jsonl。Git 只含本脱敏报告、机器摘要及 README 导航。

Builder 离线检查通过：五任务身份／唯一尝试／预算／结算、缺失reward、usage复算、四次超时后续事件、冻结包与任务文件、终态及资源。没有新增模型、任务、verifier 或控制测试。宿主路径检查仍因既有 `.DS_Store`、`潘佳祥——agent简历.pdf` BLOCK；整包结构检查 PASS（files4/facts43/reality_refs20/targets8），不代表事实或结果已验收。根 SOURCE_OF_TRUTH 已指向本工单合同／激活；范围外真源状态由 Master 后续维护。

C-LIVE82-01～03 交独立 Regulator 在干净 worktree 上离线复算精确候选 SHA、读取原始证据并补报告／账本负例；不得重跑模型、任务或评分器。技术审阅后还需 Human 五行结果分类回执。当前没有 accepted 声明、VPF 登记、简历迁入或 main 修改。
