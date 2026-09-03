# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <path>`.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

## Authority and WorkOrders

- Any role may submit an Issue Candidate. Only the human or `Master Agent` may triage it into the global queue or promote it to an executable WorkOrder.
- A GitHub issue labelled `ready-for-agent` is the durable WorkOrder. It must name a `Target Role` compatible with the human-assigned immutable `SessionRole`; the issue never grants or changes that role.
- A WorkOrder contains only the task contract: Outcome link, objective, inputs/Evidence, deliverables, predeclared Criteria, budget, allowed write scope, non-goals, dependencies, risks, and required human authorization.
- **Criteria Contract.** Blocking Acceptance Criteria inside a WorkOrder follow the operational contract in [`../governance/verification.md`](../governance/verification.md): before promotion to `ready-for-agent`, every blocking Criterion has a unique Criterion ID, a Criteria-Version, a GateLevel, `Given / Observe / Pass iff / Fail when`, and an oracle type; qualitative exploratory prose is non-blocking. Master performs the manual **Criteria Lint v1** check at promotion and records it in the promotion comment. Criteria then freeze append-only under their Criteria-Version; amendments create a new Criteria-Version that applies prospectively and never reopen accepted historical WorkOrders.
- Builder Handoffs and Regulator Verdicts name the Criteria-Version they bind, so both sides evaluate the same frozen predicates. A rejection maps each blocker to a Criterion ID, probe input, observed value, expected predicate, and Evidence locator, and distinguishes `criterion_failed` from `evidence_incomplete`.
- A specialist controls implementation choices inside that contract. It may post a `ScopeChallenge`, but must not switch work until Master amends, pauses, or replaces the WorkOrder.
- Builder Handoffs and Regulator Verdicts stay on the same issue so scope, Evidence, rejection, repair, and closure remain one trace. A distinct newly discovered problem starts as a linked Issue Candidate rather than silently expanding scope.

## Immutable candidate workflow

1. The WorkOrder names the accepted `main` base SHA. Builder creates `workorder/<issue>-candidate`, commits and pushes the candidate there, and never pushes `main`.
2. Handoff records the branch, base SHA, full candidate SHA, Criteria-Version, exact changed-file list, Evidence, checks, and limitations. The SHA is immutable; later repair is an additional commit and a new Handoff.
3. From Handoff until Verdict, Master freezes `main` integration. Other work may remain on branches but cannot land.
4. Regulator fetches the remote candidate and verifies that exact SHA in a clean worktree. Its probes stay outside the candidate. Verdict is `accepted | rejected`, names the Criteria-Version, and binds only that SHA.
5. Rejected work returns to Builder on the same candidate branch. Accepted work is integrated by Master with a fast-forward of the same SHA; there is no landing-only WorkOrder and Builder is not recalled.
6. If `main` drift prevents a fast-forward, do not rebase, cherry-pick, merge, or transfer the Verdict. Produce and independently verify a new candidate SHA.

Candidate branches and accepted Verdicts do not themselves promote project facts or authorize paid execution. A paid WorkOrder still binds its final accepted `main` SHA, frozen runtime identities, and Human-approved budget.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Skill vocabulary

- When a skill says **publish to the issue tracker**, create a GitHub issue.
- When a skill says **fetch the relevant ticket**, run `gh issue view <number> --comments`.
