# Installed runtime regression

From a full-history source checkout (existing regression tests read historical Git objects), with Node **22.19.0** or **26.7.0** and Python 3.12:

```sh
python3 -m venv /tmp/pan-ci-python
/tmp/pan-ci-python/bin/python -m pip install -r scripts/runtime-ci/requirements.txt
/tmp/pan-ci-python/bin/python scripts/runtime-ci/run.py --output /tmp/pan-ci-evidence
```

Use a new output directory outside the checkout each time. POSIX shell and `ps` are required. The same entry runs on Ubuntu 22.04 in both Node matrix cells on pull requests (including drafts) and pushes to `main`. It checks out the PR **head SHA**, not GitHub's synthetic merge SHA; both event and source identities are retained. A green run supplies test evidence, not approval to merge.

The entry installs locked development dependencies, typechecks, runs the complete TypeScript test glob with TAP collection checks, builds/packs, installs into a fresh production consumer, compares every installed package file against the tarball, runs the existing execution150 installed CLI pytest suite, and runs the existing offline consumer walkthrough. No live provider, Docker daemon, GPU, or credentials are needed. Docker sandbox containment is **outside this CPU gate**, not implicitly passing.

Each command preserves stdout/stderr, command arguments, return code and duration. `result.json`, source file hashes, package hash, installed file hashes, JUnit, and walkthrough/raw pytest case files are uploaded even after failure. Installed `node_modules` is omitted from the upload; the tarball and file hashes remain. Dependency bootstrap failures remain failed jobs; missing artifacts also fail. GitHub retains artifacts for 30 days, so durable acceptance records must retain downloaded originals separately.

Individual commands are bounded to 120 seconds, aggregate suites share a 600-second entry deadline, and the CI job has a 20-minute ceiling including setup/upload. Lifecycle tests retain their existing individual watchdog and cleanup contracts. Suites run serially within each Node job except the existing TypeScript runner's own behavior. Timeouts, nonzero exits, empty collections, skips/TODO/cancellations, missing logs or package mismatches fail; errors are not retried or suppressed. The workflow uses read-only repository permissions and no persisted checkout credential.

Known preparation limitation: existing TypeScript test fixtures use URL `.pathname` for RUNBOOK paths. A non-ASCII checkout path currently produces encoded-path failures in those unchanged tests. Use an ASCII-only checkout for this CPU gate; the original failure is preserved in #154 evidence. This is not a claim that Unicode-path test support was fixed.
