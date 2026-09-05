# General + Vertical Agent System | TypeScript/Pi authoritative product glossary

This context defines the project-specific product and retained experiment language. Process governance, learning records, and verified implementation state live in the documents linked from `AGENTS.md`, not in this domain glossary.

## Active product language | authoritative TypeScript/Pi

**Workspace Agent Harness**:
The Human-operated TypeScript/Pi product: one `GeneralAgentSession`, its Provider Adapter, typed trusted-local tools, TUI, attributable outcomes, and three memory lanes. Retained reference and experiment code lives in the same repository but is not part of this product boundary.
_Avoid_: Python runtime synonym, ReAct experiment, benchmark machinery, Learning Wiki, development-agent workflow

**GeneralAgentSession**:
The deep TypeScript product Module that owns Pi's Agent loop and Context, one task at a time, while hiding event reduction, ToolCall correlation, cancellation, accounting, terminal classification, and durable archive writes behind `runTask(...)`.
_Avoid_: copied AgentLoop, Provider SDK wrapper, one-shot prompt helper, whole repository

**Context**:
Pi-owned message history retained across tasks in one Human session. The application performs no arbitrary slicing or truncation; window management beyond this current behavior remains an explicit product limit.
_Avoid_: Run Archive, shell output alone, hidden Provider state, reference-runtime projection policy

**Trusted-local tool**:
A read/write/edit/bash capability executed with the current host user's authority. The selected workspace supplies the default cwd but is not filesystem, process, or network containment.
_Avoid_: sandboxed tool, workspace-confined tool, least-privilege executor

**Attributable terminal**:
Exactly one product outcome for an admitted task — `completed`, `cancelled`, `model_error`, or `incomplete` — with correlated observations and archived identity/accounting.
_Avoid_: evaluator verdict, benchmark score, unqualified success message

## Historical experiment and evaluation language

**AgentLoop**:
The retained Python experiment/reference Module behind `AgentLoop.run(Task, RunLimits) -> RunResult`; it is not the authoritative product loop, and its implementation status belongs in the verified-project-fact register.
_Avoid_: `GeneralAgentSession`, current product Runtime, complete Harness

**General Agent Runtime**:
The historical domain-neutral experiment architecture that owns Run lifecycle, model/tool execution, state, budgets, policy enforcement, Trace, recovery, and exactly one terminal RunResult.
_Avoid_: authoritative TypeScript product, general prompt, universal chatbot, DeerFlow clone

**Vertical Domain Pack**:
A versioned package that supplies domain task contracts, guidance/skills, requested tools and policy defaults, fixtures, and a Domain Evaluator through a stable Runtime seam.
_Avoid_: separate Agent Runtime, copied application, prompt-only persona

**Domain Pack Interface**:
Everything Runtime and pack authors must know to install, validate, select, execute, identify, and evaluate a pack, including invariants, error modes, version/hash, authority rules, and ordering.
_Avoid_: folder convention without behavioral contract

**Domain Evaluator**:
An agent-immutable evaluator owned by a Vertical Domain Pack that judges domain success from final artifacts and evidence without changing Runtime lifecycle semantics.
_Avoid_: model self-rating, generic success message, Acceptance Gate

**Generality Proof**:
Evidence that two materially different Vertical Domain Packs execute through the same Runtime Interface without Runtime source edits, while preserving Runtime invariants and producing domain-specific verdicts.
_Avoid_: a general-purpose system prompt, one demo, many tools

## Memory lanes

**Run Archive**:
The raw-trajectory memory lane owned by the session runtime: one append-only, hash-chained record sequence per run, sealed at settlement and read-only afterwards through application interfaces, with integrity metadata that reveals byte-level tampering; credentials are never stored and restricted fields never enter normal projections. Mutation rule: append-only while active, sealed read-only after settlement.
_Avoid_: Retrospective Ledger synonym, Runbook synonym, editable log, verified fact register

**Retrospective Ledger**:
The post-run interpretation memory lane owned by the operator review process: conclusions and corrections that reference a sealed Run Archive identity and integrity hash, stored append-only; a correction is a new entry with an explicit `supersedes` reference and never edits or deletes earlier cognition. A retrospective entry is not raw trajectory and is not automatically a Verified Project Fact.
_Avoid_: Run Archive synonym, Runbook synonym, auto-promoted fact, mutable notes

**Runbook**:
The current-guidance memory lane owned by the Human operator: current best operating instructions, intentionally mutable through ordinary version-controlled edits, diffs, and reverts; every Run Archive records the exact Runbook content-hash revision in force at run creation, and neither runs nor retrospectives mutate it implicitly.
_Avoid_: Run Archive synonym, Retrospective Ledger synonym, immutable specification

## Historical Local Workspace language

**Local Workspace Agent**:
The superseded v1 product and a candidate source of tasks for the workspace-coding proof domain.
_Avoid_: the only target product, proof of generality

**Workspace Task**:
A versioned goal, fixture workspace, policy, budgets, and Deterministic Grader that together defined one evaluable unit of Local Workspace work.
_Avoid_: Research Task, free-form prompt, current cross-domain task contract

**Task Run**:
One bounded execution of a Workspace Task that produced one structured Trace and exactly one terminal RunResult.
_Avoid_: Research Run, Experiment Attempt, chat session

**Evaluation Suite**:
The superseded proposal for 30 local Workspace Tasks, retained only as a historical baseline until the General Runtime and per-domain evaluation design is accepted.
_Avoid_: current implementation plan, public leaderboard, proof of generality

**Deterministic Grader**:
The historical Local Workspace name for an agent-immutable rule that converted final workspace state into a reproducible verdict; new domain designs use Domain Evaluator.
_Avoid_: second active evaluator term, model preference, subjective review

**Minimal ReAct Baseline**:
The historical comparison condition using the same model, tools, task, and budget without the proposed system's Skills/Workflow, recovery, and reliability mechanisms.
_Avoid_: weaker model baseline, strawman baseline

**Full Harness System**:
The historical comparison condition that added Skills/Workflow, Trace, recovery, and reliability controls to the Minimal ReAct Baseline without changing model, tools, tasks, or budget.
_Avoid_: current Workspace Agent Harness definition, production system

**Protected Control Plane**:
The historical name for Harness-owned graders, fixtures, budgets, credentials, policies, and launch rules that the Local Workspace Agent could not modify.
_Avoid_: working files, agent context, current accepted policy design

**Policy Blocked**:
The proposed historical terminal status for an action outside a Workspace Task's declared file, command, or resource authority.
_Avoid_: implemented terminal status, crash, approval queue
