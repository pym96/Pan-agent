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

## Current Criteria1.3

- `check-local-apt-uris.sh` / `test_indexes.py`: detect missing advertised apt
  indexes before installation, including the retained Packages.gz regression.
- `prepare-prefetched.sh`: authenticated uncompressed indexes, signed empty
  index reconstruction, actual official installer and cached uvx preflight.
- `prepare_prefetched.py` / `test_preparation_budget.py`: cumulative1800s ledger,
  min(600s, remaining) work phases and separate bounded cleanup.
- `criteria13-identity.json`: successful image and one valid positive/negative
  pair plus actual final-image timeout/cancel controls; independent review pending.

Old source snapshots, failures and resource receipts remain in external evidence.
Original official tests/scoring and Pan core are unchanged. The final control
allowance is consumed; candidate SHA Handoff defines the independent review step.

## WO75 offline pilot preparation

The separate [pilot entry](pilot/README.md) selects the fixed Terminal-Bench five
and exercises installed Pan/Kimi with fake transport and environment. It has no
live authorization; Criteria1.1 resolves SC-TBP-75-01 only for the original visible test. WO74 control code and old
identity/evidence records remain unchanged.

- [WO96 full89 campaign CLI and offline demonstration](pilot/README.md#wo96-frozen-full89-workflow): persistent task reservation, fresh signed segments and unstarted-only continuation; [design](../../docs/design/terminal-bench-full-campaign.md). No live activation is granted by this documentation.
