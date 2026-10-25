# Sandbox #148 candidate evidence

Criterion version SB1.0. Builder evidence is not an acceptance Verdict. All model interactions in this work are deterministic Faux; no provider call, GPU workload or public release.

The final inventory and reproduction receipt accompany Handoff. Tests live in `typescript/scripts/sandbox/`; each server probe uses the bounded watchdog, fresh evidence root and exact source-file manifest. The host preflight/image/profile are retained with execution receipts.

## Retained failures and changed understanding

1. Initial numeric UID 1000 could not be resolved by Docker `cp -a` in the pinned image. No task ran. The owned container was stopped and its volume retained; configuration changed to the existing non-root `nobody` UID/GID 65534 after Master ruling. This is an image identity compatibility issue, not evidence that root execution is necessary.
2. Reusing the trusted-local tool factory merely for schemas unexpectedly tried to anchor `/workspace/task` on the host. It failed before task execution. Schema-only definitions now exclude executors and host anchoring; actual CLI/tool routing is tested with the native kernel and Faux model.
3. Intermediate crash tests covered running, tracked-command and archive-rename checkpoints but missed earlier creation gaps. Independent Regulator identified these omissions. Real SIGKILL probes confirmed an empty volume with no export container, and an orphan verifier after retry. Complete verifier intents and a never-started read-only recovery reader address these two cases. A separate SIGKILL after reader creation but before ID persistence tests the repair itself. Original red source/receipts remain separate from green runs.
4. Baseline tests derive some paths through URL.pathname and fail in a checkout whose parent contains Chinese characters. The unchanged baseline reproduces it; the complete regression is run in a clean ASCII Git clone (not a copied tree missing fixtures/history). This unrelated baseline defect is not silently fixed.

Human chose the product direction and safety budget; Master defined scope and resource rulings; Builder implemented and ran the candidate probes; independent Regulator supplied the two recovery counterexamples. No candidate result is registered as a verified project/resume fact here.
