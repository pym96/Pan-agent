# DeepSeek Live Behavioral Eval v0 Stage A candidate Evidence — 2026-08-28

- Status: Working Agent candidate; pending independent WorkOrder #11 Regulator review
- Session role: Working Agent (Builder)
- Authorized baseline: clean `main @ a4495ba1d2b906b480628a6dda42d8d278850cfb`
- Current local anchor: `main @ df171f02f76b79713f4c4e3367904211e096c6d8`; the two intervening commits after the authorized baseline modify only `wiki/` and do not overlap this candidate
- WorkOrder: [GitHub Issue #11](https://github.com/pym96/workspace-agent-harness/issues/11), Stage A Agent Brief comment `5448500630`
- Live model calls: `0`
- Live balance queries: `0`
- Paid Provider cost: `CNY 0`
- Stage B, #12–#16, fact/Wiki/resume/PDF promotion: not started

## Candidate surface

- DeepSeek Translation/Gateway: [`deepseek_live.py`](../../workspace_agent_harness/deepseek_live.py)
- campaign lock/budget/reconstruction: [`deepseek_live_campaign.py`](../../workspace_agent_harness/deepseek_live_campaign.py)
- frozen 120-slot lock: [`deepseek-live-behavioral-eval-v0.json`](../../workspace_agent_harness/benchmark_configs/deepseek-live-behavioral-eval-v0.json)
- zero-call entry point: [`dry_run_deepseek_live_behavioral_eval.py`](../../scripts/dry_run_deepseek_live_behavioral_eval.py)
- focused tests: [`test_deepseek_live_gateway.py`](../../tests/test_deepseek_live_gateway.py) and [`test_deepseek_live_campaign.py`](../../tests/test_deepseek_live_campaign.py)
- design boundary: [`deepseek-live-behavioral-eval-stage-a.md`](../design/deepseek-live-behavioral-eval-stage-a.md)

The candidate also makes narrow, backward-compatible changes to `evented.py` and `behavioral_eval.py`: Provider provenance/restricted reasoning can cross the live Gateway without entering public events, the accepted `act-once-v0` policy stops after one retained tool result, and the campaign can inject a live Context projector and Gateway. Defaults preserve existing deterministic behavior and historical event bytes.

## Frozen identities and denominator

| Material | Identity |
|---|---|
| Stage A lock | `sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa` |
| 120-slot schedule | `sha256:ba5c11e1ca3a968970d4a04df0b228115d4daac952a6511f133229dee79d2284` |
| accepted #9 manifest | `sha256:026543baf0a1d48d640b695ee21c7aaab5713e75cef437024a48fb0e66f180f8` |
| #9 manifest file SHA-256 | `90f8bae80e5f4afa4fa7fb5a077709437c2f9c8b15791a1ae072a6c3864ff5a6` |
| historical #4 fixture manifest SHA-256 | `795780729dfe38c07ca9b26d987331087076406b590474b0ac7c5a87df204133` |
| locked model profile | `sha256:9bcb9f358dc6f106f93d455c4961ace1131715bf11ed2410686ab7c11cd015f8` |

The schedule contains `120 planned`, `60 observation-feedback-v0`, and `60 act-once-v0` slots. Maximum authorization is five calls per slot, 600 calls total, and CNY 15.00 total observed balance expenditure. These are ceilings, not planned consumption or observed results.

## Retained zero-call artifact

Ignored local artifact:

```text
.runs/workorder-11-stage-a/zero-call-dry-run.json
```

- SHA-256: `c60fdd99063c4b0b31697ac08270d0ba33ae1ed097137125df0eb990b4cbb414`
- bytes: `69,361`
- planned slots: `120`
- maximum paid model calls: `600`
- formal token envelope: `369,600,000 input / 230,400,000 output / 600,000,000 combined`
- live model calls: `0`
- balance queries: `0`
- causal result: `null`

Reproduction command:

```bash
PYTHONPATH=. python3 scripts/dry_run_deepseek_live_behavioral_eval.py \
  --output .runs/workorder-11-stage-a/zero-call-dry-run.json
```

The path is exclusive and already occupied by the retained candidate. A reviewer must use a new output path or compare against the retained bytes; the script refuses overwrite.

## Focused negative evidence

The deterministic tests use in-memory transports and prove:

- construction of Chat and Balance HTTP Adapters performs zero I/O;
- the stable request has native closed schemas, required tool choice, thinking/high effort, no sampling fields, and no beta-only strict flag;
- native assistant tool call, restricted `reasoning_content`, and paired tool result round-trip in separate carriers;
- restricted reasoning is absent from canonical executable arguments, Event Log bytes, and all TUI projections;
- incomplete, missing-reasoning, multiple-action, unknown-action, schema-invalid, and reused-correlation responses fail closed;
- a malformed first exchange produces no tool sequence/effect;
- HTTP 400 Context-length evidence is classified as Context overflow rather than generic protocol failure;
- exact response bytes and secret-free request material are retained separately from credentials;
- exact balance-response bytes are retained before parsing and bound to secret-free receipt identities;
- initial/high/unavailable balance, balance decrease beyond locked worst-case peak usage plus one-cent granularity, and returned-model/fingerprint drift stop the meter;
- usage is complete, internally consistent, and accumulated once;
- lock drift fails even if its embedded content hash is recomputed;
- stopped campaign reconstruction preserves the entire locked denominator.

## Verification receipt

```text
PYTHONPATH=. python3 -m unittest \
  tests.test_deepseek_live_gateway \
  tests.test_deepseek_live_campaign -v
16 tests: PASS

PYTHONPATH=. python3 -m unittest discover -s tests -p 'test_*.py' -v
159 tests: PASS

mypy --follow-imports=skip \
  workspace_agent_harness/deepseek_live.py \
  workspace_agent_harness/deepseek_live_campaign.py \
  workspace_agent_harness/evented.py \
  workspace_agent_harness/behavioral_eval.py \
  scripts/dry_run_deepseek_live_behavioral_eval.py
Success: no issues found in 5 source files

PYTHONPATH=. python3 -m compileall -q workspace_agent_harness scripts tests
PASS

python3 -m unittest tests.test_package_identity -v
1 test: PASS

local Markdown link/path check
PASS

zero-call artifact rebuild and byte comparison
PASS; SHA-256 c60fdd99063c4b0b31697ac08270d0ba33ae1ed097137125df0eb990b4cbb414

Stage A credential-pattern scan, including ignored zero-call artifact
PASS (no key-shaped material)

git diff --check
PASS

bash 80-监管与验收/自动检查/run_acceptance.sh
BLOCK before host/project tests: external validator still pins a4495ba,
while two non-overlapping Wiki-only commits moved local HEAD to df171f0
```

The outer pin mismatch is outside WorkOrder #11's allowed files and was not rewritten by the Builder. The complete project suite was therefore run directly and passed. Passing Builder checks does not grant independent acceptance.

## Claim boundary

This Evidence proves only the deterministic Stage A implementation and zero-call plan. It contains no observation of DeepSeek task behavior, protocol reliability, comparative Loop Policy performance, cost, latency, or benchmark quality. No causal headline is available until an independently authorized and governed Stage B completes the locked denominator or reports an explicit incomplete result.
