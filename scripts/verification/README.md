# Offline executable verification

A reviewed **external** verifier executes cooperative local Node tests against a clean Git checkout. This is evidence collection, not an acceptance authority or hostile-code sandbox. No dependencies, provider calls, or network are used by the included fixtures. Supported and measured: Node26.7/macOS arm64; Node>=22.19/POSIX intended, other combinations untested. Windows process groups are unsupported.

```sh
node scripts/verification/cli.mjs --help
node --test scripts/verification/cli.test.mjs
node scripts/verification/cli.mjs demo --out /absolute/existing-parent/new-demo
```

Demo copies this directory into the new external output, creates its own disposable Git target, and preserves good → defect → omitted → wrong SHA → restored manifests/stdout/stderr/receipts. Expected assertion is independently fixed at42 in the trusted fixture; target changes42→41→42. Wrong SHA is refused before execution, therefore has a retained refusal output rather than a fabricated execution receipt. Nothing in the source checkout is changed. `demo-results.json` indexes outcomes. Keep the entire folder to reproduce/check evidence; do not edit an earlier receipt.

Set `PAN_VERIFICATION_TEST_EVIDENCE` to an existing external directory when running the CLI tests to retain all disposable fixtures, receipts and raw outputs; by default tests clean their temporary directories.

For real reviewer use, copy and review this entire directory outside the candidate, select the manifest and expected hash pins independently, and invoke **that external CLI**. Never use a candidate's claimed pins or narrative PASS as authority. Generate the sorted file map using `fileMap()` from the reviewed engine (or independently reproduce SHA256 over each file); every regular file under the trusted directory, including fixtures/tests, is included. `cli.mjs`, `engine.mjs` and `demo.mjs` are mandatory map entries and must match the actual executing copy; a test-only map is refused. Pin SHA256 of the compact JSON sorted map as verifier identity. Pin SHA256 of the manifest's exact bytes separately. The CLI rejects a trusted root or manifest inside the candidate and checks its executing engine/CLI against the pinned copy.

```sh
node /reviewed/verifier/cli.mjs run \
  --manifest /reviewer/manifest.json --manifest-sha256 REVIEWER_PIN \
  --candidate /clean/checkout --trusted /reviewed/verifier \
  --verifier-sha256 REVIEWER_VERIFIER_PIN --out /evidence/new-run
node /reviewed/verifier/cli.mjs check \
  --manifest /reviewer/manifest.json --manifest-sha256 REVIEWER_PIN \
  --candidate /clean/checkout --trusted /reviewed/verifier \
  --verifier-sha256 REVIEWER_VERIFIER_PIN \
  --receipt /evidence/new-run/receipt.json --receipt-sha256 RECORDED_RECEIPT_PIN \
  --run-id RECORDED_RUN_UUID
```

Run prints the receipt hash for independent retention alongside its run ID. Check never executes receipt commands. Rechecking the same receipt reproduces evidence interpretation, not a new execution or freshness. A hash detects changes relative to a retained pin; it does not authenticate who approved the pin. Human criteria stay `humanPending` even when `machineCheck` is PASS. Exit0=machine PASS,1=assertion FAIL,2=NOT_EVALUABLE/refusal. Raw stdout/stderr are untrusted artifacts, not verdicts.

[Version1 schemas and limits](../../docs/design/executable-verification.md). [Evidence](../../docs/evidence/executable-verification/README.md).
