# DeepSeek Live Behavioral Eval v0 Stage A-R candidate Evidence — 2026-08-29

- Status: independently accepted WorkOrder #11 Stage A-R offline boundary on 2026-08-29; landing authorized
- Session role: Working Agent (Builder)
- Baseline: clean `main @ 140025808f87f86aa2323ad3448afc79bd7a4892`
- WorkOrder: [Issue #11 comment 5451406371](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5451406371)
- Regulator Verdict: [accepted — comment 5460686250](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5460686250)
- Candidate state: accepted substantive bytes retained unchanged for authorized landing
- Real balance queries: `0`
- Live model calls: `0`
- Paid Provider cost: `CNY 0`
- Credential reads: `0`
- Stage B and #12–#17: not started

## Candidate surface

- repaired lock and budget/persistence primitives: [`deepseek_live_campaign.py`](../../workspace_agent_harness/deepseek_live_campaign.py)
- sole production runner: [`deepseek_live_runner.py`](../../workspace_agent_harness/deepseek_live_runner.py)
- typed DeepSeek dispatch boundary: [`deepseek_live.py`](../../workspace_agent_harness/deepseek_live.py) and [`evented.py`](../../workspace_agent_harness/evented.py)
- real AgentLoop/Context/tool/evaluator composition: [`behavioral_eval.py`](../../workspace_agent_harness/behavioral_eval.py)
- default-safe entry: [`run_deepseek_live_behavioral_eval.py`](../../scripts/run_deepseek_live_behavioral_eval.py)
- focused tests: [`test_deepseek_live_runner.py`](../../tests/test_deepseek_live_runner.py) and [`test_deepseek_live_gateway.py`](../../tests/test_deepseek_live_gateway.py)
- design boundary: [`deepseek-live-budgeted-serial-runner.md`](../design/deepseek-live-budgeted-serial-runner.md)

## Old-to-new identity chain

| Material | Identity |
|---|---|
| parent Stage A lock | `sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa` |
| repaired Stage A-R lock | `sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25` |
| unchanged schedule | `sha256:ba5c11e1ca3a968970d4a04df0b228115d4daac952a6511f133229dee79d2284` |
| runner | `sha256:b11e6ef4861ffbd5b2d804895bc3d6c78c62b0951f319b1a72e5cb93dd4db7bc` |
| live entry | `sha256:a37752b350f784c8c8b4f2bca370e508acee989276e5639eb0988287a7034efb` |
| accepted #9 manifest | `sha256:026543baf0a1d48d640b695ee21c7aaab5713e75cef437024a48fb0e66f180f8` |
| #9 manifest file SHA-256 | `90f8bae80e5f4afa4fa7fb5a077709437c2f9c8b15791a1ae072a6c3864ff5a6` |
| historical #4 fixture manifest SHA-256 | `795780729dfe38c07ca9b26d987331087076406b590474b0ac7c5a87df204133` |
| locked model profile | `sha256:9bcb9f358dc6f106f93d455c4961ace1131715bf11ed2410686ab7c11cd015f8` |

The repaired bytes preserve the provider, model, thinking/high mode, prompt, native tools, cases, evaluator, Context/overflow policy, paired schedule, five repetitions, `120` Runs, `600` maximum paid calls, and `CNY 15.00` ceiling. The new lock adds parent lineage and binds the single runner and live entry.

## Retained zero-call artifact

Ignored local artifact:

```text
.runs/workorder-11-stage-a-r/zero-call-preview.json
```

- SHA-256: `c9b106edd64abf3a6ca0de3f4a91c5fe01a1e31add63bef6904e1302e1464aa1`
- bytes: `69,656`
- planned slots: `120`
- maximum paid model calls: `600`
- live model calls: `0`
- balance queries: `0`
- causal result: `null`

## Deterministic negative Evidence

All Provider and balance objects in tests are deterministic injected fakes. They spend no money and contact no network. The focused tests cover:

- default preview, help/argument gating, missing exact acknowledgement, import/construction, and duplicate identity with zero external calls;
- one high-seam 120-slot path through the production runner, actual `BehavioralEvalCampaign`, `AgentLoop`, semantic Context projector, local tools, protected evaluator, Run Event Log, inventory, and report;
- durable intent before one authorization and mandatory settlement before the next exchange;
- typed `not_dispatched`, `uncertain`, and `response_received` exception paths;
- initial and post-exchange balance failure, missing usage, response/settlement persistence failure, and slot-attempt persistence failure;
- cancellation before preflight and after a settled response;
- returned fingerprint drift and authentication/authorization/balance stops;
- three consecutive pre-candidate Provider transport failures;
- the paired runner's reachable adversarial path remains below the formal `600` ceiling, while the sole budget meter rejects authorization `601`;
- deterministic stopped/missing/skipped reconstruction with no Provider, balance, credential, or tool Adapter.

## Verification receipt

```text
Focused tests: PASS — 32 tests
Full test suite: PASS — 175 tests
mypy: PASS — 7 source files
compileall: PASS
package identity: PASS — 1 test
zero-call rebuild/hash comparison: PASS — byte-identical, 69,656 bytes,
  sha256:c9b106edd64abf3a6ca0de3f4a91c5fe01a1e31add63bef6904e1302e1464aa1
candidate credential-pattern scan: PASS
Markdown links: PASS
git diff --check: PASS
outer acceptance: PASS — 77 outer tests + 175 project tests; PASS acceptance gate
```

## Claim boundary

This accepted boundary proves only offline runner composition, deterministic stop/accounting behavior, and a zero-call execution preview. It contains no DeepSeek task result, latency, cost observation, balance observation, protocol or model-quality measurement, arm comparison, causal claim, public benchmark score, Verified Project Fact, Wiki fact, or resume fact. The independent Verdict does not authorize Stage B or promote a project/resume fact; paid execution still requires separate Human routing against the landed identity triple.
