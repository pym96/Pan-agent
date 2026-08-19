# General + Vertical Agent System

This context defines the project-specific language for separating a reusable execution core from domain-owned behavior. Process governance, learning records, and verified implementation state live in the documents linked from `AGENTS.md`, not in this domain glossary.

## Active product language

**Workspace Agent Harness**:
The complete project and product boundary: the General Agent Runtime, Vertical Domain Packs, tool and policy surfaces, evaluation, and CLI/release surfaces.
_Avoid_: implemented full system, Runtime synonym, Learning Wiki, development-agent workflow

**AgentLoop**:
The smallest execution Module behind `AgentLoop.run(Task, RunLimits) -> RunResult`; implementation status belongs in the verified-project-fact register.
_Avoid_: General Agent Runtime, ReAct framework, complete Harness

**General Agent Runtime**:
The domain-neutral execution Module that owns Run lifecycle, model/tool execution, state, budgets, policy enforcement, Trace, recovery, and exactly one terminal RunResult.
_Avoid_: general prompt, guidance file, universal chatbot, DeerFlow clone

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
