# Criteria1.7 — repaired handoff and fresh complete demonstration

Builder submission for independent review, not a Verdict. Contract: [Criteria1.7](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6208230277). Executed adapter SHA `71d7582365943a811784d9a345c241c4a8bc62fd`; later candidate changes add only evidence/media documentation. [Repair and offline negatives](HARBOR-REPAIR.md), [previous failure](HARBOR-ATTEMPT.md), [new manifest](harbor-completed-manifest.json).

## Identity and original result

Fresh execution `bca1c272-72bf-4f9c-93fa-4da6bead62e6`, run `14386b01-4934-4e58-b981-615bc60d341c`; binding SHA256 `25e4e5365e26dd6891447621e165e984b75b115c2b5c40cc901621ba345a0d19`. [Master activation](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6208479356). Receipt records single consumption. No retry or new live call after this attempt.

Original Verifier returned reward 1.0, CTRF seven passed, zero failed, matching original test stdout. Retained original `/app` task environment was verified after agent stop, then container `140f63a71549` stopped (Running false, Pid 0) and removed at 2026-10-16T05:11:11.585Z. Broker, relay and recorder finished; recorder exit 0. Detailed timestamps are in `live/run/controller.jsonl` and `live/server-evidence/lifecycle.jsonl`.

Six model turns, five executed tools, one natural tool error. Usage from recorded model-usage events: input 20,461, output 1,547, total 22,008; zero unknown turns. Phase durations subtract respective phase-start and phase-completion timestamps: agent 51.516 seconds, verifier 380.538 seconds. Five bound per-request automatic approvals report 0 ms at Date.now resolution; this is not a claim of physically zero latency. Limits remain 900 seconds per phase and inherited 64 rounds.

Published package SHA256 `28c20fe51a2d99f8a03d635c6ba373fc6fdf6e81032ad0985769777afe77596a`; no runtime changes. Original image digest `sha256:0e33ea5ec823975d1bd6c3778395c9f94251dd88f571146057bff6adb7e4594e`; Harbor source `f9deaca7f44ab0b91f1dd445d79629e4d97a0716`, archive SHA256 `c7c3454798b41d7e0578b6cb2ae1f2578af41635ff18bc7f4b0e386ce1bdcac2`. Binding inventories local and remote files, including original task/test bytes. No oracle exposed to the model. Integration uses DockerEnvironment + Verifier APIs, not stock CLI/Trial.

## Evidence and media checks

Manifest covers live/replay PTY captures, sealed archive, consumed activation, original reward/CTRF/stdout, container lifecycle, preparation negatives, accounting, edit map and final media. Durable private review root is supplied in Handoff. Replay guard measured provider/tool/network 0/0/0; archive bytes unchanged. The replay recorder's `settled:false` describes replay mode, not a new failed task.

Final MP4: 151.5 seconds, 1920×1080, 10 fps, 2,413,024 bytes; SHA256 `763106540f32a7e4b90c10d3668bc4d2d5e49f117ea1ff6280c284e9f328ea58`.
SRT SHA256 `1478a632fa730acb7a9a25c59aa7ac42dc6eb91154b41011f9d36d87c4b6e3dc`.
All 15 SRT blocks match the renderer's caption source. Visual inspection checked Chinese glyphs, readable result/cleanup and non-overlapping captions; exact source timestamps/crops/speed/holds are in the edit map. Public footage shows generic disposable paths, not credentials or provider private reasoning. [User-facing recording details](../../demo/tui-release56/HARBOR-DEMO.md).

## Learning record (§17–18)

Human requested a complete evaluation flow. The first adapter treated watchdog cancellation as a reason to destroy the broker before verification; 678.650 seconds of manual approval waiting also consumed most of that run's budget. The failure does not establish that the model needs over 900 seconds. Parent authorized a narrow external-launcher repair, Builder separated agent stop from environment lifetime and added typed container-bound Allow-once handling. Offline probes demonstrated stop-before-verifier ordering, rejection after revocation, and unchanged original tests failing on an unrecovered fixture. Runtime authority checks were retained.

Dependency preflight also failed twice: direct download stalled, then a verifier proxy wrapper mishandled `env=None`; both attempts and cleanup remain recorded. The corrected temporary container-only relay allowed the original verifier to finish without changing tests. A new independently bound demonstration then passed. These two runs differ in orchestration and model trajectory; no causal model-speed improvement is claimed. Model solved the task, Builder implemented/recorded the adapter, Master authorized scope; independent Regulator determines acceptance. Prior failure remains unscored, historical benchmark totals unchanged, no resume fact promotion.
