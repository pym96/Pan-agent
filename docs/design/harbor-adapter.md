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
