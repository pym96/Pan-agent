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
- A specialist controls implementation choices inside that contract. It may post a `ScopeChallenge`, but must not switch work until Master amends, pauses, or replaces the WorkOrder.
- Builder Handoffs and Regulator Verdicts stay on the same issue so scope, Evidence, rejection, repair, and closure remain one trace. A distinct newly discovered problem starts as a linked Issue Candidate rather than silently expanding scope.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Skill vocabulary

- When a skill says **publish to the issue tracker**, create a GitHub issue.
- When a skill says **fetch the relevant ticket**, run `gh issue view <number> --comments`.
