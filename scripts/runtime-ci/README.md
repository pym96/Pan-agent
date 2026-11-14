# Installed runtime regression

From a full-history source checkout (existing regression tests read historical Git objects), with Node **22.19.0** or **26.7.0** and Python 3.12:

```sh
python3 -m venv /tmp/pan-ci-python
/tmp/pan-ci-python/bin/python -m pip install -r scripts/runtime-ci/requirements.txt
/tmp/pan-ci-python/bin/python scripts/runtime-ci/run.py --output /tmp/pan-ci-evidence
```

Use a new output directory outside the checkout each time. POSIX shell and `ps` are required. The same entry runs on Ubuntu 22.04 in both Node matrix cells on pull requests (including drafts) and pushes to `main`. It checks out the PR **head SHA**, not GitHub's synthetic merge SHA; both event and source identities are retained. A green run supplies test evidence, not approval to merge.

The entry installs locked development dependencies, typechecks, runs the complete TypeScript test glob with TAP collection checks, builds/packs, installs into a fresh production consumer, compares every installed package file against the tarball, runs the existing execution150 installed CLI pytest suite, and runs the existing offline consumer walkthrough. No live provider, Docker daemon, GPU, or credentials are needed. Docker sandbox containment is **outside this CPU gate**, not implicitly passing.

Each command preserves stdout/stderr, command arguments, return code and duration. `result.json`, source file hashes, package hash, installed file hashes, JUnit, and walkthrough/raw pytest case files are uploaded even after failure. The root `consumer/` installation is omitted from the upload; the tarball and installed file hashes remain. Dependency bootstrap failures remain failed jobs; missing artifacts also fail. GitHub retains artifacts for 30 days, so durable acceptance records must retain downloaded originals separately.

CI uploads `runtime-evidence.tar.gz` and a plain `result.json`. The archive preserves original POSIX path names, including quotes and newlines that GitHub's artifact service rejects as individual filenames; only the root `consumer/` directory is excluded, as before. Both bundling and uploading run after failed tests too. A test, tar/copy or missing-artifact failure remains a failed job. Extract the archive on a POSIX filesystem to inspect its original paths; uploading a transport archive is not evidence that Windows supports those names.

Individual commands are bounded to 120 seconds, aggregate suites share a 600-second entry deadline, and the CI job has a 20-minute ceiling including setup/upload. Lifecycle tests retain their existing individual watchdog and cleanup contracts. Suites run serially within each Node job except the existing TypeScript runner's own behavior. Timeouts, nonzero exits, empty collections, skips/TODO/cancellations, missing logs or package mismatches fail; errors are not retried or suppressed. The workflow uses read-only repository permissions and no persisted checkout credential.

Checkout-path regression copies the three actual Kimi fixtures and their source dependencies into owned directories containing ASCII, Unicode, spaces, `%`, `#`, literal `%20`, and a combined path. Each runs all affected tests with nonempty TAP and no skips; the temporary trees are removed afterward. Both CI Node cells run the entire shared entry from `中文 space %# literal%20`, rather than relocating tests to an ASCII checkout. File URLs are converted using `fileURLToPath` at the fixture call sites. This covers valid POSIX paths; Windows support is not claimed. The original #154 encoded-path failures and #157 red-before-fix records remain separate from #154’s unresolved main-run failure.

Output paths are a separate boundary. Both Node cells also use the external directory `runtime-evidence 中文 space %# literal%20` for package installation, pytest case files and uploaded evidence. The installed suite includes nine [path-as-data cases](../../tests/execution150/README.md) using the actual verifier heartbeat command; spaces, quotes and shell metacharacters must remain filename data. No source tests are moved to an ASCII directory, and lifecycle fault assertions still execute. [#159 diagnosis](../../docs/evidence/output159/README.md).

Authorization tests record observed filesystem capabilities in TAP diagnostics. Native Unicode alias identity is asserted only when the filesystem actually exposes it; case-sensitive Linux jobs instead verify absent-path denial and no effects. Missing configured protection anchors deny access until the ordinary-control fixture explicitly materializes them. This test-premise distinction does not change Runtime authorization or claim native Unicode-fold coverage on Linux.

The `onboarding.py` consumer suite additionally installs the packed artifact globally under a fresh temporary prefix/home with lifecycle scripts disabled. Actual POSIX PTYs check first-run setup, repeat launch, explicit overrides and special paths; bounded non-TTY/invalid-path probes and an intercepting fetch guard check error handling and idle behavior. The preload module is passed as an encoded file URL in `NODE_OPTIONS`; a separate `data:` fetch canary verifies guard loading without a network request. It is part of the same Linux matrix entry, with raw output under `onboarding/`. No public npm release is implied.
