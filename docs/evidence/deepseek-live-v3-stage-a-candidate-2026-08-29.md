# DeepSeek live v3 Stage A candidate Evidence — 2026-08-29

- Status: independently accepted on 2026-08-29 ([Regulator Verdict](https://github.com/pym96/workspace-agent-harness/issues/19#issuecomment-5462346605)); landing authorized by the [Master route](https://github.com/pym96/workspace-agent-harness/issues/19#issuecomment-5462369180)
- Session role: Working Agent (Builder)
- Baseline: clean `main @ 92aba6e000d42d5c70fb009d539916cfb3ac1049`
- WorkOrder: [Issue #19](https://github.com/pym96/workspace-agent-harness/issues/19)
- Credential reads: `0`
- Real balance queries: `0`
- Provider/model calls: `0`
- Formal Runs: `0`
- Paid Provider cost: `CNY 0`
- Landing commit/push: authorized; live Stage B and fact promotion: not performed

## Candidate surface

- versioned Profile/Translation/Gateway: [`deepseek_live.py`](../../workspace_agent_harness/deepseek_live.py)
- v2-preserving v3 lock and zero-call composition: [`deepseek_live_campaign.py`](../../workspace_agent_harness/deepseek_live_campaign.py)
- lock-selected exact acknowledgement/report identity: [`deepseek_live_runner.py`](../../workspace_agent_harness/deepseek_live_runner.py)
- new lock: [`deepseek-live-behavioral-eval-v3.json`](../../workspace_agent_harness/benchmark_configs/deepseek-live-behavioral-eval-v3.json)
- default-safe v3 entry: [`run_deepseek_live_behavioral_eval_v3.py`](../../scripts/run_deepseek_live_behavioral_eval_v3.py)
- retained offline fixtures: [`deepseek_live_v3/manifest.json`](../../tests/fixtures/deepseek_live_v3/manifest.json)
- focused tests: [`test_deepseek_live_v3_gateway.py`](../../tests/test_deepseek_live_v3_gateway.py), [`test_deepseek_live_v3_campaign.py`](../../tests/test_deepseek_live_v3_campaign.py), and [`test_deepseek_live_v3_runner.py`](../../tests/test_deepseek_live_v3_runner.py)
- design and limitation boundary: [`deepseek-live-v3-adapter-stage-a.md`](../design/deepseek-live-v3-adapter-stage-a.md)

## Frozen identities and preservation receipts

| Material | Identity or SHA-256 |
|---|---|
| accepted v2 parent lock | `sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25` |
| accepted v2 runner / live entry | `sha256:b11e6ef4861ffbd5b2d804895bc3d6c78c62b0951f319b1a72e5cb93dd4db7bc` / `sha256:a37752b350f784c8c8b4f2bca370e508acee989276e5639eb0988287a7034efb` |
| v2 lock file SHA-256 | `1e225f5d1d053e4df8811b560fbb723563918ab15e3afdf6b67abf60d9491695` |
| v2 entry file SHA-256 | `07ff9635eacbfbaac883f88d248286165ef515edbf2d268d99e05b5ce2b04cd3` |
| accepted v2 terminal Evidence SHA-256 | `1b4e978de901c48901c7429ea39fc696463c441a5cd346922631290e9e868520` |
| #18 learning artifact SHA-256 | `b4ed702ea7caa16ccdcd038a8703d5970e17aa35eac6e2d578632d2fbb5558aa` |
| v3 lock / file SHA-256 | `sha256:cbc23aaf211a02a492c147f40dcad7b017888ba96d68b030cadbcf87d337a5f4` / `b15f153017213e7381bf20778ddef430453474575fd34b59d35e74243228ea2f` |
| v3 ModelProfile | `sha256:6400c7459d000d14b46e9852e9cf2f07b9a01b55bb031ed4ba5c96b5420dd625` |
| v3 schedule | `sha256:a6117889500855b608337bd6e6b401c294e2c4808bd554bb021dc5a6a9dc05c6` |
| v3 runner / live entry | `sha256:3878dbcadd0a909e23091477cb2c178d8f7957b1f9530f4e878f615d3f68d1b6` / `sha256:bd7680a0cdb6496ee058cabfce223199038bcceea51a3c2dd90ef007dac16c74` |
| v3 fixture manifest SHA-256 | `e7da6099c4628054db2afcac40c2fb36307f11db12df17d67726e787fbd691f2` |
| v3 entry file SHA-256 | `496ec1cc40c90bd7a36cb2b745dc5c711d0d79b274e14065b2cb8276e479c1d9` |

## Deterministic negative Evidence

Offline retained fixtures and injected fail-on-use Adapters cover:

- exact omission of the `tool_choice` key while model, endpoint, Thinking, reasoning effort, output setting, stream mode, and tools remain equal to v2;
- one native action call, typed `complete`, typed `abstain`, and ordinary non-empty final content;
- usage, timing, request/response identity, returned model/fingerprint, response ID, finish reason, and restricted-reasoning attribution;
- complete native call/result and non-tool assistant reasoning replay without synthetic observation-as-user history;
- empty/malformed final content; missing, empty, or malformed reasoning; content/tool conflicts; zero/multiple/malformed/unknown/reused calls; schema errors; `length`; invalid finish reasons; HTTP errors; request identity mutation; and canonical history mismatch;
- zero admitted tool effects for a malformed/terminal response path and no restricted reasoning in the retained Runtime event log;
- exact 120-slot schedule equivalence apart from the deliberately changed Translation/slot identity, plus unchanged `600`-exchange and `CNY 15` ceilings;
- rejection of the v2 acknowledgement before credential/network access and a cancelled exact-v3 runner using fail-on-use balance/Gateway objects with `0` external operations.

## Retained zero-call preview

Ignored artifact: `.runs/workorder-19-v3-stage-a/zero-call-preview.json`

- SHA-256: `5afb0dde00efb962f538e7418f002ef858f99460afefeb2f3f966e1bf4f2ee89`
- bytes: `70,930`
- planned slots: `120`
- maximum paid exchanges: `600`
- formal Runs started: `0`
- live model calls: `0`
- balance queries: `0`
- cost: `CNY 0`
- causal result: `null`

## Verification receipt

```text
Focused v2 + v3 Gateway/Adapter/Campaign/Runner tests: PASS — 46 tests
Full project suite: PASS — 189 tests
mypy --follow-imports=skip: PASS — 6 source/entry files
compileall: PASS
package identity: PASS — 1 test
v3 lock, fixture-manifest, v2-preservation and semantic-drift checks: PASS
zero-call preview rebuild: PASS — byte-identical, 70,930 bytes,
  sha256:5afb0dde00efb962f538e7418f002ef858f99460afefeb2f3f966e1bf4f2ee89
candidate Markdown links/paths: PASS — 9 files
candidate credential/private-path scan: PASS — no key-shaped or private-path material
git diff --check: PASS
outer acceptance: PASS — 77 outer tests + 189 project tests; PASS acceptance gate
```

The full suite emitted an existing `ResourceWarning` from the independent evaluator process-group negative probe while still passing; WorkOrder #19 introduced no subprocess lifecycle or evaluator change.

## Claim boundary

This candidate proves only deterministic offline v3 mapping and preflight composition. It contains no evidence that DeepSeek accepts omission/default tool choice, calls a tool, completes a live multi-turn exchange, or produces a Behavioral Eval task/arm result. It is not a persistent Provider fact, benchmark result, Verified Project Fact, Wiki update, resume fact, or Stage B authorization.
