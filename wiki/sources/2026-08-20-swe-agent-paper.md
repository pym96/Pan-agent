# SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://arxiv.org/abs/2405.15793> (v3, NeurIPS 2024; Yang, Jimenez, Wettig, Lieret, Yao, Narasimhan, Press — Princeton; local copy at `30-已有资产与参考/reference_paper/SWE.pdf`, main body read 2026-08-20)
- Updated: 2026-08-20

## Verified facts

- The paper introduces the agent-computer interface (ACI): it posits that LM agents are a new category of end user with their own needs and abilities, and — analogously to HCI for humans — benefit from interfaces built specifically for them rather than human-oriented interfaces like the raw Linux shell.
- The design methodology fixes the LM and shapes only the interface: manual inspection of agent behavior on a development set plus grid search over configurations. Four stated design principles: (1) actions should be simple and easy to understand for agents; (2) actions should be compact and efficient, consolidating high-level operations into single steps; (3) environment feedback should be informative but concise; (4) guardrails should mitigate error propagation and hasten recovery.
- The SWE-agent ACI comprises: summarized search commands (`find_file`, `search_file`, `search_dir`) capped at 50 results with a refine-the-query hint; an interactive file viewer showing a window of at most 100 lines with line numbers and omitted-line counts; an `edit` command that replaces a line range and immediately re-displays the updated content, with an integrated linter that discards invalid edits and shows an error snippet; and context management that generates a thought plus an action each step (citing ReAct), collapses older observations to single lines, and emits an explicit "ran successfully and did not produce any output" message.
- Results: SWE-agent with GPT-4 Turbo resolves 12.47% of the full SWE-bench test set (286/2294) versus 3.8% for the best prior non-interactive retrieval baseline; on SWE-bench Lite it resolves 18.00% versus 11.00% for a shell-only agent (a 64% relative increase attributed to the ACI); on HumanEvalFix it reaches 87.7/89.7/87.9 pass@1 (Python/JS/Java). The ACI ports to Claude 3 Opus (10.46% full, 13.00% Lite).
- Ablations on SWE-bench Lite (percent resolved): summarized search 18.0 vs iterative next/prev search 12.0 vs no search tools 15.7 (iterative search exhausts the budget paging through results); edit with linting 18.0 vs without linting 15.0 vs no edit command 10.3; file-viewer window of 100 lines 18.0 vs 30 lines 14.3 vs full file 12.7; last-5-observations context 18.0 vs full history 15.0; with demonstration 18.0 vs without 16.3.
- Behavioral findings: successful trajectories begin with reproduction code or localization, then settle into edit-then-execute loops; 51.7% of GPT-4 Turbo trajectories contain at least one failed edit, and the probability of eventual recovery drops from 90.5% to 57.2% after a single failed edit; agents "succeed quickly and fail slowly" (solved runs: median 12 steps / $1.21; unsolved: 21 steps / $2.52; 93% of resolved instances submit before exhausting the $4 budget), leading the authors to suspect larger budgets would not help much; 52.0% of unresolved Lite instances are classified as incorrect or overly specific implementations and 23.4% as cascading failed edits.

## Boundaries

- Results are from GPT-4 Turbo (1106-preview) and Claude 3 Opus (20240229) on the 2024 SWE-bench snapshot with a $4 per-instance budget; absolute numbers are not current-state-of-the-art claims.
- The paper itself notes non-trivial per-instance performance variance across runs.
- The ACI principles were derived on software-engineering tasks; the paper does not claim they transfer unchanged to other domains.
- All figures are the paper's own measurements, not independently reproduced here.

## Links

- [Harness Engineering fact](../concepts/harness-engineering.md)
- [ReAct paper](2026-08-20-react-paper.md)
- [PinchBench v2.0.0 task and runner mechanics](2026-08-18-pinchbench-v2.md)
- [Composio 30-task agent comparison methodology](2026-08-18-composio-agent-benchmark-thread.md)
