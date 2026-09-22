# Criteria1.1 continuation

Current contract: [Master Criteria1.1 ruling](https://github.com/pym96/Pan-agent/issues/75#issuecomment-5775497812), together with full 1.0.
The original delivery below remains historical evidence. SC-TBP-75-01 is resolved only for the pinned original visible test; it is no longer a permanent CLI blocker. Actual images remain unverified, activation stays unauthorized by default, and independent C-TBP-03 review remains pending.

New evidence is under `/Volumes/WD_BLACK/pan-agent/wo75-terminal-bench-20260922/criteria11/`, indexed by hashes and a new full-SHA Handoff. The original Handoff/index and all previous ledgers are preserved.
C-TBP-05 tests traverse the actual CLI orchestration, real signature/identity/package checks and durable ledger into explicitly injected fake environments and installed Pan/real Adapter/fake SSE. Five original tasks retain order; visible test invocation precedes controller verifier and does not itself create a score. Missing/false/bad-signature/expired/mismatched/over-budget/unresolved-image activation has zero credential, dispatch or environment effects. Successful synthetic execution checks secret/private-reasoning archives and same-run restart refusal. The source exception rejects repo/path/commit/blob changes. No real credential, Provider, image or container operations occur.

Manifest changes only add the single-task visibility record; source files, configurations, population, selected order and official grading remain byte-identical to the old manifest after removing that annotation. New manifest hash and check results are in the external index. Only affected offline checks run; previous unaffected evidence remains available to the independent Regulator.

---

# #75 离线运行准备 Evidence｜Criteria1.0

Builder 候选，非 accepted、非真实成绩。基线 `d1bc6c3938cd68b151b653178d977557a8921a0b`；
[合同](https://github.com/pym96/Pan-agent/issues/75#issuecomment-5774791581)、
[设计 / live 提案 / SC-TBP-75-01](../design/terminal-bench-pilot-75.md)、
[复跑命令](../../scripts/harbor/pilot/README.md)。完整候选 SHA 在外部 Handoff 绑定，避免自引用。

## 原始证据

外部根：`/Volumes/WD_BLACK/pan-agent/wo75-terminal-bench-20260922/`。
`evidence-index.json` 逐文件 SHA256；`Handoff.md` 绑定提交及该索引哈希。活跃工作 `/private/tmp/wo75-work`。

- `source/`：原始 registry、完整 terminal-bench@2.0 条目、固定任务 Git tree、仅四类公开集成源文件。
- `package/`：基线 npm 包、pack/install 输出、安装文件验证收据；包哈希 `e7da84c88b4eadb1395914720b85514d54cfdb52a93a2b87bd3c8b0baf8c7ecb`。
- `checks/`：Node/Python 原始测试输出、两份重建 manifest、dry-run 和资源收据；Session trace/账本/报告、请求中 user 指令及效果计数保存在 `session-artifacts/`。
- `prior-failures/`：最初模拟 SSE 缺字段引起的失败原始输出。随后还发现 JSON 克隆破坏 Adapter 私有连续性，现保留原对象；两者均已修复，没有触发真实调用。
- `host-checks/`：精确候选 SHA 的隔离路径/整包检查、原宿主 BLOCK 分列；检查器未改写。
- `contract/`：本轮已发布完整合同快照；原 #74 失败材料和累计资源账本未修改。

## Builder 检查结果（不是 Verdict）

| Criterion | 已取得的离线证据 | 限制 / 后续责任 |
|---|---|---|
| C-TBP-01 | 89 题总体、重复 ID 负例；两次重建与候选 manifest 字节相同；5 题源及配置、未验证镜像明确记录 | 独立 Regulator 重建；镜像 digest/架构未知，不据此删题 |
| C-TBP-02 | 安装包真实 GeneralAgentSession + PanKimiModelAdapter + KimiFetchTransport；两种指令、wire 产生的不同命令；非零退出回传、结束后 verifier；超时/取消；Python fake BaseEnvironment | 未运行真实容器/任务；复用 #74 已接受的路由及停止机制 |
| C-TBP-03 | 缺失/过期/篡改授权、冻结身份/预算、并发独占与中断重启、20/100/40 上限；缺 usage、响应/请求越界、限流、dispatch 截止；子进程 env/argv/IPC 和实际 archive 合成 canary 检查 | 仅 Builder 自测；新候选的独立技术检查及有限 Human 两项明确 pass（或不同模型家族）尚未完成 |
| C-TBP-04 | 默认未授权；dry-run 零密钥/Provider/Docker；五行 fixture 保留正常 1、正常 0、评分异常、额度停止、未开始；非数值/空 reward 为错误 | SC-TBP-75-01 需 Master 裁定，live 入口继续硬拒绝 |

测试集包括 16 项 Node 测试和 5 项 Python 测试。低额度测试不代替精确 20 次真实 Adapter dispatch 与 100 次 durable reservation 边界检查；两者均有各自测试。
usage 数值来自合成 wire，仅用于路径验证；没有真实用量或分数。生成的随机秘密及原始 reasoning 未写入 trace/报告/IPC，fixture 本身不包含真实秘密。
资源采样保存在 checks 收据，始终低于新增 24GiB、宿主剩余 60GiB 界限；本轮没有任务镜像操作或数据/权重下载。

#74 已接受 Verdict：`/Volumes/WD_BLACK/pan-agent/wo74-harbor-20260922/criteria13/regulator-20260922/final/Verdict.md`，
SHA256 `78a5b7acf94b7daec6670c2373c2ac8a851fc1ee671890a8f1a02b368b09d6c6`。
本轮没有复跑已消费的 #74 容器控制，也没有改写旧失败/identity 文件、官方 tests/scoring、Pan 核心、#69/70 消费账本或 #73 产物。
历史 82/259 回归与已记录失败保持原记录，本轮运行受影响离线检查，未重复整套历史模型/容器路径。
原宿主 `.DS_Store` 与 `潘佳祥——agent简历.pdf` 的 BLOCK 单列保留；隔离副本结果不能解释为原宿主 PASS。

Builder 在推送完整 SHA Handoff 后停止；由独立 Regulator 在干净 worktree 读取远端同 SHA、复跑离线检查并补充负例。
SC-TBP-75-01 不能由 Builder 或合成 activation 批准；不修改 main、不公布 accepted、不登记简历成果。
