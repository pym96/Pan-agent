# Installed runtime regression

From a current source checkout, including a clean `git clone --depth=1`, with Node **22.19.0** or **26.7.0** and Python 3.12:

```sh
git clone --depth=1 https://github.com/pym96/Pan-agent.git /tmp/pan-current
cd /tmp/pan-current
python3 -m venv /tmp/pan-ci-python
/tmp/pan-ci-python/bin/python -m pip install -r scripts/runtime-ci/requirements.txt
mkdir -p /tmp/pan-ci-home /tmp/pan-ci-tmp
HOME=/tmp/pan-ci-home TMPDIR=/tmp/pan-ci-tmp \
  /tmp/pan-ci-python/bin/python scripts/runtime-ci/run.py --output /tmp/pan-ci-evidence
```

Use a new output directory outside the checkout each time. POSIX shell and `ps` are required. The same entry runs on Ubuntu 22.04 in both Node matrix cells on pull requests (including drafts) and pushes to `main`. It uses `fetch-depth: 1` and checks out the PR **head SHA**, not GitHub's synthetic merge SHA; both event and source identities are retained. A green run supplies test evidence, not approval to merge.

The entry installs locked development dependencies, typechecks, runs the complete TypeScript test glob with TAP collection checks, builds/packs, installs into a fresh production consumer, compares every installed package file against the tarball, runs the existing execution150 installed CLI pytest suite, and runs the existing offline consumer walkthrough. No historical Git objects, parent checkout, host workspace, prebuilt `dist`, Pi installation, live provider, Docker daemon, GPU, or credentials are needed. Docker sandbox containment is **outside this CPU gate**, not implicitly passing.

Each command preserves stdout/stderr, command arguments, return code and duration. `result.json`, source file hashes, package hash, installed file hashes, JUnit, and walkthrough/raw pytest case files are uploaded even after failure. The root `consumer/` installation is omitted from the upload; the tarball and installed file hashes remain. Dependency bootstrap failures remain failed jobs; missing artifacts also fail. GitHub retains artifacts for 30 days, so durable acceptance records must retain downloaded originals separately.

CI uploads `runtime-evidence.tar.gz` and a plain `result.json`. The archive preserves original POSIX path names, including quotes and newlines that GitHub's artifact service rejects as individual filenames; only the root `consumer/` directory is excluded, as before. Both bundling and uploading run after failed tests too. A test, tar/copy or missing-artifact failure remains a failed job. Extract the archive on a POSIX filesystem to inspect its original paths; uploading a transport archive is not evidence that Windows supports those names.

Individual commands are bounded to 120 seconds, aggregate suites share a 600-second entry deadline, and the CI job has a 20-minute ceiling including setup/upload. Lifecycle tests retain their existing individual watchdog and cleanup contracts. Suites run serially within each Node job except the existing TypeScript runner's own behavior. Timeouts, nonzero exits, empty collections, skips/TODO/cancellations, missing logs or package mismatches fail; errors are not retried or suppressed. The workflow uses read-only repository permissions and no persisted checkout credential.

Checkout-path regression copies the three actual Kimi fixtures and their source dependencies into owned directories containing ASCII, Unicode, spaces, `%`, `#`, literal `%20`, and a combined path. Each runs all affected tests with nonempty TAP and no skips; the temporary trees are removed afterward. Both CI Node cells run the entire shared entry from `中文 space %# literal%20`, rather than relocating tests to an ASCII checkout. File URLs are converted using `fileURLToPath` at the fixture call sites. This covers valid POSIX paths; Windows support is not claimed. The original #154 encoded-path failures and #157 red-before-fix records remain separate from #154’s unresolved main-run failure.

Output paths are a separate boundary. Both Node cells also use the external directory `runtime-evidence 中文 space %# literal%20` for package installation, pytest case files and uploaded evidence. The installed suite includes nine [path-as-data cases](../../tests/execution150/README.md) using the actual verifier heartbeat command; spaces, quotes and shell metacharacters must remain filename data. No source tests are moved to an ASCII directory, and lifecycle fault assertions still execute. [#159 diagnosis](../../docs/evidence/output159/README.md).

Authorization tests record observed filesystem capabilities in TAP diagnostics. Native Unicode alias identity is asserted only when the filesystem actually exposes it; case-sensitive Linux jobs instead verify absent-path denial and no effects. Missing configured protection anchors deny access until the ordinary-control fixture explicitly materializes them. This test-premise distinction does not change Runtime authorization or claim native Unicode-fold coverage on Linux.

The `onboarding.py` consumer suite additionally installs the packed artifact globally under a fresh temporary prefix/home with lifecycle scripts disabled. Actual POSIX PTYs check first-run setup, repeat launch, explicit overrides and special paths; bounded non-TTY/invalid-path probes and an intercepting fetch guard check error handling and idle behavior. The path fixture exceeds 160 characters and retains Unicode, spaces, `%`, `#` and literal `%20`. The PTY width accommodates the complete configured paths so the unchanged exact-path assertions observe path identity independently of the external output-root length; this does not establish wrapped-layout behavior. The preload module is passed as an encoded file URL in `NODE_OPTIONS`; a separate `data:` fetch canary verifies guard loading without a network request. The candidate checks cover home aliases, child workspace reuse, explicit overlap, missing environment recovery and cancellation. On macOS the suite also intercepts the Keychain executable and provider transport while exercising the installed PTY in two separate projects. The Linux matrix verifies the environment-only prompt. It is part of the same Linux matrix entry, with raw output under `onboarding/`. No public npm release is implied.

The candidate onboarding suite also runs `interrupts.py` against the installed launcher. It drives keyboard Ctrl-C and OS SIGINT separately and checks process status, terminal modes, unsaved configuration, pending approval, run archives and the lifetime of an approved sleep process. The synthetic provider runs entirely inside the CLI process. Each case retains its terminal recording under `onboarding/interrupts/`.

## Installed settings checks

`settings.mjs` consumes the actual package installed by this entry. It runs the executable's path/show/validate and configure flows with private HOME, checks unchanged bytes/modes and malformed-policy refusal, then imports only the installed public API for deterministic TUI composition. Real shell sentinels distinguish a denied operation from an allowed operation before and after a new session. It checks attachment precedence and archives the correlated denial. Fetch and Keychain interception have separate canaries; no real credential or provider access is required. These checks run in both Node cells through `run.py`; raw commands, archives and `settings/summary.json` are retained. The public v0.1.9 artifact predates this feature and is not a valid input for these new checks.

## Fresh public-release onboarding

To check the actual downloadable artifact without building source, run the same seven consumer cases in a new external directory:

```sh
python3 scripts/runtime-ci/onboarding.py \
  --release-url https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz \
  --sha256 3f6783bd6674e9e57e49dac7d67a183313a6c61d3a9f1117b476019ab5c3aeab \
  --output /tmp/pan-public-onboarding
```

This mode independently downloads the tarball, verifies the expected SHA256, installs **from that URL** with a new HOME/cache/global prefix, and compares the complete installed file map. Download and npm installation use the network; the fetch guard starts afterward for product execution. Local `--package` mode remains offline and is the CI default. Neither mode reads inherited credentials or invokes a provider. Raw install receipts, hashes and PTY logs remain in the output directory.

The installed regression now includes effect→controller death→inspect→refused old-state restart. It checks product-owned process shutdown before fixture teardown and preserves exact file hashes and admission-ticket identities. See [the system guarantee matrix](../../docs/demo/consumer-readiness/system-guarantees.md) for the limits; checkpoint unit tests do not establish installed automatic resume.

## Extending and reproducing checks

Add current source tests as `typescript/test/*.test.ts`; the shared runner and `npm test` discover that top-level glob. Keep fixtures under the existing test fixture locations. No fixed test count or history manifest edit is required. The complete entry includes conformance in the source suite plus pack/install, lifecycle, onboarding and walkthrough; `npm run check` covers typecheck/source tests only. Locked npm development dependencies and pinned pytest preparation may download public packages; the installed consumer phase is offline.

Old #41 relocation/graph proof, #25 revision-to-base facts freeze and #43 routing wording run only through [explicit historical reproduction](../history-replay/README.md). Its Git/cache prerequisites and original criteria are separate from the current entry. [Assertion map and design](../../docs/design/current-regression-history.md).

## Native platform enforcement

`node scripts/runtime-ci/native-macos.mjs INSTALLED_PACKAGE NEW_EXTERNAL_OUTPUT` exercises the real installed CLI/TUI and actual native backend on macOS or supported x86-64 Linux. It checks a host edit, Shell command, atomic project output replacement and typed readback using scripted responses. The required-real Linux source test sets `PAN_REQUIRE_NATIVE_LINUX=1`. Restricted-runner refusal is recorded separately. `native-linux-unavailable.mjs INSTALLED_PACKAGE NEW_OUTPUT` verifies zero calls/effects in an intentionally unsupported Linux fixture. See the [Linux policy](../../docs/design/native-linux-sandbox.md) and [macOS policy](../../docs/design/native-macos-sandbox.md).

The installed [supervised delivery regression](delivery.mjs) creates disposable local Git projects and drives the packaged CLI. It retains failed/accepted candidates, actual worker and verifier process records, cancellation and restart checks, and a separate JSON task using the configured DeepSeek adapter with an in-process offline HTTP stub. Each invocation has stdout/stderr under the output's `delivery/` directory. No paid request occurs.

## Installed native networking

The workflow also calls `native-network-linux.sh INSTALLED_PACKAGE EXISTING_OUTPUT_DIRECTORY`. A disposable Ubuntu image supplies compatible userspace packages, including Bubblewrap, FUSE and libatomic. A private mount namespace exposes those files read-only at /usr on the runner. The fixture executes on the runner kernel, outside the provisioning container, as the ordinary runner UID with no supplementary groups. The host mount table and installed packages are untouched. This step fails if the real backend or the public operator-owned test file is unavailable. The retained evidence includes DNS answers, raw task archives, socket decisions and receipts from both private address families.

On a supported macOS or Linux host, run `node scripts/runtime-ci/native-network.mjs INSTALLED_PACKAGE NEW_OUTPUT`. A Mac with the known synthetic benchmark-range DNS mapping can add `--pages-address-fixture` to exercise the real default denial and normal TLS/HTTP GET to the verified public Pages IP, followed by a controlled changed-answer denial. The runtime CLI has no DNS-pin flag.

The Node 26 cell also provisions the existing pinned amd64 Docker image and runs `docker-offline.mjs INSTALLED_PACKAGE NEW_OUTPUT`. An installed Pan task observes its actual interfaces, retains the effective profile and exports and cleans its own container. The Docker backend retains its existing 20 GiB free-space and cgroup/seccomp prerequisites.

Run `node scripts/runtime-ci/workspace-trust.mjs INSTALLED_PACKAGE NEW_OUTPUT` on supported macOS or Linux for #175. The installed release candidate, offline OS sandbox and real subprocesses exercise two operator-selected scopes and four sealed tasks. Hash receipts distinguish authorization from expiry without printing fixture values. Linux CI runs this fixture beside the networking regression in the same provisioned userspace.

The installed [native onboarding fixture](native-onboarding.mjs) compares normal and session-only creation of the same ordinary workspace document. It also runs a dependency-free npm lifecycle script twice under the native OS boundary, verifies a deliberate failure and protected fixture, and checks grant expiry, near-match approval and configured denial. It also selects build and report together, checks the per-task authorization and actual outputs, and verifies that unselected or denied commands and a fresh session leave no unexpected effects. It drives real TUI choices and checks host invocation receipts after a controlled pre-task prerequisite failure. On macOS run `node scripts/runtime-ci/native-onboarding.mjs INSTALLED_PACKAGE NEW_ABSOLUTE_OUTPUT` with canonical paths. The provisioned Linux CI step runs the same fixture using its real native backend.

### Reproducing the Linux prerequisite set

The Linux setup script pins an official Ubuntu 24.04 amd64 image by manifest digest and configures the signed Ubuntu archive at the UTC timestamp `20261117T120000Z`. The image was built on 10 November 2026. On 17 November the `noble`, `noble-updates` and `noble-security` InRelease files contained no `Valid-Until` header. With the image's default APT time checks these specific signed files have no archive-provided expiry. APT still verifies signatures with the pinned image's Ubuntu keyring, verifies index and package digests, and rejects expired metadata when an expiry is present. The initial signature and SHA-256 checks covered all three pockets and six main/universe amd64 package indexes. [Ubuntu snapshot service](https://ubuntu.com/server/docs/how-to/software/snapshot-service/) · [APT expiration options](https://manpages.debian.org/trixie/apt/apt.conf.5.en.html)

To refresh, select an official amd64 image and a matching snapshot taken after that image's build. Check the dates, expiry and signatures of all three InRelease files with that image's archive keyring, and match the main/universe index lengths and SHA-256 values to those signed files. Keep APT signature, time, TLS and package hash checks enabled. Run both pinned Node jobs and inspect the actual Linux onboarding, trust and network outputs, plus the Node 26 Docker regression, before accepting the new pair. A pinned date excludes subsequent package updates until refreshed. The `native-linux/setup.log` artifact records the image, snapshot, installed package versions and fixture stages. The existing 55s image pull, 65s APT update, 65s install and 240s overall Linux limits apply.

The prior rolling sources passed on Node 26. Node 22's first run encountered different signed and downloaded index lengths; its retry again stopped during index acquisition before a native workload ran. [First Node 22 run](https://github.com/pym96/Pan-agent/actions/runs/44480125894/job/135410068502) · [Node 22 retry](https://github.com/pym96/Pan-agent/actions/runs/44480125894/job/135411852899) · [Successful Node 26 run](https://github.com/pym96/Pan-agent/actions/runs/44480125894/job/135410068978)

The installed [MCP report check](mcp-reports.mjs) runs the packaged synthetic demo, an external [stdio test peer](mcp-report-peer.mjs), policy/denial checks, Unicode framing, typed failures, cancellation and PID cleanup. Its `mcp-reports/` evidence directory contains the raw client/peer lines in per-case JSONL, plus exit statuses, durations and CLI results in `summary.json`.


The [installed TUI report check](mcp-tui.py) drives the actual launcher through a POSIX PTY. A [test-only fetch substitute](mcp-tui-model.mjs) supplies deterministic SSE to the normal model adapter. Its answer uses the tool response it received. The separate stdio peer reads a fresh synthetic reason from a file. The scenarios compare its wire receipts with the sealed tool records, confirm a denial produces zero calls and exercise builtin reads in the same session after peer failure. Each case retains its terminal bytes, model requests and archives under `mcp-tui/`. The packaged sample also runs through this TUI. With a working native backend, add `--native-sample` to exercise both samples under the default profile. The Linux CI runs these samples in its native test namespace.

The installed PTY client in `installed_pty.py` is shared by MCP and host lifecycle tests. `host-lifecycle.py` checks the explicit host session, revocation and default restart with an offline model fixture and records PTY transcripts and original archives. It runs on macOS and in the provisioned Linux native matrix.

The [installed copy check](copy-output.py) captures terminal controls in an isolated PTY, checks UTF-8 clipboard payloads against private text files, and confirms copying conversation, approval, details and replay output issues zero additional model requests.

The [installed public document fixture](public-documents.mjs) checks large static HTML extraction, Unicode-safe multi-window reads, exact HTTP query targets across redirects and windowed reads, redirect and failure handling, GitHub license fallback, DNS reply validation, macOS proxy selection and the exact CONNECT authority at a recording loopback listener. The Linux matrix and the focused macOS job run it without external document requests. On an affected Mac, append `--live-macos` to the fixture invocation to exercise the OS-selected proxy against GitHub and example.com. Use `--live-queries` to check just the GitHub repository tab and paginated user API. Both optional probes make real public HTTPS requests with no model provider.
