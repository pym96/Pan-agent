# First-run settings and explicit credential storage | WorkOrder #52

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/52#issuecomment-5629978774) freezes Criteria-Version `1.0`, C-CONFIG-01…06, on accepted base `10f0b3089ac6e88b254a89e7f970696cc1c332ab`. Parent: [Preview Spec #50](https://github.com/pym96/Pan-agent/issues/50) stories 4–9.

## Design

- [`src/config/settings.ts`](../../typescript/src/config/settings.ts): `~/.pan-agent/settings.json` — schema version, `provider` (closed: only `deepseek`), model, thinking and the literal `credentialSource` kind. Directory 0700, file 0600, atomic rename. Any secret-looking or endpoint key, unknown value or shape drift fails closed; a `kimi-code` provider is `provider_unavailable`, never a usable configuration. No secret is representable.
- [`src/config/keychain.ts`](../../typescript/src/config/keychain.ts): macOS `security` CLI wrapper over exact named service/account only — never enumerates. The production convention is `com.pym96.pan-agent` / `deepseek-api-key`; tests use the authorized disposable service `com.pym96.pan-agent.workorder-52-test` with a generated account. The `security` child receives a minimal explicit environment with the real user home (a redirected test HOME otherwise blocks keychain access), and the secret only through the CLI's own argv boundary, which the product never logs or retains.
- [`src/config/first-run.ts`](../../typescript/src/config/first-run.ts): interactive wizard (also `pan-agent configure`). Provider/model/thinking are closed lists; `kimi-code` renders explicitly unavailable and persists nothing; unknown values re-ask; EOF cancels explicitly. Keychain remembering requires the key plus an explicit `y`; decline writes nothing and re-asks the source; a denied/locked/failed save is an explicit error with no plaintext fallback and no false saved state.
- [`src/cli.ts`](../../typescript/src/cli.ts) composition: settings load on startup; invalid settings fail with an explicit error; explicit `--model/--thinking` flags override persisted values for that run; a TTY first run without settings offers the wizard (non-TTY or injected-adapter paths are unchanged). The `environment` source reads `DEEPSEEK_API_KEY` only inside the transport at Provider-call time; `keychain` resolves the named item only at Provider-call time. Startup prints the credential source line (`CREDENTIAL environment DEEPSEEK_API_KEY (required at task time; never saved)` or the keychain reference). No endpoint override exists on the CLI; unknown arguments fail before configuration.

## Verification assets

- [config-configure-driver.mjs](../../scripts/fixtures/preview/config-configure-driver.mjs): installed `configure` flows (environment, kimi unavailable, keychain accept) with verifier-supplied answers.
- [config-task-driver.mjs](../../scripts/fixtures/preview/config-task-driver.mjs): restart with persisted settings — asserts the resolved composition profile equals the persisted selection, the CREDENTIAL line, the four-exchange Faux task, zero Keychain calls before selection, and canary containment across terminal/settings/archive/workspace/child environment.
- [config-boundary-driver.mjs](../../scripts/fixtures/preview/config-boundary-driver.mjs): the one place the env canary may be read — the transport's `authorization: Bearer` header on the official endpoint, captured by an injected fetch before any network; missing credential is the explicit `deepseek_credential_unavailable`. This phase is intentionally unguarded because the guard correctly throws on any credential-pattern env read.
- [config-keychain-driver.mjs](../../scripts/fixtures/preview/config-keychain-driver.mjs): disposable-item accept/decline/interrupt-after-save lifecycle with signal+finally cleanup; the verifier independently re-checks the item's absence through the `security` CLI after every path.
- [verify_config_consumer.py](../../scripts/verify_config_consumer.py): full C-CONFIG-01…05 orchestrator extending the #51 packaging proof (double build, exact offline install, executable probes, closed-selection matrix incl. endpoint rejection, missing-Runbook negative, caught adversarial controls, zero meters, whole-tree canary scan).
- [demo_config.mjs](../../scripts/demo_config.mjs): Human demo — phase 1 `configure` (any Keychain write pinned to the disposable test item, removed at demo close), phase 2 restart + offline Faux task.
- [check_workorder_52_scope.py](../../scripts/check_workorder_52_scope.py): exact changed-file inventory, byte-identical protection, 117 prior + 11 added test obligations, link checks, devtools isolation, no-Kimi-endpoint scan.

## Reproduction

```bash
npm --prefix typescript ci --ignore-scripts
python3 scripts/check_workorder_52_scope.py
python3 scripts/verify_config_consumer.py \
  --node /absolute/path/to/node-v22.19.0-platform/bin/node \
  --output /absolute/path/to/new-evidence-directory
```

The Keychain phases create only the disposable item `com.pym96.pan-agent.workorder-52-test` / `test-<uuid>` and delete it on success, failure and interruption; the verifier fails closed if any residue remains. macOS denial/lock paths are covered by injected-failure unit tests and error classification; the verifier does not lock the real login keychain.

## Criterion and evidence map

| Criterion | Evidence and oracle |
|---|---|
| C-CONFIG-01 | settings bytes/mode/keys after configure; restart task driver restores exact persisted selection; CREDENTIAL line; unit roundtrip |
| C-CONFIG-02 | bin matrix (kimi-code/unknown model/invalid thinking/endpoint override all exit 2, nothing persisted); wizard kimi explicit-unavailable; parse-time rejection unit tests |
| C-CONFIG-03 | per-run synthetic canaries in parent env; zero reads until the single transport-boundary probe; header-only capture; whole-tree canary scan; Human review of canary outputs |
| C-CONFIG-04 | accept/decline/interrupt lifecycle with independent `security`-CLI cleanup verification; no enumeration; no plaintext fallback; Human review |
| C-CONFIG-05 | clean-consumer install → configure → restart → frozen Faux task → fresh replay zero-effect; zero network/credentials/fees |
| C-CONFIG-06 | scope audit output; Product/Reference/conformance/Python regressions; host outer gate; `git diff --check` |

## Honest limits

macOS + Node 22.19.0 only; TTY interaction; Kimi remains unavailable until a separately routed WorkOrder; trusted-local is not a sandbox; no real Provider credential, call, balance query or fee; no npm publication. The `security -w` argv handoff follows platform CLI practice; the secret appears briefly in that one authorized child's argument vector and is never recorded by this product or its verification evidence.
