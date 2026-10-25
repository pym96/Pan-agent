# Sandbox #148 candidate evidence

Criterion version SB1.0. Builder evidence is not an acceptance Verdict. All model interactions in this work are deterministic Faux; no provider call, GPU workload or public release.

The final inventory and reproduction receipt accompany Handoff. Tests live in `typescript/scripts/sandbox/`; each server probe uses the bounded watchdog, fresh evidence root and exact source-file manifest. The host preflight/image/profile are retained with execution receipts.

## Retained failures and changed understanding

1. Initial numeric UID 1000 could not be resolved by Docker `cp -a` in the pinned image. No task ran. The owned container was stopped and its volume retained; configuration changed to the existing non-root `nobody` UID/GID 65534 after Master ruling. This is an image identity compatibility issue, not evidence that root execution is necessary.
2. Reusing the trusted-local tool factory merely for schemas unexpectedly tried to anchor `/workspace/task` on the host. It failed before task execution. Schema-only definitions now exclude executors and host anchoring; actual CLI/tool routing is tested with the native kernel and Faux model.
3. Intermediate crash tests covered running, tracked-command and archive-rename checkpoints but missed earlier creation gaps. Independent Regulator identified these omissions. Real SIGKILL probes confirmed an empty volume with no export container, and an orphan verifier after retry. Complete verifier intents and a never-started read-only recovery reader address these two cases. A separate SIGKILL after reader creation but before ID persistence tests the repair itself. Original red source/receipts remain separate from green runs.
4. Baseline tests derive some paths through URL.pathname and fail in a checkout whose parent contains Chinese characters. The unchanged baseline reproduces it; the complete regression is run in a clean ASCII Git clone (not a copied tree missing fixtures/history). This unrelated baseline defect is not silently fixed.

Human chose the product direction and safety budget; Master defined scope and resource rulings; Builder implemented and ran the candidate probes; independent Regulator supplied the two recovery counterexamples. No candidate result is registered as a verified project/resume fact here.

## Frozen execution identity and checks

[summary.json](summary.json) maps each criterion to raw artifacts and records the raw inventory hash. [product-files.json](product-files.json) lists every product source byte identity.

- Product/package/full regression: `056e7f8b35ce410fba1a61d17f3fcd7248ad4bbe`.
- Stronger resource-access assertions and simulated missing-controller preflight: `25378697b20a02f2cc3ffa933fb4f4c55ea7121b`. This changes two probe scripts only; product bytes and package remain unchanged.
- Final Handoff adds this evidence index only. Each of the nine final real Docker source snapshots was compared against every product source hash: zero mismatches.
- Clean ASCII Git clone: typecheck plus all 234 tests pass, no skips. Candidate package installs with no lifecycle scripts/dev dependencies. Actual installed CLI PTY opens in Docker mode without submitting a task; an independent installed-package Faux driver exercises native dispatch, six actual tools including denied host reads, verifier, export and cleanup.
- The seeded exporter defect (ignoring unsafe tar types) fails the required negative test; pristine source passes all four focused unit tests. This mutant exists only in the external raw evidence bundle.
- Unsupported-controller rejection uses a clearly labelled Docker CLI fixture; real supported controller enforcement is measured in server cgroups. No daemon configuration is changed to simulate missing controllers.

## Reproduce

Use a clean ASCII-path Git checkout of the Handoff SHA. Run `npm --prefix typescript ci --ignore-scripts`, `npm --prefix typescript run check`, then `npm pack` from `typescript`. The public README contains install and ordinary TUI/lifecycle commands.

For explicitly authorized CPU Docker probes, from the repository root, select a **new** evidence directory for each invocation:

```sh
python3 typescript/scripts/sandbox/watchdog.py --root "$PWD/probe-demo" \
  node --experimental-strip-types typescript/scripts/sandbox/demo.ts "$PWD/probe-demo"
```

Substitute `probes.ts`, `resources.ts`, `export-probes.ts`, `crash-probes.ts`, `gap-probes.ts` or `reader-crash.ts` and a new directory. Run sequentially; the boundary probe deliberately uses two containers. The watcher freezes source hashes before invoking the probe, enforces a 105-second child deadline and stops only exact token/run-labelled resources; it preserves volumes. Real probe receipts are each below 120 seconds. These harness scripts are not installed product commands and use deterministic scripted model output, not live inference.

`unavailable.ts` validates the actual public CLI with Docker absent and a host sentinel; `unsupported.ts` validates no-create rejection with a simulated missing PID controller. Neither launches Docker. The installed-package driver is a transpilation of `demo.ts` with imports redirected to installed `dist` bytes; its exact source and hashes accompany the package in raw evidence.

## Remaining resources and disposal boundary

No owned container is running. Thirteen volumes are retained from failed setup, original red crash cases and intentionally unsafe export fixtures. `server/resource-inventory.json` contains every state path, volume, container ID, exact ownership labels, phase, recent events and recorded error. Do not broadly prune them.

For intact safe artifacts, use the documented `recover → export → cleanup` route with the matching profile/source identity. Unsafe-export cases intentionally cannot satisfy archive prerequisites: retain them for review. If the Human later chooses to discard these synthetic fixtures, first compare each exact ID/name and both labels with its recorded state, confirm stopped, then remove only those named containers and that single volume. This destructive discard is not executed by the candidate. The first numeric-UID failure belongs to its preserved original source/profile; current code deliberately rejects that mismatched policy hash. No unrelated containers, volumes or images were removed.

## Presentation/test harness corrections retained

The first actual startup capture failed because its fixture workspace had not been created; after creating it, the ordinary TUI displayed `DOCKER SANDBOX`. A case-sensitive capture assertion initially looked for mixed-case `Docker`; the existing uppercase raw capture was rechecked without another task/model call. These are fixture/assertion corrections, not product failures or evidence of live task success. The raw capture, first failed output and scripts remain in the artifact inventory.
