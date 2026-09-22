## Current continuation: Criteria1.2

One controller-side prefetch scheme was attempted under
[Criteria1.2](https://github.com/pym96/Pan-agent/issues/74#issuecomment-5773455758).
It is now **blocked**, not a reusable verified recipe. See the current
[evidence](../evidence/harbor-adapter-74.md) and
[prefetch identity](../../scripts/harbor/prefetch-identity.json).
The old two rounds remain exhausted; this failed new scheme does not authorize
another preparation attempt.

`prepare_prefetched.py` takes `--input` (verified dependency bundle) and a fresh
`--output`. It records a real 1 s work-timeout probe, then creates a separate
1 CPU/2048 MiB original-base container with no mounts. The work budget is 600 s;
cleanup has a separate <=60 s allowance. Invoke through the cumulative
`resources.py` supervisor with a 660 s ceiling, never the old coincident 600 s
outer deadline. Download acquisition scripts/raw receipts are retained in the
external evidence bundle; no downloaded Linux binary runs on the host.

`prepare-prefetched.sh` authenticates cached Ubuntu InRelease -> Packages -> deb
bytes before attempting a signed local apt update. Its retained attempted
layout lacks the compressed indexes requested by apt, so update fails closed.
Later steps (not reached) would configure real curl's timeouts, exercise the
actual remote installer URL, and use the installer's supported `UV_DOWNLOAD_URL`
for the prefetched Linux archive. No curl/uvx wrapper or official verifier edit
is introduced. This local cache adaptation is specific to the public example,
not established formal Terminal-Bench operating conditions.

The prospective image environment is restricted to exact public values
`UV_DOWNLOAD_URL=file:///opt/wo74`, `UV_PYTHON_PREFERENCE=only-system`,
`UV_OFFLINE=1`, and `UV_FIND_LINKS=/opt/wo74/wheels`. Runner audit rejects other
values; this gate was checked offline only. There is no `prepared.json`, image
ID, or authorization to start controls from the failed container. Original
agent/verifier 120 s, bridge 1 s and cancellation <=30 s constraints stand.

### Historical Criteria1.1 design (not new execution authority)

## Current continuation: Criteria1.1

The original design below remains historical context. Criteria1.1 permits a
bounded dependency-only image derived from the original fixed image. Official
hello-world inputs/tests/scoring/time limits and installed Pan/Harbor identities
remain unchanged. `prepare.py --round 1|2 --output NEW_PATH --ca-bundle PUBLIC_PEM`
runs under the existing cumulative resource launcher, with `--timeout 600`.
Never run more than two preparation plans or repeat a positive/negative control
within a plan. A failed dependency preflight does not authorize task execution.

The bootstrap PEM is the public trust-root bundle from the already pinned
certifi Python dependency, not a credential. Only official apt transport changes
to HTTPS. apt signatures and TLS verification stay enabled. Preparation installs
ca-certificates/curl, the official uv 0.9.7 installer, and caches the exact official
`uvx --with pytest==8.4.1 --with pytest-json-ctrf==0.3.5 pytest --version` environment.
No tests/solution/instruction files enter preparation; `/app` must stay empty and
no hello.txt, reward, tests or pytest run cache may be present at image creation.

The resulting `prepared.json` records the image ID, base ID, script/public CA
hashes and successful preflight. Pass it to every fresh control as `--prepared`.
The runner rejects image mismatches and preexisting output/test files. Positive
and negative controls use the same digest; tests are uploaded only after Pan ends.
Scoring now requires the two official tests in CTRF with actual expected statuses
and, for the negative, the missing-file failure evidence. Raw official reward is
never rewritten. Dependency/network/collection failures are infrastructure errors,
including official reward=0 with no executed tests. Final-image timeout/cancel
controls retain the full original boundary checks and separate high-risk review.

# Pan external Harbor adapter — candidate #74

Criteria1.0, accepted base `3d42cc22df25a6d34cbc5bdc18edde47a1180119`.
Only `scripts/harbor` implements this evaluation adapter; Product core is unchanged.

Harbor's `BaseAgent.run(instruction, environment, context)` launches the installed
Pan public entry in a Node child. JSON-lines carries one tool's requests and real
BaseEnvironment results. The instruction enters `GeneralAgentSession.runTask`;
FauxModelAdapter supplies prescribed commands, while NativeKernel owns the loop.
RunArchiveStore seals the trace. No trusted-local tools, provider adapters or
model SDKs are registered. The host-side Node/Python processes receive a fresh
allowlisted environment, a dedicated HOME and credential-free Docker config.

The command schema contains only command and deadline. Destination is the
controller-bound BaseEnvironment, with an immutable container ID retained for
inspection. Neither arguments nor command text select a host executor or another
container. This is a limited routing/configuration claim, not adversarial security.
On timeout/cancel, stop the whole task container, then inspect Running=false and
Pid=0. This intentionally makes that environment unusable for further task work.
Cancel is requested through Pan only after the sleep command's child PID marker
has been observed. Normal nonzero exit is a tool error; Pan `completed` alone is
not task success. Only official verifier reward determines task success.

Each control has a fresh container, with only its verifier log directory mounted.
Positive and negative controls use the original task and verifier files. An
external image selector supplies the prebuilt official Dockerfile image; neither
task.toml nor Dockerfile is edited. The Ubuntu FROM is fixed using BuildKit named
context at the recorded digest. An image ID selects the exact locally built image
for every control. All controls run serially, with official 600/120/120 limits.

## Reproduction

Use a clean candidate checkout, Python 3.12+, Node >=22.19 and local Docker Desktop.
Create a new external work directory. Never reuse existing output/control names.
All installation, build and run commands must pass through `resources.py`; it
creates its persistent baseline before activity, checks available space and tracks
Docker.raw allocated blocks plus owned work files. Set `WO74_DOCKER_RAW` when the
Docker Desktop disk is at another **internal-disk** path. The sampling policy is
an operational guard, not a hard filesystem quota or exact per-process accounting.

The exact source and archive hash are in `identity.json`. Download
`https://github.com/harbor-framework/harbor/archive/f9deaca7f44ab0b91f1dd445d79629e4d97a0716.tar.gz`,
verify its hash, and extract only `src/`, `README.md`, `LICENSE`, `pyproject.toml`,
and `examples/tasks/hello-world/` into WORK/harbor. No task collection is installed.
The original archive can be retained externally. Install Harbor with `--no-deps`
after installing `requirements.lock` and `uv_build==0.8.24`, then use
`pip install --no-deps --no-build-isolation WORK/harbor`. The minimal closure is
intentional: general Harbor CLI/cloud/model integrations are outside this adapter.

Archive the fixed Pan base's `typescript/` into WORK (not a source import):
`git archive 3d42cc22df25a6d34cbc5bdc18edde47a1180119 typescript`.
In that extracted directory run `npm ci --ignore-scripts` then `npm pack`.
Install the tarball using `npm install --ignore-scripts --omit=dev --prefix WORK/consumer TARBALL`.
Check the packed SHA256 against identity.json; adapter entry must be
`WORK/consumer/node_modules/pan-agent/dist/index.js`.

On macOS, WORK/docker-config/config.json needs only
`{"cliPluginsExtraDirs":["/Applications/Docker.app/Contents/Resources/cli-plugins"]}`.
Do not copy the user's Docker configuration or credentials. Resource launcher
sets DOCKER_HOST to the local Docker Desktop socket; the socket is never mounted.

Build the untouched official environment (wrapped by the resource launcher):

```sh
docker build --build-context ubuntu:24.04=docker-image://ubuntu@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3 --iidfile WORK/image-id.txt --tag wo74/hello-world:control WORK/harbor/examples/tasks/hello-world/environment
```

Then for each of `positive`, `negative`, `timeout`, `cancel`, **serially**:

```sh
python3 scripts/harbor/resources.py --work WORK --name MODE-1 --timeout 800 \
  WORK/venv/bin/python scripts/harbor/runner.py \
  --harbor WORK/harbor --entry WORK/consumer/node_modules/pan-agent/dist/index.js \
  --image sha256:BUILT_IMAGE_ID --output WORK/controls-1 --mode MODE
```

Use absolute paths in place of WORK and the digest from image-id.txt. Record the
new build's digest rather than assuming bit-for-bit layer reproduction. The fixed
Ubuntu digest and untouched official Dockerfile define the repeatable input.

```sh
WORK/venv/bin/python -m unittest discover -s scripts/harbor -v
```

Logs and stopped containers are retained on failure. Cleanup only the IDs in this
run's configuration/owned records; never global prune. Model usage is synthetic
zero. Agent/verifier errors remain errors, missing/invalid rewards are evaluation
errors, and failed attempts stay visible. Dependency downloads during official
verification use network and count against the official timeout; they are not
silently retried or moved outside that bound.

## Sources and scope

The [fixed Harbor source](https://github.com/harbor-framework/harbor/tree/f9deaca7f44ab0b91f1dd445d79629e4d97a0716)
is authoritative over the moving [external-agent documentation](https://docs.harborframework.com/core-concepts/agents/custom-agents)
and [verifier documentation](https://docs.harborframework.com/core-concepts/tasks/verifier).
These sources specify the integration seam; this candidate does not promote any
new [Verified Project Fact](../evidence/verified-project-facts.md). Root
SOURCE_OF_TRUTH updates remain with Master because #74's allowed write scope
excludes that file.

### Criteria1.1 second preparation plan

`--round 2` selects `prepare-round2.sh`: the same Ubuntu archive signatures and
suites/components via the [TUNA Ubuntu Ports HTTPS mirror](https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu-ports/),
plus the system Python needed by pytest. The task-only Docker apt cache cleanup
hook is removed so downloaded packages remain cached. The official curl/uv
binaries and verifier script are not wrapped or replaced. `only-system` applies
only to the dependency prefetch command, avoiding a redundant managed Python
download; the official verifier command is unchanged. The preparation controller
checks an independent host canary and the container-side same-path canary before
and after preparation, then removes the container canary before image creation.

Invocation used for the continuation (one invocation per authorized round):

```sh
python3 scripts/harbor/resources.py --work /private/tmp/wo74-work \
  --name v11-prepare-round2 --timeout 600 \
  /private/tmp/wo74-work/venv/bin/python scripts/harbor/prepare.py \
  --round 2 --output /private/tmp/wo74-work/v11/preparation-2 \
  --ca-bundle /private/tmp/wo74-work/venv/lib/python3.12/site-packages/certifi/cacert.pem
```

For independent reproduction, substitute a new internal-disk WORK directory,
reuse the fixed inputs after verifying their hashes, and retain that process's
own preparation/attempt records. Builder's two-round authorization does not reset
when a directory name changes. A `prepared.json` exists only after successful
preflight and image commit. If neither round produces one, do not run controls.
Missing/unavailable new-image cancellation and reward evidence remains explicit.
