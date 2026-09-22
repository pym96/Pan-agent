# WO76 official environment preparation (Criteria1.0)

Five fixed tasks only. No live CLI, model, real credential, oracle, formal verifier,
or task-solving command is permitted. Official files are downloaded and hashed,
never executed on the host. See [design](../../../../docs/design/terminal-bench-environments-76.md)
and [evidence](../../../../docs/evidence/terminal-bench-environments-76.md).

- `init.py`: fresh internal workspace and non-resettable 7200 s Builder / 1800 s Regulator budget.
- `budget.py`: exclusive operator lock, cumulative receipts, 5 s operational disk samples, bounded command/cleanup.
- `acquire.py`, `validate_source.py`: only manifest-listed source files; accepted broker validation.
- `registry.py`, `images.py`: anonymous Docker Hub digest/platform/config/layer metadata; arm64 preferred;
  immutable platform digest pull, local config identity; at most one explicitly transient retry.
- `preflight.py`, `preflight.mjs`, `identity.mjs`: real unchanged broker; fixed harmless command;
  dedicated logs and known-ID stop confirmation. No successful Builder restart.
- `report.py`, `environments.json`: five-row machine inventory, original configurations and asset identities.
- `live-draft.json`: unsigned, unauthorized proposal; unknown authority/window/run ID remain null.
- `test_offline.py`, `test_identity.mjs`: resource/platform/report negatives; digest/platform checks against retained inspect.

Builder acquisition has completed; do not repeat it or reset `/private/tmp/wo76-work/budget.json`.
Assets remain at `/private/tmp/wo76-work/tasks` and in Docker's image store. Raw evidence is
archived under `/Volumes/WD_BLACK/pan-agent/wo76-environments-20260922/`.

Independent Regulator may create its own workspace and perform each ready/stop check once:

```sh
python3 scripts/harbor/pilot/environment-prep/init.py --work /private/tmp/wo76-regulator-prep --limit-seconds 1800 --reuse /private/tmp/wo76-work
python3 scripts/harbor/pilot/environment-prep/preflight.py --work /private/tmp/wo76-regulator-prep
```

The controller keeps its real HOME solely so the accepted broker computes the existing Docker
socket correctly. All other environment values are allowlisted; the Python broker still receives
an isolated HOME and public-only Docker config. No proxy/DNS/TLS/global Docker setting is changed.
The initial wrong-socket failure is preserved; the successful Builder round is `preflight-r2`.

For offline checks only:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/harbor/pilot/environment-prep -p 'test_*.py' -v
node --test scripts/harbor/pilot/environment-prep/test_identity.mjs
```
