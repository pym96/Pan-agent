# Workspace Agent Harness

This context describes a local, general-purpose workspace agent and the evidence used to judge whether it completes bounded tasks reliably.

## Language

**Workspace Agent Harness**:
The only primary product: the runtime, controls, and evaluation system around a Local Workspace Agent.
_Avoid_: Autonomous Research Harness, research platform, coding-agent clone

**Local Workspace Agent**:
An agent that pursues a user goal by reading, searching, and modifying an isolated local workspace through allowlisted tools.
_Avoid_: Coding Agent, Data Analysis Agent, Research Agent

**Workspace Task**:
A versioned goal, fixture workspace, policy, budgets, and Deterministic Grader that together define one evaluable unit of work.
_Avoid_: Research Task, free-form prompt, benchmark question

**Task Run**:
One bounded execution of a Workspace Task that produces one structured Trace and exactly one terminal RunResult.
_Avoid_: Research Run, Experiment Attempt, chat session

**Evaluation Suite**:
The frozen set of 30 local Workspace Tasks used for v1 acceptance, with ten Markdown, ten CSV, and ten code tasks.
_Avoid_: Coding Benchmark, public leaderboard, cherry-picked demo set

**Deterministic Grader**:
The agent-immutable rule that converts the final workspace state into a reproducible task verdict and supporting measurements.
_Avoid_: model preference, subjective review, mutable evaluator

**Minimal ReAct Baseline**:
The comparison condition using the same model, tools, task, and budget without the full system's Skills/Workflow, recovery, and reliability mechanisms.
_Avoid_: weaker model baseline, strawman baseline

**Full Harness System**:
The comparison condition that adds Skills/Workflow, Trace, recovery, and reliability controls to the Minimal ReAct Baseline without changing model, tools, tasks, or budget.
_Avoid_: production system, best configuration

**Skill**:
A versioned instruction package that teaches the Local Workspace Agent how to perform a reusable class of workspace work.
_Avoid_: prompt snippet, hidden behavior

**Workflow**:
An explicit composition of Skills, tool permissions, state transitions, and stopping rules for a class of Workspace Tasks.
_Avoid_: vibe-coding session, implicit plan

**Product Reference**:
An external product studied to organize user-facing capabilities without serving as a scored comparison target.
_Avoid_: benchmark, competitor score

**External Benchmark**:
A separately versioned public task and evaluation framework used only after v1 to establish external comparability.
_Avoid_: product blueprint, official exam

**Protected Control Plane**:
The Harness, graders, task fixtures, budgets, credentials, policies, and launch rules that the Local Workspace Agent cannot modify.
_Avoid_: working files, agent context

**Policy Blocked**:
The terminal status for an action that exceeds the Workspace Task's declared file, command, or resource authority.
_Avoid_: crash, approval queue

**Learning Wiki**:
A versioned Markdown record of sources, concepts, experiments, failures, decisions, and unresolved questions produced while building the project.
_Avoid_: product feature, benchmark, desktop knowledge app
