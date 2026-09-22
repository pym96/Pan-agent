# Terminal-Bench recovery #78 — candidate design

Criteria1.0. Builder scope: evaluation adapter only; no Product core changes, live calls, credential reads or formal scoring. [Contract](https://github.com/pym96/Pan-agent/issues/78#issuecomment-5779207476). [Evidence and unresolved scope](../evidence/terminal-bench-recovery-78.md).

## Failure and lifecycle

The old broker starts a new Compose project for each task and stops its container without releasing its network. On the current host all automatic Docker bridge address pools are allocated. The unchanged broker reproduces `compose up` return code 1 / `all predefined address pools have been fully subnetted` on all five frozen tasks. This is a current reproducible cause; #77 discarded stderr prevents claiming a uniquely proven historical cause.

The candidate retains the same source, image, Harbor, mount, CPU/memory, task instruction and command execution path. It adds explicit source-validation / daemon-connection / Compose-create / inspect-audit / ready stages. Daemon admission requires Linux output as well as command completion; a deliberately unavailable socket demonstrated that formatted `docker info` can return empty output without a useful nonzero code.

After the exact project container is confirmed stopped and its stop record written, the broker enumerates only networks labelled with its newly generated project ID, checks that each is owned and has no active endpoints, writes the network identity/IPAM receipt, and removes only that network ID. It preserves the stopped container, images, task data and old projects. Ownership mismatch, live endpoints or failed removal are failures, not ignored cleanup. No prune, subnet allocation override, host network, or daemon setting changes are used. This prevents new network accumulation; it cannot free address pools already occupied by old work without explicit additional authorization.

## Diagnostics and secrecy

`diagnostics.py` projects exception chains to allowlisted type, category and parsed return code, at most eight causes and the first 65,536 characters of each message. Arbitrary command/exception text is suppressed. `broker.mjs` retains at most 65,536 stderr bytes in memory, records the observed byte count and truncation flag, and persists only recognized categories. Unknown text is explicitly classified as unclassified rather than copied. Host environment values and provider secrets are never read for redaction. Public task IDs and trusted local evidence paths originate in the controller configuration. This deliberately sacrifices unknown-error text in favor of secret-safe evidence; unknown categories require a later scoped classifier/diagnostic probe.

Diagnostic frames carry only stage, generated project ID and allowlisted reason. Parent failures carry an evidence path and process exit code/signal. `failure.json` preserves the projected cause chain; `broker-diagnostic.json` preserves the parent projection. Files are overwritten with bounded structured state, not appended with raw stderr. Incoming JSON-line stdout has a 1 MiB buffered-frame ceiling; oversized protocol output fails and terminates the child. Existing Harbor internals still construct their own command output; these bounds describe the added diagnostic capture, not a global memory quota.

Child environment stays allowlisted (PATH, isolated HOME/DOCKER_CONFIG, fixed controller Docker socket, no bytecode). Only the original bound command capability executes task commands. Diagnostic text never changes endpoint, budget, authority, command or destination.

## Candidate budgets and tool contract

`LIMITS` caps per-task dispatches/model turns at 40, campaign dispatches at 200, and per-task executed tools at 80. The existing signed budget supplies both durable ledger limits and Session `maxModelTurns` / `maxToolSteps`; lower signed values continue to work. Max tokens 4096, dispatch deadline 120 seconds, payload sizes, official task/verifier deadlines and resource boundaries stay unchanged. An old authority/activation cannot authorize a changed runner SHA. Used IDs stay exclusively reserved, and failures do not refund reservations.

The tool schema and description now declare `0 < timeout <= 30` seconds. Invalid arguments return that range to the model. Timeout 60/120 is rejected before an execution reservation; values are never silently clamped. Core remains unchanged.

[Unsigned proposal](../../scripts/harbor/pilot/recovery-78-proposal.json) is `authorized:false`, empty signature, null run/authorization/runner IDs. Frozen old templates and real authority/activation/ledger are not edited. No live budget is granted by this engineering ceiling, including after code review. New live execution requires accepted identity and a separate Human/Master authorization.

## Reproduction and validation

Run the affected offline suite with a controller environment containing only PATH/HOME/TMPDIR, and `WO75_TEST_ROOT` pointing to the new diagnostic directory:

```sh
node --test scripts/harbor/pilot/test_policy.mjs scripts/harbor/pilot/test_session.mjs scripts/harbor/pilot/test_broker.mjs scripts/harbor/pilot/test_cli.mjs scripts/harbor/pilot/test_recovery.mjs
PYTHONDONTWRITEBYTECODE=1 /private/tmp/wo74-work/venv/bin/python -m unittest discover -s scripts/harbor/pilot -p 'test_*.py' -v
```

The exact no-model five-task sequence scripts, allowlisted process wrapper, command/time ledger and five-second resource samples are in the external evidence archive. Those scripts import the broker directly; they do not call the live CLI, Session, provider or verifier. Fake-transport Session tests are separate from real-container diagnostics. Any further actual diagnostic sequence must remain inside the applicable role's cumulative time/resource budget and explicit network cleanup scope.
