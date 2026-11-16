# Use Sandbox, Loop and Goal

These commands are included in the prebuilt **v0.1.9** release. Follow the [installation and API setup](../../../README.md#install); no Git checkout, compiler, Python or Docker is needed for the local runtime. Node >=22.19.0 is required. The walkthrough below needs a checkout only for its test driver, and invokes the installed package. The CPU checks cover macOS and Linux; they do not establish Windows or fresh Docker behavior.

For the distinction between scheduling, saved evidence and actual task continuation, see [what the system enforces](system-guarantees.md).

## First choose what should stop the work

| Entry | Completion contract | Evidence |
|---|---|---|
| Ordinary TUI | One submitted task reaches a terminal outcome | Run archive, `:runs`, `:replay RUN_ID` |
| `loop` | Immediate first attempt; serial fixed-rate checks until original deadline or another stop | `execution.terminal`, per-attempt events |
| `goal` | Matching executable verifier PASS may stop early; valid FAIL retries within original limits; UNKNOWN stops for review | Bound candidate/criteria identities and `goal.verdict` |
| `execution inspect` | Reads stored metadata/result only | Does not restart a process or replay a tool |

An attempt finishing is not the same as the goal being correct. A tool error, exhausted budget or unconfirmed stop can end the schedule before its deadline. Missed loop ticks are skipped, not queued or overlapped. Goal verifies immediately after a completed attempt; `--every` also controls periodic reconciliation, not a mandatory sleep before every goal retry.

`--for` is the execution deadline, not a promise that the entire command exits at exactly that instant: stopping and preservation are separate bounded phases (up to 5 seconds for stop confirmation and 30 seconds for preservation). A normal loop deadline returns exit 0 with `reason: deadline_exceeded`; a goal deadline is not success and returns exit 1. Always read the terminal reason, not only the process exit code.

## Run the installed offline walkthrough

This is a control-flow demo using Pan's public `--fixture` option and its Faux adapter. A prepared `result.txt` contains `correct`; the scripted model emits completion text. **It does not solve a task or measure model intelligence.** An operator-owned shell verifier checks that its text is `correct` after shell command substitution strips trailing newlines; this walkthrough predicate is not byte-exact. The negative verifier exits 2 and must produce UNKNOWN/`needs_review`, even though the same model says it is done.

From a checkout containing this guide, install the public release into a disposable consumer and run the repository's driver:

```sh
DEMO_ROOT=$(mktemp -d)
npm install --prefix "$DEMO_ROOT/consumer" --ignore-scripts --omit=dev --no-audit --no-fund \
  https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz
node scripts/consumer-readiness/walkthrough.mjs \
  "$DEMO_ROOT/consumer/node_modules/.bin/pan-agent" "$DEMO_ROOT/evidence"
```

The release archive SHA256 is `3f6783bd6674e9e57e49dac7d67a183313a6c61d3a9f1117b476019ab5c3aeab`; see [release assets](https://github.com/pym96/Pan-agent/releases/tag/v0.1.9). Download/install requires network access. The driver then runs offline. It is repository verification tooling, not part of the installed package, and never imports source runtime code. Node and POSIX `ps`/shell are sufficient; Python/pytest/Docker/API keys are not required. For source development use the [package build guide](../../../typescript/README.md); record its exact Git SHA and resulting tarball hash separately from the public release identity.

The runner creates a fresh HOME, excludes provider credentials, and applies a network-denial observation guard to Node processes. It records any attempted fetch/socket/HTTP connection; this is test instrumentation, **not product sandboxing**. The fixture has no network behavior. Each CLI subprocess has a 20-second diagnostic timeout; a failed check retains its output and stops the walkthrough. Do not reinterpret a timeout or failed assertion as a passing product result.

Expected steps:

1. Installed help exposes `sandbox`, `loop`, `goal` and `execution`.
2. A four-second loop completes multiple scripted attempts, then reports `deadline_exceeded`. Normal model completion does not stop it.
3. A ten-second goal finishes early with one attempt and a verifier PASS/`succeeded`.
4. An exit-2 verifier produces UNKNOWN/`needs_review` and CLI exit 1.
5. Invalid duration `0s` produces CLI exit 2 before execution-state creation.
6. Inspect returns the saved goal result; hashes of its state, workspace and memory remain unchanged.
7. Recorded owned child PIDs settle; the network-attempt log is empty.

`summary.json` gives the checked outcomes; `commands.json` records argv, exit codes, elapsed time and process observations; individual stdout/stderr files retain raw events, with `manifest.json` hashes. Inspect these locally—raw outputs contain your local paths. Keep evidence until reviewed. No background scheduler remains after the script exits; files are intentionally retained. Remove only the printed disposable DEMO_ROOT after inspecting it; keep anything you need for diagnosis.

## Set up a real scheduled task

The following examples are **syntax/source checked, not executed against a real provider in this walkthrough**. First install the v0.1.9 release and configure DeepSeek or Kimi using `pan-agent configure`; the command name below assumes your consumer's `node_modules/.bin` is on PATH. Otherwise use its absolute path. Supply the configured environment credential or Keychain entry without embedding keys in commands or files.

Create separate workspace, archive and control paths. `--state` must not already exist, including from a failed previous run. The workspace must exist; it cannot contain or be contained by memory/state roots.

```sh
mkdir -p workspace archives
pan-agent loop --every 5m --for 1h   --task 'Inspect the workspace and report current test status.'   --workspace "$PWD/workspace" --memory-root "$PWD/archives"   --state "$PWD/loop-state" --total-model-calls 20 --total-tool-calls 40
```

`--total-model-calls` and `--total-tool-calls` apply across attempts; per-attempt limits are `--max-model-turns` and `--max-tool-steps`. These are count limits, not hard token/currency caps. Real calls may cost money. CLI emits JSON events. Protected operations require a specific stdin reply to `approval.request`:

```json
{"requestId":"COPY_THE_ACTUAL_REQUEST_ID","decision":"allow-once"}
```

Use `deny` to refuse. Closed stdin denies protected operations; do not pipe blanket approvals. Normal host-user permissions remain in force.

For a goal, create `verifier.json` **outside the workspace**. Choose your actual requirement before running; this example only checks exact file content:

```json
{"version":"result-v1","command":"printf 'correct\\n' | cmp -s - result.txt","seconds":10}
```

```sh
pan-agent goal --every 5m --for 1h   --task 'Write result.txt containing exactly correct followed by a newline.'   --workspace "$PWD/workspace" --memory-root "$PWD/archives"   --state "$PWD/goal-state" --verifier "$PWD/verifier.json"   --total-model-calls 20 --total-tool-calls 40
pan-agent execution inspect --state "$PWD/goal-state"
```

Verifier timeout must be an integer from 1 to 25 seconds. Exit 0 means PASS, exit 1 valid FAIL, other exits/errors UNKNOWN. The configured verifier is operator-owned executable code; the model cannot choose it through its final answer. Local verification runs against a candidate snapshot with identity checks. This is not adversarial isolation against your own user account. A weak verifier proves only its weak predicate.

## Optional Docker tool isolation

These examples are also **source checked only here**. Docker isolation was independently checked in #148/#150, not rerun by this walkthrough. Prerequisites: compatible Linux Docker daemon, cgroup v2/resource controllers, the pinned image in [sandbox design](../../design/docker-sandbox.md), existing selected input file, and configured provider for real tasks. Unsupported/rootless configurations fail closed. Do not install or reconfigure a shared daemon merely to run this example without its owner's authorization.

```sh
pan-agent --kernel native --sandbox-root "$PWD/sandbox-state"   --sandbox-input "$PWD/input.txt" --memory-root "$PWD/sandbox-archives"
```

Each task gets a non-root container/volume. File and shell tools run there; inputs appear read-only under `/inputs`, output under `/workspace/task`. Retrieval is disabled. The host still runs the agent loop and holds API credentials. You can also add `--sandbox-root DIR` / `--sandbox-input FILE` to loop or goal. Without `--sandbox-root`, tools execute with your **host-user authority**; the workspace is only a working directory.

The profile uses no container network, a read-only root filesystem, 1 CPU, 512 MiB RAM and 64 PIDs. Docker shares the host kernel and trusts the daemon. There is no filesystem quota; free-space preflight and bounded export are not a hard disk cap. Approval cannot broaden the container's host mounts/network.

After a task, find the actual run directory (replace `/absolute/path/to/RUN_ID` below with the listed path):

```sh
pan-agent sandbox list --root "$PWD/sandbox-state"
pan-agent sandbox recover --run /absolute/path/to/RUN_ID
pan-agent sandbox verify --run /absolute/path/to/RUN_ID --command 'test -f result.txt' --seconds 10
pan-agent sandbox export --run /absolute/path/to/RUN_ID --out "$PWD/task-export"
pan-agent sandbox cleanup --run /absolute/path/to/RUN_ID
```

Recovery stops uncertain execution; it never repeats the task. Verification checks the retained workspace read-only after stopping generation. Export accepts up to 1,000 regular files / 64 MiB, rejecting links/special files and retaining the volume on unsafe export. Cleanup requires a valid export receipt/manifest and matching hashes. If export/stop confirmation fails, keep state and diagnostic resources; do not bypass checks or erase state to appear clean.

## Interrupted execution

`execution inspect` may report `interrupted_or_active` when there is no terminal result; that is uncertainty, not success or proof that processes stopped. Inspect resources and archived reservations before any new work. Local commands are not automatically resumed; sandbox uses the explicit recovery path above. Retry only as a newly authorized execution with a new state directory and after resolving possible side effects. Model task completion, independent verification, resource termination and evidence preservation are separate observations.

[System guarantees and boundaries](system-guarantees.md) · [Execution design](../../design/execution-controller.md) · [Current onboarding evidence](../../evidence/onboarding-system163/README.md) · [Historical walkthrough evidence](../../evidence/consumer-readiness/README.md) · [Versioned recordings](../tui-release56/README.md)
