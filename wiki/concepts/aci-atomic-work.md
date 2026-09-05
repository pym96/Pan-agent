# ACI as atomic work design

- Type: verified-learning-fact
- Verification: source-located
- Source: SWE-agent repository at tag `v0.6.1` (files fetched 2026-08-29 via raw.githubusercontent.com: `config/commands/search.sh`, `config/commands/defaults.sh`, `config/commands/edit_linting.sh`, `sweagent/agent/history_processors.py`); [SWE-agent paper page](../sources/2026-08-20-swe-agent-paper.md) for the ablation numbers
- Updated: 2026-08-29

## Verified facts

The SWE-agent ACI is implemented as four concrete mechanism layers, each inspectable at the locators above:

1. **Action-space design** — `search.sh` implements semantic shell functions instead of raw grep: `search_dir()` refuses to return results when more than 100 files match ("Please narrow your search") and `search_file()` caps output, consolidating a whole find|grep|cut|sort pipeline into one call.
2. **Feedback engineering** — `defaults.sh`'s `_print()` never returns a full file: it prints only the current `WINDOW` slice (100 lines in the paper configuration) with line numbers and "(N more lines above/below)" markers, so the model always knows where it is.
3. **Interface guardrail** — `edit_linting.sh`'s `edit()` backs up the file, applies the line-range replacement, runs `flake8 --isolated --select=F821,F822,F831,E111,E112,E113,E999,E902`, and the docstring states a syntax-failing edit "will not be executed": invalid edits never land.
4. **Context management** — `history_processors.py`'s `last_n_history(history, n)` keeps the first observation and the last n observations in full and replaces everything between with `Old output omitted (N lines)`.

The paper's ablations bound the legal granularity of an action atom from both directions: next/prev paging (too fine — budget burns on navigation) scores 12.0 and full-file return (too coarse — information floods) scores 12.7, versus 18.0 for the bounded window, on SWE-bench Lite.

Synthesis adopted by this Wiki from the 2026-08-29 session: an ACI is the design of **atomic work units sized to the model's decision budget** — one decision point, bounded output of known size, an attributable failure mode — and abstract principles only become reliable when compiled into deterministic mechanisms (a shell function, a linter gate, a history filter) rather than left as advice in a prompt.

## Boundaries

- Code claims cover tag `v0.6.1` only; current SWE-agent versions may have restructured these mechanisms.
- The four-layer decomposition and the "atomic work" formulation are this Wiki's synthesis of the paper plus the code, not quoted results.
- The cross-layer resonance (MCP tool vocabularies, sprint contracts, frozen slots as measurement-level atoms) is analogy, not evidence.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [SWE-agent paper](../sources/2026-08-20-swe-agent-paper.md) — the four ACI principles and the ablation table.
- [Canonical conversation](canonical-conversation.md) — the state layer below ACI; ACI is the action/observation design above the encoding seam.
- [Signal–decision separation](signal-decision-separation.md) — the edit-lint gate is M2 sunk into the interface layer.
- [Honest capability degradation and the three-gate model](honest-degradation-three-gates.md) — advice-vs-mechanism maps onto label-vs-gate.
