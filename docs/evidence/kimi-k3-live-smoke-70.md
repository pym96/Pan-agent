# #70 Kimi K3 live smoke — Builder candidate evidence

Criteria-Version: **1.0**. Pending independent Regulator review; this report is not a Verdict or project/resume fact.

## Authority and identities

[Contract](https://github.com/pym96/Pan-agent/issues/70#issuecomment-5754779773), [Human authorization](https://github.com/pym96/Pan-agent/issues/70#issuecomment-5754794476), and [effective activation](https://github.com/pym96/Pan-agent/issues/70#issuecomment-5754799094) authorize one attempt. Human explicitly assigned this session Working Agent (Builder), solely #70, after the initial read-only RoleMismatch. The prior Builder preparation was retained; no prior live invocation or occupied run directory was observed.

Executed clean runner: `aa1c8de5364ac6cb7676b8c42fd98804f0ec29ad`, branch `workorder/70-candidate`, checkout `/private/tmp/pan-wo70-builder`. Evidence candidate SHA is separately bound by the final Handoff. Product source: `c9fd25d7337ae9426c22b2829e365451b237d2e6`; Node `v22.19.0`.

| Binding | SHA256 |
| --- | --- |
| Activation | `b38dd6d972aed407f79b79714a7bbb2785a16ee72092292563406722893b2ea5` |
| run.mjs | `3c755e8bf8ed58b57b70492d79f0c5f266d121ad8f0f8850e76810459def7bc9` |
| guard.mjs | `9243f2fc1b0144b22d98333f8643fd0743bdef133df876b9bd147d6729d8ec8c` |
| lock.json | `792cd71df58ca873eef320282e6242e70e8bbc1557fc6d16ee08ad5f0b6941e6` |
| Product tarball | `98b190d97cce81a53706c0766dd94626c6a406f4b291764bfb919e2c70da345f` |
| Normalized installed runtime | `6d9b75058698a2db046af1ea0462313ae4fce0c9b7118a97708d239df8c57f6b` |

Window: `2026-09-21T02:56:57Z` through strictly before `2026-09-22T02:56:57Z`. Exact preflight/start/end UTC are retained in the primary bundle. Execution ended `2026-09-21T03:18:20.917465+00:00`, after 11.918265791999147 seconds of launcher elapsed time. The runner terminal measured 11727.325583 ms. These measure different boundaries.

## Original outcome

One CLI invocation, exit **0**, empty stderr. The unchanged runner reports `evidence_complete=true`, `oracle_met=true`, `smoke_success=true`, `live_compatibility_demonstrated=true`; terminal `completed`, stop `null`, archive sealed. First response had no intermediate commentary; one `get_smoke_fixture({})` returned `PAN_K3_SMOKE_OK_20260921`, and the second response contained exactly that marker. No retry, fallback, resume, reset, extra account/quota/balance call or new payment was performed.

| Dispatch | HTTP | Request bytes | Response bytes | Reported model | Input | Output | Cache read | Total tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 200 | 695 | 8968 | k3-256k | 262 | 69 | 0 | 331 |
| 2 | 200 | 1114 | 6411 | k3-256k | 371 | 38 | 0 | 409 |

Two durable reservations, two upstream dispatch attempts, one tool execution. Requested profile: `k3-256k`, high reasoning, native kernel, `max_tokens=4096`; fixed endpoint and 131072/524288 byte, 120000/300000 ms limits unchanged. Membership quota consumption and monetary allocation remain **unknown**. Requested max_tokens is not a proven provider quota ceiling. This single observed interaction does not establish general compatibility, model quality, benchmark performance, entitlement or an offer/resume claim.

## Primary evidence and reproduction

Bundle: `/Volumes/WD_BLACK/pan-agent/wo70-kimi-live-smoke-20260921/`.

- `preparation.json`, `offline-install.log`, `runtime-files.json`: prior offline preparation, retained unchanged.
- `authority.json`, `contract.md`, `activation.json`: published authority. Latest GitHub comments and ready label were also read before admission.
- `preflight.json`, `invocation-started.json`, `execution.json`, `wo70-once.py`: exact paths, hashes, clean SHA, clock, single-start guard, command, original exit and timing. Live child environment names were only `PATH` and `KIMI_API_KEY`; no credential value was printed or retained.
- `live.stdout`, `live.stderr`: finite original process output.
- `ledger-copy/`: byte-identical copy of the original fixed ledger; the original remains at `/Users/panyiming/.local/state/pan-agent/kimi-smoke-ledger/6f799fcd-24da-4faa-ac5e-4041acb0dcf1`. Identity remains consumed permanently.
- `reconstructed.json`, `offline-review.json`: zero-network report equality, 13 ledger records and 9 archive records reviewed, archive hash chain verified, copy hashes checked. No actual secret was read to build a leak-scanning oracle.
- `primary-manifest.json`: retained primary file hashes, SHA256 `916a2ebe77faa97bb23b138bb8c457acff2419f82912f6152035e4d7d33ec16c`. AppleDouble metadata sidecars are distinguished from runner evidence.

| Primary artifact | SHA256 |
| --- | --- |
| Original records.jsonl | `00aff64d6e8e1b5ee826b556386c7abcf09989d98d8284dfc6f55034f5ef0ed2` |
| Original report.json | `03cc19b4bf7fb36975d023d4ee25f0716ab7c7b43451ee62ff186c5e2f4a930c` |
| Archive events.jsonl | `46357a7674fd3cdc785d01341375962141e58f606724b6bdc45addbdb1ac7dc0` |
| Archive manifest.json | `57096dbed39163bcea486a5dfe78fbf36292bbb2ad04d68fc2fef7158c76da8f` |

Canonical archive run ID `80821ca6-9425-4d90-ac07-bee1d77c2f41` differs from the activation consumption ID by design. Never use either identity to launch another attempt.

Original invocation (record only; **do not rerun**):

```sh
/private/tmp/wo68-regulator-20260920/node-v22.19.0-darwin-arm64/bin/node scripts/kimi-smoke/run.mjs live /Volumes/WD_BLACK/pan-agent/wo70-kimi-live-smoke-20260921/activation.json /private/tmp/wo70-consumer/node_modules/pan-agent /private/tmp/wo70-consumer/pan.tgz
```

Safe offline reconstruction from the unchanged runner:

```sh
node scripts/kimi-smoke/run.mjs report /Users/panyiming/.local/state/pan-agent/kimi-smoke-ledger/6f799fcd-24da-4faa-ac5e-4041acb0dcf1/records.jsonl
```

## Checks and handoff boundary

Builder reconstruction equals original report and stdout; original/copy digests and archive chain agree. Reviewed canonical text is restricted to empty first response and the fixed tool/final marker; no raw wire, private reasoning, error body or credential was captured. This is Builder inspection, not independent C-KLIVE70-04 acceptance.

Unchanged Stage A code/package identities permit reuse of [#69 final accepted review](https://github.com/pym96/Pan-agent/issues/69#issuecomment-5754754836), including the named Human budget/leak reviews and unchanged Product/Reference/Python/PTY evidence. No implementation or dependency changed. Candidate-bound unchanged host checks, original root-extras BLOCK, isolated result, scope/links and final artifact hashes are supplied in the external Handoff after commit; no live call is part of those checks.

Only this report and the evidence README index are tracked changes. Host SOURCE_OF_TRUTH navigation belongs to Master under the WorkOrder's explicit scope; this candidate requests Master to link this pending evidence without fact promotion. Independent Regulator must review C-KLIVE70-01–05 against the pushed full candidate SHA with zero further Provider/credential/account calls. Builder stops after Handoff. Master controls main freeze and any eventual integration; no self-acceptance or main push.
