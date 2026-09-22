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
