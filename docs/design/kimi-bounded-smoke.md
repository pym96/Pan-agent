# Bounded Kimi smoke preparation — #69 Stage A

Candidate validation tooling for [Criteria1.0](https://github.com/pym96/Pan-agent/issues/69#issuecomment-5754426256), based on `c9fd25d7337ae9426c22b2829e365451b237d2e6`. Product source, package contents, canonical protocol and archive schema remain unchanged. This document supplies neither a Verdict nor live authorization.

## Composition and oracle

[Runner and offline verifier](../../scripts/kimi-smoke/README.md) import the installed package's advertised public export. GeneralAgentSession owns the native loop, tool correlation and RunArchiveStore. PanKimiModelAdapter owns wire translation/private continuation; KimiFetchTransport owns lazy credentials and the fixed official endpoint. A transport wrapper adds only `max_tokens:4096` and preserves all original JSON values. Fetch disables redirects, so a redirected endpoint cannot receive another request. There are no retries, fallback providers, sampling settings, shell/file/network tools or alternate model selection.

The exact task, empty-object tool and marker are in the [lock](../../scripts/kimi-smoke/lock.json). The marker first enters model-visible context through the tool result. One fresh Session uses a fixed smoke Runbook snapshot, maxModelTurns=2/maxToolSteps=1, explicit cancellation and adapter disposal. The stricter smoke shape permits one empty-text tool-call response followed by the exact marker, ignoring only surrounding whitespace; intermediate commentary, additional calls, malformed arguments or another final text fail. The original admitted assistant object is never rewritten, preserving #68's private continuation lineage. Rejected responses become finite canonical failures before their unexpected text/arguments can enter an archive. Usage and observed model aliases remain attributable; missing identity is unavailable. Missing usage, explicit model change, reported output above the requested cap, length/truncation or any transport/protocol failure stops immediately.

## Activation and irreversible local consumption

The CLI's prospective form is `run.mjs live ACTIVATION_JSON INSTALLED_PRODUCT_DIR PRODUCT_TGZ`. Stage A does not supply that JSON. A future Master-delivered record has exactly these fields:

| Fields | Required meaning |
| --- | --- |
| version, mode | `69/Criteria1.0`, `live`; synthetic records cannot enter this mode |
| runner_sha | full actually accepted checkout commit; tracked changes refuse |
| product_sha, package_sha256, lock_sha256 | exact accepted Product base/tarball and exact lock bytes |
| run_id | one UUIDv4, no replacement or reissue for an uncertain attempt |
| credential_env | one explicitly authorized environment-variable name, no default/search |
| account_confirmed | explicit true from the authorized workflow |
| human_authorization | exact affirmative single-attempt/resource-limit statement required by the validator |
| approval_reference | Human/Master GitHub issue-comment locator for this exact bound authorization |
| approved_at, starts_at, expires_at | parseable times; approval precedes admission window, expired/future admission refuses |
| ledger_root | fixed absolute persistent ledger directory carried in the activation, not a CLI override |

Master must bind the final accepted SHA, package and lock, obtain the two Stage A Human reviews and a separate Stage B result/evidence contract and resource authorization. A syntactically valid record is not cryptographic proof of authorship. Do not use example values, regenerate run IDs, copy an activation to a different ledger, delete consumed directories or treat a hash as authorization. No runnable genuine record is delivered here. Expiry bounds admission; once admitted, monotonic attempt/dispatch deadlines govern execution.

`mkdir` atomically claims the activation's run directory; its parent is fsynced. The initial record and each dispatch reservation are fsynced before any credential callback or upstream effect. A competing process or restart cannot reacquire this directory, even after success, cancellation, empty/partial files or a crash before the first dispatch. There is no reclaim or resume path. The reservation remains consumed even if credential resolution fails; dispatch events separately record entry to the fetch boundary. Interrupted reservations are uncertain, never refunded. The local ledger cannot protect against a human deleting/forging it, hostile JavaScript in the same process, filesystem lies or hardware durability failure. Use the same authorized persistent filesystem location throughout.

## Resource and disclosure boundaries

The guard measures the post-cap JSON's UTF-8 bytes (at most 131072), response Uint8Array bytes (at most 524288 per dispatch), two dispatch reservations and one tool execution. It rejects an overflowing response chunk before the adapter receives it. Monotonic time starts at attempt admission (300000 ms) and dispatch reservation (120000 ms, through stream completion); equality expires permission. Timers and checks around await/effect boundaries apply the earlier deadline, abort pending send/stream waits and prevent late permission revival. Session cancellation and adapter disposal do not wait for a blocked upstream iterator to produce another chunk. Synchronous filesystem work cannot be preempted; permission is checked again after persistence and before effects. Terminal persistence time is checked before a successful terminal is finalized.

These are Master-selected resource policies, not measured performance or tokenizer estimates. Requested max_tokens is not a proven server token/quota ceiling; ignored-cap observations or rejection are retained and stop, without probing another parameter. Cancellation does not prove remote computation or billing ceased. No account/quota/balance endpoint is called and no payment is initiated. Subscription quota and monetary cost remain unknown; planned new payments are zero, separately from token use.

Normal persistence is restricted to typed lifecycle records, byte counts, status, canonical usage/observed model, correlated tool identity and terminal/archive state. No raw wire, Authorization, private reasoning, raw error body or their substitute hashes are written. HTTP 400/401/403/429/500 remain status-only refusals, without guessing a quota cause. Canonical archives retain the accepted task/tool/marker trace and finite failures. Synthetic canaries exist only in the explicitly labelled fixture input; the verifier scans all generated reports/ledgers/archives for those strings and their hashes.

`report` reads only retained records. `evidence_complete` means a terminal record was collected; archive sealing is separately reported. An interrupted record without a terminal is uncertain/incomplete. `oracle_met` records the deterministic two-response/one-tool oracle. `smoke_success` and `live_compatibility_demonstrated` are always false in synthetic mode, including successful offline tests. A live refusal can have complete evidence with both success fields false. Reports never convert token counts into money or fill absent model/usage with requested values.

## Source snapshots

Official documentation retrieved 2026-09-21 UTC; full HTML, response URLs, retrieval times and hashes are retained in the external bundle's `official-sources/manifest.json`:

| Source | SHA-256 |
| --- | --- |
| [Model configuration](https://www.kimi.com/code/docs/en/kimi-code/models.html) | `ba3456c3c9078d9f16fa4fddeeb5554aec734cca92edafd6743861d7e0e8b437` |
| [CLI changelog](https://www.kimi.com/code/docs/en/kimi-code-cli/changelog.html) | `330e6e26bfda614149569340985ab9c7ff425a5fad95cc312825213514603868` |

The model reference supports explicit k3-256k/high and the official `.com` base. The changelog documents client max_tokens handling, not account entitlement or server enforcement. No account or model probe was performed.

## Evidence and review handback

Primary bundle: `/Volumes/WD_BLACK/pan-agent/wo69-kimi-smoke-stage-a-20260921/`. The SHA-bound Handoff supplies exact commands, failed/nominal probes, independent activity meters, build/install identity, scope inventory, required Product/Reference/Python gates and original/isolated host outcomes. Runtime normalization uses sorted `{path,sha256,mode}` rows with two-space JSON plus newline, exactly #68's algorithm; required digest is `6d9b75058698a2db046af1ea0462313ae4fce0c9b7118a97708d239df8c57f6b`. Accepted tarball digest is `98b190d97cce81a53706c0766dd94626c6a406f4b291764bfb919e2c70da345f`.

Only after equal runtime bytes are established may #68's unchanged #49/#60/#61/#62 installed PTY evidence be reused by exact archive identity. New runner/guard verification is mandatory. Host navigation updates belong to Master. Independent Regulator assesses C-KSM-01–04, then presents H-KSM-BUDGET and H-KSM-LEAK bound to candidate/runner/lock/package for dated Human decisions (C-KSM-05). Builder stops after Handoff. Offline evidence does not establish live acceptance, benchmark quality, project-fact promotion or a resume claim.
