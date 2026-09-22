# WO74 Harbor zero-model control

Only the public official `hello-world` development example is permitted. This is
not a Terminal-Bench result or evidence of model ability. No provider is loaded;
Pan's FauxModelAdapter reports explicitly synthetic zero usage.

- `adapter.py`: Harbor BaseAgent, JSON-lines bridge to the installed Pan Session.
- `session.mjs`: GeneralAgentSession/FauxModelAdapter/RunArchiveStore consumer.
- `runner.py`: serial control, configuration audit, official verifier, terminal records.
- `resources.py`: preflight and five-second sampling, 24 GiB increment / 60 GiB free floor.
- `requirements.lock`, `identity.json`: minimal Python import closure, official input identities.
- `test_adapter.py`: reward and configuration negative controls.

See [design](../../docs/design/harbor-adapter.md) for repeatable commands and
[evidence](../../docs/evidence/harbor-adapter-74.md) for actual outcomes and failures.

## Criteria1.1 repair

- `prepare.py` / `prepare.sh`: bounded dependency-only derived image; official
  HTTPS apt source, public CA bootstrap, official curl/uv and cached pytest.
- `scoring.py` / `test_verifier.py`: require actual execution of both official
  tests; distinguish infrastructure errors from a valid missing-file negative.
- The runner now requires `--prepared PATH/prepared.json`, matching the image ID.
  It checks a clean start and keeps the original 120-second verifier limit.

- `preparation-identity.json`: both Criteria1.1 failed rounds and cumulative
  resource/evidence identities; **no successful derived image** is recorded.
- `test_preparation.py`: overlapping timeout/SIGTERM cleanup regressions.
  Two-round allowance is exhausted; further online preparation needs a new contract.

## Criteria1.2 continuation (blocked)

- `prepare_prefetched.py`: 600 s work phase, separate <=60 s cleanup, actual
  owned-container timeout probe; use a 660 s resource supervisor ceiling.
- `prepare-prefetched.sh`: retained failed dependency-only local repository
  reconstruction; apt requests compressed indexes absent from this layout.
- `prefetch-identity.json`: controller downloads/cache authentication, one failed
  installation, actual cleanup receipts and unchanged cumulative baseline.
- `test_adapter.py`: also checks the exact public dependency environment values.

No successful image or controls were produced. Do not start another preparation
round from these commands without a new explicit contract. Acquisition scripts,
raw manifests and downloaded public dependencies remain in the external bundle.
