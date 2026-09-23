# #84｜冻结五题真实评测｜Criteria1.0

Builder 候选报告，待独立 Regulator 及 Human `H-LIVE84-RESULT`。一次 campaign 已结束：**官方成功 2/5，有效官方评分 2/5，未评分 3/5**。未评分不是测得 0 分；没有官方已评分失败或未开始题目。不新增 [Verified Project Facts](verified-project-facts.md)、简历披露或 Wiki 事实。

[正式合同](https://github.com/pym96/Pan-agent/issues/84#issuecomment-5794079889)／[激活记录](https://github.com/pym96/Pan-agent/issues/84#issuecomment-5794080347)。实际 runner 与报告基线 `c2c30e7cdf90b26d03ef4cdf3697cd3cdb347ecf`，run ID `5262035a-b2cf-48cc-ad75-50d06decf8b5`，授权 `H-LIVE84-20260923-001`。报告分支 `workorder/84-candidate`；最终完整 SHA 由 Handoff 绑定。

## 五行结果

| 原顺序／任务 | 分类／官方 reward | Agent 终态／原因 | dispatch 请求尝试 | 工具 | 已知 input / output tokens | 用量缺失 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| overfull-hbox | 未评分／null | model_error／transport | 4 | 4 | 8163 / 388 | 1 次已预留请求 |
| dna-insert | 未评分／null | model_error／transport | 7 | 7 | 29372 / 1457 | 1 次已预留请求 |
| nginx-request-logging | 官方成功／1 | completed／无停止原因 | 8 | 7 | 17679 / 1800 | 无 |
| merge-diff-arc-agi-task | 官方成功／1 | completed／无停止原因 | 21 | 23 | 114046 / 5465 | 无 |
| break-filter-js-from-html | 未评分／null | model_error／transport | 27 | 27 | 428123 / 20240 | 最后一个未预留 dispatch 的失败模型轮 |

Nginx 原 `reward.txt=1`，官方 stdout 与 CTRF 均为 **8 passed**；合并任务原 `reward.txt=1`，stdout 与 CTRF 均为 **5 passed**。两题 verifier 准备／执行返回记录均为 `[0,0]`，不是依赖安装失败后写出的假 0 分。其余三题 verifier=null，没有官方 reward 文件，不把模型自称、可见测试或中间工具结果当作官方成绩。

固定分母是原五题，不筛掉失败项；也不以“已评分两题全过”宣传总体 100%。这些题已用于调试，并非 holdout；与 #79／#82 只能描述性比较，不拼接最佳成绩或宣称单轮因果提升。

## 消费、身份与执行窗口

全轮 **67 次 dispatch 请求尝试、68 次工具调用、68 个模型轮**；65 个交换报告用量，已知输入 **597383**、输出 **29350** tokens。另有 3 个 usage unavailable：前两题各一个已预留 dispatch，最后一题一个没有新增 dispatch 预留的失败交换。后者不能算第 68 次真实请求，也不能把它的未知用量写成 0。dispatch 预留是冻结 runner 的请求尝试计数，不证明每个请求都到达服务端；不推算费用或余额。

每题不超过 40 dispatch／80 工具，全轮不超过 200 dispatch。五个 attempt 各仅预留一次，每份事件归档只有一次 run.started／run.terminal／run.settled；tool.started、tool.settled、effects 与工具账本数量一致。唯一 CLI 退出码为 0，表示流程结束，不等于五题成功。未重启、补题、评分重试或现场修改实现。

启动前检查控制进程 KIMI_API_KEY 非空，仅记录布尔值；未打印、查找其他凭证或发送探测请求。激活签名、时间窗、空闲 run ID／输出路径、冻结 runner 干净状态、80 个安装文件、363 个 Harbor 文件、Python、全部任务文件及五个缓存镜像身份通过。模型报告身份为 kimi-code／k3-256k；high 与固定 endpoint／预算绑定于 activation，未改账户或充值。

预启动准备 **50.68479983299039 秒／1800 秒**，简单区间包含身份、缓存、Docker 可用性与资源检查及其间等待，没有重复控制题或安装依赖。CLI 全程 **1735.785645291995 秒**，于 UTC 2026-09-23 12:08:06.888063 退出，在本次签名窗口内；准确启动时间和单调时钟端点保存在 launch.json／exit.json。没有把运行耗时混入额外预启动排障额度。

activation SHA256 `84eebdbe8d5fc3fb9c94ea7dcfb82ce74f1d09349bec4da3031b54e47d9d6839`。新消费账本在原控制目录 `~/.local/state/pan-agent/wo75/ledger/5262035a-b2cf-48cc-ad75-50d06decf8b5.jsonl`；三份旧消费账本启动前后哈希未变，旧 authority 备份哈希符合激活。#83 历史记账例外未延用到 #84。

## 交接语义与问题记录

Nginx 官方 `test_nginx_running` 和访问／日志相关测试通过，说明本次真实服务到评分时仍可用；这是实际任务证据，不是合成控制。Nginx 与合并任务正常完成后进入 handoff 和独立 verifier。此轮**没有** Agent 时限、turn_limit 或工具预算耗尽终态，不能声称本次真实评测覆盖了这些软结束评分路径。

共 5 次工具等待 timeout：dna 第 6 次工具、merge 第 5 次、break-filter 第 3／7／27 次；均记录 host wait settled，不能据此说容器内任务进程已终止。前四次之后可见新的模型轮／dispatch 和后续工具；最后一次之后只有未预留 dispatch 的失败模型轮。这里只报告事件顺序；不把已预排的工具或后续成功都归因为超时反馈的收益。

三个未评分终态都保留原标签 `transport / kimi_transport_failure`，但根因未由记录直接揭示：

- overfull、dna 最后请求有 dispatch 预留但没有报告用量；可能的底层传输／截止原因无法从通用错误标签确定，不称已证实网络或额度故障。
- break-filter 最后第 28 个模型轮紧随工具 timeout，账本未增加第 28 次 dispatch，只有 unavailable usage 和失败终态。冻结控制层在预留前也有准入／payload 检查，而适配层会输出通用 transport 标签；证据支持“未进入新 dispatch 预留”，不足以确定具体触发检查。未为追根因重放请求或改变可观测性实现。

前两题失败后，后续题持续出现正常响应、工具执行及有效官方评分；没有识别到共享认证／额度／Docker 故障，因此按合同继续原 campaign，监督判断保存在 supervision.jsonl。三题失败／未评分完整留存，不用后两题成功冲销。

目标是取得真实结果并区分 Agent 停止原因与评分结果。Human 确定范围／预算，Master 发布签名授权，Builder 监督一次执行并复算记录；模型执行任务，上游官方测试给出分数。后续改进可针对通用 transport 标签与预留前失败的可区分性另立工单；本轮未擅自修实现，也不把 Agent 工作写成人类独立实现。

## 终态、资源与证据

五个 report 均 stopConfirmed=true，无 globalStops。退出后只读 inspect 逐一核对本轮确切容器 ID：全部 Running=false、Pid=0，未 OOM；仅按各自 project 标签核对网络列表为空，与 runner 的 network-release.json 一致。runner 已释放本轮网络；Builder 没有手工清理、删除旧容器／网络／镜像或全局 prune。本轮停止的容器仍保留。

354 个运行资源样本，最低空闲 **82822639616 字节**，按原 guard 算法最大记账增长 **705400832 字节**，在 60GiB／24GiB 边界内；只能说明采样观测，不宣称捕捉全部瞬时峰值。串行资源及敏感挂载／权限由原 broker 审计，最终 HostConfig 与启动记录一致。官方评分允许的联网依赖安装发生在原 verifier 时限内，没有预装新依赖或放宽时限。

活跃原件 `/private/tmp/wo84-live/`，归档 `/Volumes/WD_BLACK/pan-agent/wo84-post-handoff-20260923/`。包括签名／合同／身份、唯一启动记录、完整消费账本、五题原始事件及产物／日志、官方 reward／CTRF／stdout、资源采样、停止与网络释放、失败与未知项；原件仅本地保存。Git 只含本报告、[机器摘要](terminal-bench-post-handoff-84-summary.json)和目录导航。归档／逐文件索引哈希由摘要和 Handoff 绑定。

Builder 用原 ledger、事件归档、report、官方日志交叉复算；未再调用模型、官方任务或 verifier，也未重复无关回归。人类反馈、路径／整包检查结果见交付检查记录；原宿主 `.DS_Store`／`潘佳祥——agent简历.pdf` BLOCK 保留。根 SOURCE_OF_TRUTH 已导航 #84 正式合同，最终候选／Verdict 状态由 Master 更新。

独立 Regulator 需从远端完整候选 SHA 读取原始证据，离线复算并补必要负例，不能重跑模型／任务／评分。技术复核通过后，Human 一次确认这五行结果分类与边界。本报告不代替 Verdict 或该 Human 门禁。
