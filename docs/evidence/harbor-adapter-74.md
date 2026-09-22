# Criteria1.1 continuation — preparation blocked

[Criteria1.1 contract](https://github.com/pym96/Pan-agent/issues/74#issuecomment-5772562134)
continues `01dc19b77483e4e9d35a904e306ed20ece7a6977` additively. Its independent
Criteria1.0 Verdict remains rejected/evidence_incomplete (SHA256
`46ac6a2cf0913932f4a1e8a1be16eda43f20ce81669f8c5bfcef0e8d90b944eb`).
No accepted declaration or main change.

**Both authorized preparation rounds failed. No derived image passed preflight;
zero new positive/negative/timeout/cancel controls were started. Valid rewards
1/0 remain unavailable. Builder's two-round allowance is exhausted.**

| Round | Plan | Actual outcome |
|---|---|---|
| 1 | Original image, official ports.ubuntu.com over HTTPS, public certifi CA bootstrap, signed apt, official curl/uv/pytest preparation | apt returned 100 after 504.7273779590032 s: TLS termination and DNS failures downloading required .deb files. No uv/pytest preflight or image commit. |
| 2 | Same original image, TUNA Ubuntu Ports HTTPS mirror with original Ubuntu archive key, retained apt cache, system Python | curl/Python/certificates installed; official uv installer fetched (SHA256 `ef72d0c2b8f2d2a0d7c6b2d866339869a3f0cbd31e8f1b6901f2064c16d47b58`). The 600 s deadline expired while downloading uv 0.9.7 aarch64-unknown-linux-gnu. No pytest preflight or image commit. |

Round 2 elapsed record is 600.0077009169909 s at timeout detection; this is not an
increased allowance. Its outer resource deadline also interrupted the original
finally cleanup. The controller subsequently stopped the explicitly recorded
owned container and retained `final-state-controller-cleanup.json`; both owned
containers were independently inspected as Running=false/Pid=0. This failure is
not hidden or labelled a passing cancellation control. The candidate now protects
bounded preparation cleanup against overlapping SIGTERM, with a signal-injection
unit regression. No third online preparation was run to validate that fix.

Preparation IDs, original base identity, script/public-CA hashes, exact commands,
raw endpoint errors and terminal states are in
[preparation-identity.json](../../scripts/harbor/preparation-identity.json) and the
external bundle `/Volumes/WD_BLACK/pan-agent/wo74-harbor-20260922/criteria11/`.
`manifest.json` SHA256:
`1765e8e16e34d089e8fc63e421ae10d4f7d55a989c2577bd89903f1d1589da60`.
This manifest covers original continuation artifacts; later host checks/Handoff
are separately indexed. No official task/test/scoring bytes or thresholds changed.
The unchanged `identity.json` still locks installed Pan, Harbor and task inputs.

The cumulative resource baseline and all twelve old step receipts remain; two
new preparation receipts bring the count to fourteen. Observed minimum free
93,083,226,112 bytes; maximum incremental allocation 742,514,688 bytes. Old
96-artifact manifest revalidation found no mismatches. No old failure was reset,
no host proxy/DNS/Docker settings changed, and no real credentials/models used.

## Incremental implementation and checks

- Dependency-only preparation scripts: two explicit plans, <=600 s, original
  base image, TLS/archive signatures enabled, no test/solution/answer upload.
- Runner requires matching successful prepared-image metadata and a clean start.
  Official tests are still uploaded only after Pan ends; verifier remains 120 s.
- `scoring.py` requires both official tests to execute, with the expected results
  and missing-file cause for a negative. Dependency/network/collection errors
  remain infrastructure errors even when the official script writes reward=0.
- Replay of the independent old reward=0/network-failure log was rejected as
  infrastructure failure. Nine offline test methods pass, including empty/invalid
  rewards, missing execution, inconsistent summaries and preparation cleanup.
- New-image integration and cancellation evidence is **not available**. Existing
  adapter/Session code and original identities are unchanged; historical PASS
  and technical checks do not become acceptance of this new candidate.

## ScopeChallenge SC-74-02 — two preparation plans exhausted

Blocking Criterion: C-HBR-03/1.1 lacks a successful preparation and valid executed
1/0 pair. C-HBR-01's new image identity and C-HBR-02's final-image controls also
cannot be supplied. Specific network failures: ports.ubuntu.com .deb TLS/DNS
errors in round 1; round 2 spent most of its allowance downloading signed indexes
and packages from mirrors.tuna.tsinghua.edu.cn, then reached its hard deadline
inside the official uv installer. Full logs retain the endpoints and process state.

Return to Master for a new, explicitly bounded preparation/network plan before
any additional attempt. One possible next plan is separately authorized trusted
dependency prefetch or a transport repair; this candidate does not authorize it,
change official test/score/timeout rules, or reuse an incomplete preparation as a
valid image. Independent Regulator should report the remaining evidence gap and
not rerun unavailable final-image controls automatically. C-HBR-02's separate
Human/different-family gate is still pending; no Human response was inferred.

---

## Retained Criteria1.0 Builder record

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
