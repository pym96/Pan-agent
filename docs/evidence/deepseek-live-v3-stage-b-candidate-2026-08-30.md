# DeepSeek live v3 Stage B candidate Evidence — 2026-08-30

- Status: Working Agent candidate; pending fresh independent Regulator review
- Session role: Working Agent (Builder)
- Executed source: clean `main @ 09400f848ef75b63f9baf35d721099c630686332`
- WorkOrder and Human budget authorization: [Issue #20](https://github.com/pym96/workspace-agent-harness/issues/20)
- Accepted starting boundary: [landed #19 Regulator Verdict](https://github.com/pym96/workspace-agent-harness/issues/19#issuecomment-5466816453)
- Execution interval: `2026-08-30T13:13:59+08:00` through `2026-08-30T13:18:50+08:00`
- Authorized ceiling: `120` Runs / `600` paid model exchanges / `CNY 15.00`
- Observed external use: `224` official balance queries / `223` Provider-model exchanges / `120` formal Runs / `CNY 0.05`

## Execution identity and route

The only live entry used the exact Human-authorized acknowledgement:

```text
execute-live:sha256:cbc23aaf211a02a492c147f40dcad7b017888ba96d68b030cadbcf87d337a5f4:sha256:3878dbcadd0a909e23091477cb2c178d8f7957b1f9530f4e878f615d3f68d1b6:sha256:bd7680a0cdb6496ee058cabfce223199038bcceea51a3c2dd90ef007dac16c74
```

| Material | Frozen identity |
|---|---|
| executed Git commit | `09400f848ef75b63f9baf35d721099c630686332` |
| v3 lock | `sha256:cbc23aaf211a02a492c147f40dcad7b017888ba96d68b030cadbcf87d337a5f4` |
| v3 ModelProfile | `sha256:6400c7459d000d14b46e9852e9cf2f07b9a01b55bb031ed4ba5c96b5420dd625` |
| v3 schedule | `sha256:a6117889500855b608337bd6e6b401c294e2c4808bd554bb021dc5a6a9dc05c6` |
| v3 runner | `sha256:3878dbcadd0a909e23091477cb2c178d8f7957b1f9530f4e878f615d3f68d1b6` |
| v3 live entry | `sha256:bd7680a0cdb6496ee058cabfce223199038bcceea51a3c2dd90ef007dac16c74` |
| returned model | `deepseek-v4-flash` on every retained returned-model value |
| `system_fingerprint` | `a26a7955944dc5c60445bff77fac9c8e` on every retained non-null fingerprint |

Before credential access, the Builder verified `HEAD == origin/main`, a clean project worktree, all five v3 identities, the exact acknowledgement, v2 preservation, the accepted #19 starting Verdict, a non-existing campaign root, no local concurrent DeepSeek runner, 46 focused tests, six-file mypy/compileall, and the outer `77 + 189` acceptance gate. The first Provider-model call was frozen sequence `0`, `dsv0-ia-01-r1-feedback`; there was no smoke, canary, paid probe, replacement, restart, protocol repair, fallback, request mutation, or unplanned retry.

The campaign used one root only:

```text
.runs/workorder-20-v3-stage-b-2026-08-30/
```

The campaign naturally settled all planned slots. `campaign_stop_code` is `null`, and no `campaign-stop.json` exists. `maximum_retries=0` and `protocol_repairs=0` remained unchanged. No proactive compaction or Context-overflow recovery event occurred.

## Official preflight snapshot

At `2026-08-30T05:10:46Z` / `13:10:46+08:00`, the retained official pages matched the frozen contract: `deepseek-v4-flash` / `DeepSeek-V4-Flash-0731`, OpenAI base URL `https://api.deepseek.com`, Thinking enabled with high effort, Tool Calls support, 1M Context, maximum 384K output, and the frozen peak/off-peak prices. The capture occurred on Sunday Beijing time, outside the documented Monday-Friday peak windows.

| Snapshot material | SHA-256 |
|---|---|
| snapshot manifest | `17ec58f9b4a5683845644e2b1c04d538c6c42e01629e7ff52f9d997c56316d91` |
| pricing page / headers | `899affbdbc33d0be620d8dea59e86f5036c11b5410b14d060b8d2874c74f38e5` / `6a06377eea6587c016db3ac40ff32af815dd0c88ec9d1109e98eb204349082a4` |
| Thinking/Tool Calls page / headers | `f28c43248d26db1f27af0cb082abb00326c957d560d33a21839736edd1d10724` / `d0716f699c05d45ea619c8ed983ee73e189844b14a3afb4a88c87eba2323b23f` |
| quick-start page / headers | `e28f318d5a203c9db9dfa5f4d8c001bca6a1a8a22e6d208920617bb4bb5936b0` / `0a0552f7b523554e2eac6defdd74e66d37f45c7a259be833c3be8fa72d45efd4` |

Secret-safe locator: `.runs/workorder-20-official-snapshot-2026-08-30/`.

## Denominator and outcome layers

Inventory state and Behavioral outcome attribution are deliberately separate:

| Layer | Count |
|---|---:|
| planned / formally started / executed Runs | `120 / 120 / 120` |
| inventory completed / failed | `72 / 48` |
| skipped by stop rule / missing | `0 / 0` |
| task passed / task failed | `18 / 50` |
| Runtime/policy/Provider failures | `52` |
| authorized / dispatched Provider exchanges | `223 / 223` |
| usage-known exchanges | `223 / 223` |
| balance receipts | `224` |

Four inventory-completed Runs have `policy.failure`, so inventory completion is not interchangeable with a task outcome. Runtime attribution is `48 provider.failure + 4 policy.failure = 52`.

## Frozen arm accounting

| Arm | Planned | Inventory completed / failed | Task pass / fail | Runtime failures | Exchanges | Input / output / total Tokens |
|---|---:|---:|---:|---:|---:|---:|
| `observation-feedback-v0` | `60` | `18 / 42` | `18 / 0` | `42` | `163` | `121082 / 13794 / 134876` |
| `act-once-v0` | `60` | `54 / 6` | `0 / 50` | `10` | `60` | `38355 / 5207 / 43562` |
| total | `120` | `72 / 48` | `18 / 50` | `52` | `223` | `159437 / 19001 / 178438` |

Of the 60 frozen case/repetition pairs, 16 have task outcomes in both arms; all 16 retained `feedback=passed / act-once=task_failed`. The other 44 pairs contain at least one Runtime failure. The accepted runner freezes no causal estimator, and the complete paired task-outcome denominator is not evaluable, so candidate causal eligibility is `false` and `causal_result` remains `null`. No causal conclusion is claimed.

## Failure and protocol attribution

Every dispatched exchange has `dispatch_state=response_received`. The 48 Provider-layer failures are typed `protocol` failures:

- `content_tool_calls_conflict`: `29`;
- `reasoning_content_missing`: `19`.

The four `policy.failure` Runs retain eight failure-code occurrences: `wrong_disposition=4` and `wrong_reason_code=4`. Retained settlement finish-reason coverage is `tool_calls=204 / absent=19`; the ordinary-final live path was not observed. Runtime Event Logs retain `223` exchange starts, `175` settled exchanges, `48` failed exchanges, `157` tool starts/completions, and `120` terminal Runs. Restricted reasoning remains only in ignored raw Provider artifacts and is not reproduced here, in the derived summary, or in the public Handoff.

These are time/configuration-bound candidate observations. They are not interpreted as a persistent Provider property or generalized model-quality result.

## Balance, usage, timing, and cost

| Material | Observation |
|---|---|
| initial available balance | `CNY 14.12`, response identity `sha256:58a62b8564af479d8585055807aa6bfbb2d542f23fb49d91549274a8f7c85f9a` |
| final available balance | `CNY 14.07`, response identity `sha256:1d8ba1563381add62c3f4e8e1a2db666d0e487e1bf058557a56d4d54cccb14b5` |
| observed balance delta | `CNY 0.05` |
| authorized ceiling | `CNY 15.00` |
| aggregate Provider duration | `248477 ms` across `223` exchanges |
| usage coverage | `223 / 223` exchanges |
| input / output / total Tokens | `159437 / 19001 / 178438` |

The balance delta is the campaign's accepted cost meter, not a general pricing measurement. No concurrent use or top-up drift was observed by the frozen meter; account exclusivity still depends on the Human reservation boundary.

## Retained Evidence and deterministic reconstruction

The ignored campaign root contains `2491` raw files. Two fresh minimal-environment reconstructions and one secret-safe aggregate summary bring the manifest-covered total to `2494` files; the manifest excludes only itself. Every manifest entry was rehashed successfully.

| Material | SHA-256 |
|---|---|
| campaign anchor | `1bb37026905c0fd29910cc13262fb2bfd2f3adc2d4dbe249a62fe434e7f6f2e4` |
| budget preflight | `9d16b7d2483d45d9753f9b3ff4ee66102328a805ab0f3f2cd18b999550db21ef` |
| reconstruction 1 / 2 | `b49911185f1e636b1a63a9d280dc55603052fb1d4d286d480cf6554bf1f5679d` / same |
| evidence summary | `a0194e24835ec89d7100ba2b533a69ae326b3c10238a2baf0af506ae6375a243` |
| 2494-entry artifact manifest | `105aa2aaeb73bc1e489293e3b979daf245eec4a77aa06791532822628ae158d8` |

Each reconstruction is `33,655` bytes and byte-identical. Reconstruction imported only the frozen lock and `reconstruct_live_campaign_report(...)` under an environment without credentials; it constructed no Provider, balance, model, or tool Adapter. A scan of all `2502` retained campaign/snapshot files found no exact credential bytes and no home-directory private path.

## Verification receipt

```text
Focused historical-v2 + v3 Gateway/Adapter/Campaign/Runner: PASS — 46 tests
Full project suite: PASS — 189 tests
mypy --follow-imports=skip: PASS — 6 source/entry files
compileall: PASS
package identity: PASS — 1 test
Candidate Evidence/index Markdown links: PASS — 2 files / 15 local targets
Candidate + retained-artifact exact-credential/private-path scan: PASS — 2,505 files
artifact manifest verification: PASS — 2,494 entries
git diff --check: PASS
HEAD == origin/main == 09400f848ef75b63f9baf35d721099c630686332
outer acceptance: PASS — 77 outer tests + 189 project tests; PASS acceptance gate
```

The full suite emitted the existing evaluator process-group negative-probe `ResourceWarning` while all 189 tests passed; WorkOrder #20 changed no source or subprocess lifecycle.

## Claim boundary

This Candidate Evidence records one frozen DeepSeek v3 campaign at one official-doc snapshot and time window. It is not a persistent DeepSeek property, a general model/Agent-quality conclusion, a public benchmark or SWE-bench score, a causal conclusion, a Verified Project Fact, a Learning Wiki fact, a resume fact, or a public claim. It authorizes no repair, retry, replacement, restart, second campaign, additional Provider/balance call, source change, or fact promotion. Independent Regulator review remains mandatory.
