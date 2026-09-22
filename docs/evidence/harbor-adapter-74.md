# Criteria1.3 — valid Builder controls; independent review pending

[Criteria1.3](https://github.com/pym96/Pan-agent/issues/74#issuecomment-5774142450)
continues `fc230dd486658bc71d627c22428663d2dc82d4eb`, inheriting complete
1.2/1.1/1.0. The old independent Verdict remains rejected/evidence_incomplete,
SHA256 `78bf1b3f0282ea3363ef55c77050454b487dc3657272b7130461037f1ca0a8aa`.

**Official positive reward=1 and negative reward=0 are now observed, with both
pytest tests actually executed. Final-image timeout/cancel controls also completed.
These are Builder technical results, pending independent Regulator and the final
candidate-bound Human/different-family boundary gate. No acceptance or main merge.**

| Final control (one each) | Raw result |
|---|---|
| positive | Two official tests passed, reward=1; Pan completed, including the expected explicit exit7 tool result. |
| negative | Two official tests failed because `/app/hello.txt` was absent, reward=0; not a dependency/network failure. |
| timeout | Bridge deadline1s produced a timeout tool result; container stopped in 10.2468589170021s. Pan dialogue completed, but task_success=false. |
| cancel | Pan cancelled; container stopped in 10.25461983299465s, task_success=false. |

Each control starts clean from image
`sha256:ef05b5874d4b4d9a2ab7ce28224f6b5615be9c8547e728bc2c5a3222617813bc`
(linux/arm64). All four containers ended Running=false/Pid=0. Each uses the same
installed public Pan Session/Faux adapter, official Harbor example and original
verifier/test/scoring/time-limit bytes. Recorded host canaries remain unchanged.
Real model/provider/balance calls and payment are zero; Faux usage is synthetic.
This public hello-world control is not a Terminal-Bench/model score.

## Preparation changes and retained failures

The signed local repository now maps apt's `uncompressed` type to its built-in
`.` handler and explicitly places it first after clearing the image's gzip
preference. A pre-install URI check detects missing advertised files; it checks
Release membership because apt's preview also lists provisional unsupported
architectures. One signed empty index missing from the old apt cache is created
as zero bytes and verified against its Release SHA256. No recompression, forged
Release, disabled signature, expiry, TLS or hash verification is used.

| Attempt | Distinct change and observation | Work seconds |
|---|---|---:|
| 1 | Added URI regression guard and uncompressed preference; guard rejected gzip selection still present in base configuration. | 4.896177749993512 |
| 2 | Cleared prior order in a later configuration file; missing type mapping still selected xz, caught by guard. | 4.40776437499153 |
| 3 | Added built-in mapping and Release-aware preview check; guard found the signed empty backports/restricted index absent from cache. | 4.549632999987807 |
| 4 | Reconstructed only the authenticated empty index; apt install, actual official installer download and uvx preflight succeeded. | 13.491444084007526 |

New preparation budget charged 27.345019208980375/1800s; every attempt remained
below min(600s, remaining). Phase timing conservatively includes command dispatch,
inspection and the internal timeout probe, excludes final bounded cleanup, and
never resets old resource use. Each distinct failed attempt retains its source
snapshot, command journal, error and cleanup. An unresolved, spent or identical
ledger is rejected before Docker. No further controls or preparation were run.

Four Ubuntu InRelease signatures, 16 uncompressed index hashes (including one
empty index), and 35 deb hashes were verified. The 15 nonempty indexes actually
consumed by apt were saved with their exact URI/cache paths; all 15 cached files
match the previously authenticated prefetch bytes exactly. Ubuntu apt is 2.8.3.
The uv0.9.7 archive still matches Astral's published checksum; six fixed Python
wheels retain PyPI metadata hashes. These checksum checks are not publisher
signatures. The installer itself prints `no checksums to verify`; the separate
controller checksum verification remains explicit. Actual installer retrieval
was byte-compared with the pinned script, and genuine uvx reported pytest8.4.1.

## Evidence and validation boundary

[Criteria1.3 identity](../../scripts/harbor/criteria13-identity.json) binds image,
script hashes, preparation budget, controls, stop durations and resources.
Bundle: `/Volumes/WD_BLACK/pan-agent/wo74-harbor-20260922/criteria13/`.
Initial228-artifact manifest SHA256:
`d2c78e59c47f6d9c438780b40ed1799ab5073c075372d79c3d4a2ef4c366e370`.
Exact-SHA Handoff, host checks and final boundary packet are indexed separately.

Six affected offline test methods pass (including three budget-rejection cases),
shell syntax/Python compilation pass, and 80 installed Pan / 6 official task
file hashes match. Old128/141-artifact manifests rechecked without mismatches.
Original resource baseline and all20 old steps remain; eight new steps give28.
Sampled minimum free90,803,703,808 bytes; maximum increment2,899,087,360 bytes.

Unchanged historical full regression was not repeated: earlier host82 passed;
Python259 had one terminal-snake timeout failure, then a single-test pass. The
full historical run remains failed and original host root-extra BLOCK remains.
New candidate path/package checks are reported in Handoff. Allowed navigation
is updated; root SOURCE_OF_TRUTH remains Master-owned. No facts/resume promotion.

The remaining gate is independent verification of the final remote SHA and its
candidate-bound C-HBR-02 Human/different-family review. Old Human replies do not
satisfy it. Raw results and configuration are supplied for that review.

---

# Criteria1.2 continuation — blocked before verifier

[Criteria1.2](https://github.com/pym96/Pan-agent/issues/74#issuecomment-5773455758)
continues `34d5c7091246870e8dc6e13f0b4121fceff7c5a4`; the independent 1.1
Verdict SHA256 remains
`63a0480ae9b9ac8b70f249246e38c3e120517db8c30659870f6eaa2e3328d634`.
**One newly authorized controller-prefetch scheme was attempted and stopped.
No derived image, official pytest execution, valid reward pair or task controls.**
This is Builder evidence for independent review, not acceptance.

## Observed result and concrete blocker

Controller prefetch took 539.569277048111 s of the 1800 s allowance. It obtained
uv 0.9.7 Linux aarch64, its official installer and published checksum, six pinned
PyPI wheels, and the old owned container's apt cache. Every network request used
15 s connect / 120 s total limits and at most one retry. The installer first had
curl exit35, uv archive first exit28 at 120 s, and the Pygments wheel also needed
its single retry; successes and failures remain in the download manifest.
The uv archive matches Astral's published SHA256
`8b3d31a154673c6d357727d2083a33525b515589d153fa5b5455e1db9e9e6363`.
The installer matches the old observed hash. These TLS/checksum checks are not
publisher signatures. Python wheels match PyPI version JSON hashes.

In a fresh original-base container, gpgv verified four InRelease signatures with
the original Ubuntu archive keyring; all 15 decompressed Packages indexes and
35 deb files matched the corresponding authenticated SHA256 entries. The source
cache container was inspected by full ID and remained stopped; it was never
used as a clean task environment.

**The Builder's reconstructed repository layout was incomplete for apt's default
compressed-index selection.** It supplied authenticated uncompressed `Packages`,
but `apt-get update` requested signed `Packages.gz` entries and failed with
`Hash Sum mismatch` / exit100. Example endpoint:
`file:/opt/wo74/repo/dists/noble/universe/binary-arm64/Packages.gz`.
This is an implementation/preparation failure, not evidence of a corrupt signed
upstream repository and not a network-caused negative task result. Work stopped
at 4.71022645800258 s, including the timeout probe. No extra preparation round
was started even though the maximum work allowance was not consumed.

A future authorized repair would need to make apt acquire the already validated
uncompressed indexes, or supply the exact signed compressed bytes. Merely
recompressing a cached index does not establish the signed compressed hash.
The retained failed script has not been silently replaced by an unverified fix.
Container-side Astral installer retrieval, local-artifact installation, uvx
preflight and the actual verifier path were **not reached**. Static inspection
established that this installer supports `UV_DOWNLOAD_URL`; it did not prove
that the final verifier can run. Return this concrete blocker to Master; do not
resume preparation or controls on the basis of this Handoff.

## Cleanup, resources and checks

- Actual `docker exec sleep 30` was stopped by the candidate's 1 s subprocess
  timeout. The same cleanup function stopped owned probe
  `349dbdad9abe30b85476ddc4a09d8202db075dc62e8ba2cceeaf39bbbf82dac7`
  in 1.221941791009158 s; Docker reported Running=false/Pid=0.
- Failed preparation container
  `8b5874010d3f4612c4a11f4cab475187c10407365a0e73943341bd1c2d1ea7a2`
  was stopped in 1.51306908299739 s, also Running=false/Pid=0. Both used
  1 CPU/2048 MiB, no host mounts, extra devices/capabilities or privileged mode.
  Work has a 600 s deadline, cleanup a distinct <=60 s allowance; the resource
  supervisor's 660 s ceiling does not coincide with the work deadline.
- This actual preparation-timeout probe is not the still-missing final-image
  Pan cancel/timeout control pair, nor an assertion that the 600 s exhaustion
  path or external signal interruption has been independently exercised.
- Original resource baseline and all 14 prior receipts are unchanged. Six new
  receipts bring the cumulative count to 20. Sampled minimum free space:
  92,605,558,784 bytes; maximum incremental allocation: 1,148,592,128 bytes.
- Three affected adapter boundary tests pass, including rejection of altered
  dependency environment values. Shell syntax and Python compilation pass.
  Official tests, reward reader/scoring logic, core Session and time limits are
  unchanged. No Linux binary was executed on the host; no model/provider,
  balance or real-credential calls occurred.
- Unchanged historical full tests were not rerun. Keep the exact earlier result:
  82 host checks passed; Python 259 had one terminal-snake timeout failure;
  its later single-test pass does not turn that full run into PASS. The original
  host root-extra-files BLOCK also remains. New candidate path/package checks
  and exact-SHA status are reported in the external Handoff.

## Evidence identity and remaining criteria

[Prefetch identity](../../scripts/harbor/prefetch-identity.json) binds URLs,
versions, checksums, attempt exit codes, full owned IDs, cleanup and resource
records. Bundle:
`/Volumes/WD_BLACK/pan-agent/wo74-harbor-20260922/criteria12/`.
Its initial 128-artifact `manifest.json` SHA256 is
`5804b8325cd15593feb2a6936ece7ce305874bddb7228f1ee5d093b89388b9d9`;
later Handoff/checks have a separate append-only manifest. Exact acquisition
scripts and raw download stderr are included. Old 1.0/1.1 bundles are retained.

C-HBR-01 still lacks a successful derived image and final round-trip evidence;
C-HBR-02 lacks final-image controls and final Human/different-family review;
C-HBR-03 lacks actual official positive1/negative0. No criterion is self-accepted.
All commits stay on `workorder/74-candidate`; main is untouched. Navigation is
updated only in allowed files; the root SOURCE_OF_TRUTH remains Master-owned.

---

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
