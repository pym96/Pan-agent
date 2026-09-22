# WO74 Harbor adapter — Builder candidate evidence

Criteria-Version **1.0**. This is a zero-model public hello-world development
control, **not a Terminal-Bench result, model-capability claim or accepted fact**.
[Contract](https://github.com/pym96/Pan-agent/issues/74#issuecomment-5770491857).
Accepted base: `3d42cc22df25a6d34cbc5bdc18edde47a1180119`.
The [Verified Project Facts register](verified-project-facts.md) is unchanged;
this document records candidate observations only.

## Observed results and blocking gap

| Criterion | Builder observations | Remaining boundary |
|---|---|---|
| C-HBR-01 | Official instruction entered installed GeneralAgentSession; FauxModelAdapter scripted the tools; real container stdout returned; normal control wrote/read `/app/hello.txt`; package, 80 installed files, fixed Harbor SHA, task/test hashes, dependency versions and image identities recorded. | Independent reproduction required. |
| C-HBR-02 | One `task_command` tool bound to BaseEnvironment; only verifier-log mount; no privileged/cap-add/device/socket/host network; 1 CPU / 2048 MiB; independent host canary unchanged; container-side canary changed; exit 7 returned as 7. Timeout and cancellation stopped entire task containers, Running=false/Pid=0. | Independent Regulator plus different-family or Human boundary review still required. No adversarial-security claim. |
| C-HBR-03 | Unmodified official verifier launched in two fresh containers. **Both hit the official 120-second limit while preparing dependencies; neither produced reward.** Missing/non-numeric/non-finite reward reader controls raise evaluation errors. | **Blocking evidence incomplete:** required reward=1 / reward=0 pair is absent. No score inferred from Pan completion. |

Positive Pan terminal: `completed`, tool exit codes `[0,0,7]` (exit 7 is a tool
error). Negative Pan terminal: `completed`, tool exit codes `[0,0]`, with
`test ! -e /app/hello.txt`. Verifier timeout is distinct from both Pan terminals.

The 1-second bridge-deadline control recorded actual shell/child PIDs before
termination. Stop confirmation took **10.233264583002892 s**, command status
`timeout`, exit_code=null. Pan completed its scripted dialogue; task_success=false.
The active cancel control waited for the shell/child marker before Pan cancel;
stop confirmation took **10.216372665992822 s**, Pan terminal `cancelled`, command
status `cancelled`, exit_code=null, task_success=false. Both are within the
contract's 30-second stop bound. All four containers remain stopped for inspection.

No real provider/model/balance requests, no credential or Keychain reads. The only
credential-shaped value was a fictitious canary. All reported model usage is
synthetic zero, not measured provider usage. No #73 work or evidence was touched.

## Primary artifacts

External bundle: `/Volumes/WD_BLACK/pan-agent/wo74-harbor-20260922/`.
Its immutable original-artifact index `manifest.json` has SHA256
`f6fa3a9b63f80114c374c86b45f360dd868fd6ff98d3f7b486f6631a2583d4fb`.
The index covers the original controls/preparation, source archive and Pan tarball;
later Handoff and host-check artifacts are separate additions.

- `controls-1/{positive,negative}/agent/{trace.json,bridge.json,archive/}`:
  installed Session observations, correlated real tool results and sealed archive.
- `controls-1/{positive,negative}/verifier/test-stdout.txt`: original verifier
  dependency output; `failure.json` and `final-state.json` retain timeout/stopped state.
- `controls-1/{timeout,cancel}/agent/bridge.json`: observed shell/child PIDs,
  stop timings, immutable container IDs, process termination and non-success results.
- All four `configuration.json` files: image, mounts, resource/permission settings,
  environment **names**; `host-canary` remains `host-original`.
- `resources-and-preparation/`: per-command logs, receipts, samples and failure history.
- `harbor.tar.gz`, `pan-agent-0.1.0.tgz`, `contract.json`: original fixed inputs.
- [identity.json](../../scripts/harbor/identity.json) and
  [requirements.lock](../../scripts/harbor/requirements.lock): repository-sized identity records.

The first image build exited before creating an image because the credential-free
Docker config lacked its buildx plugin path. The failed `hello-build` receipt is
retained. `hello-build-with-plugin` then built successfully with the already
installed Docker Desktop plugin. No task control was retried. Neither verifier
threshold nor task/tests/environment source was modified.

Resource samples across 12 owned installation/build/run steps: minimum available
**93,907,079,168 bytes**, maximum incremental allocation **413,294,592 bytes**,
below 24 GiB and above the 60 GiB floor. Docker.raw resolved to the internal
APFS data volume. Sampling is an operational guard, not attribution or an exact
post-hoc accounting claim. Source acquisition preceded installation baseline;
the source archive identity and original free-space precheck are retained in
session history, not misrepresented as an additional monitored install step.

## Checks and reproduction

[Design and commands](../design/harbor-adapter.md). Two offline unittest methods
cover missing/invalid rewards, allowed configuration, resource changes, sensitive
mounts, host networking, SYS_ADMIN, device requests and extra environment names.
Node and Python syntax checks passed. Full installed-file hash comparison passed.
The original host package check is reported separately from any isolated check;
see the SHA-bound Handoff for final host receipts.

## ScopeChallenge SC-74-01

Concrete blocker: under the unchanged official Ubuntu image/test.sh, network
preparation consumed the 120-second verifier allowance in **both** clean controls.
The positive log reached curl/certificate installation; the negative log stopped
inside dependency preparation. Neither contains a pytest reward. C-HBR-03 cannot
be claimed satisfied. Retain these failures. Master must decide any subsequent
network/environment preparation or separately authorized fresh attempt; Builder
has not preinstalled verifier dependencies into the official image, changed
limits, manufactured reward, or silently retried. This is not a role change or
permission to widen the task.

Candidate requires an independent SHA-bound Verdict. C-HBR-02 additionally keeps
its high-risk review obligation; no self-acceptance, VPF or resume promotion.
