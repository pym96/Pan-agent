# Codex single-job connector | #46 Stage A

Criteria-Version **1.0**, baseline **7ade169b276fd68198ca4461d07c5589c273253f**. [Formal contract](https://github.com/pym96/Pan-agent/issues/46#issuecomment-5595244988), [promotion](https://github.com/pym96/Pan-agent/issues/46#issuecomment-5595250291), [obligations](workorder-46-obligations.json), [candidate evidence](../evidence/codex-single-job-connector-candidate.md). Contract content including terminal LF SHA-256: `486cdcbef921f3d4e183de8aa906350ee69a80887af308c4753c04b6b42e28b9`.

Stage A implements and tests connectors without real inference, login-status checks against a real account, credential reads, balance queries or Pan Provider calls. Human authorization HF-20260909-061 covers one later current-subscription campaign, total 2h, per attempt 1h, at most two repairs. That campaign is not active. No new spending authorization is inferred or requested here; Master must bind the reviewed identities after independent and Human technical gates.

## Offline operation

Use Node **22.19.0**, Darwin arm64, cached TypeScript **5.9.3** and @types/node **22.19.19**. From repository root:

```sh
npm --prefix devtools/overnight ci --offline --ignore-scripts --no-audit --no-fund
npm --prefix devtools/overnight run check
OVERNIGHT_NODE=/absolute/path/to/node22.19.0 devtools/overnight/connector-demo.sh FULL_CANDIDATE_SHA
```

The demo verifies clean exact-SHA source and Node version. It starts only the fixed fake CLI, makes a disposable local Git candidate, crosses separate fake Builder/Regulator processes, and records fake issue comments. All output is SIMULATED. No actual Codex executable/authentication or GitHub mutation is used by the demo. The synthetic implementation is a test fixture, never C-LIVE-07 evidence.

The explicit connector CLI is separate from the original offline CLI. From `devtools/overnight/` use `node --experimental-strip-types src/connector.ts` followed by:

| Command | Behavior |
|---|---|
| `demo` | Fresh offline connector fixture and two-role route |
| `dry-run CONFIG` | Validate binding/schema/file identities; no account access or model launch |
| `start CONFIG` | Run the bound job; state is fixed at CONFIG manifest workspace/state |
| `status STATE` | Inspect retained ledger without launching or publishing |
| `stop STATE` | Persist an idempotent request; an owner or explicit resume performs cleanup |
| `resume CONFIG` | Reconcile the same job, keys and original budgets; never resume a Codex thread |

The source and compiled `dist/connector.js` entries share the same implementation. The committed mjs supervisor imports source through Node's strip-types support; it is included in the isolated utility rather than the Pan package. No runtime dependency or new product install graph is introduced.

## Connector structure and trust decisions

`connector-authority.ts` validates the operator's delegation record, exact CLI hash/version, model selection, contract and manifest identity, fixed issue, roles and Stage A/B mode. `connector.ts` binds it to the existing coordinator. `codex-process.ts` implements the existing ProcessAdapter, retaining #45 receipt/birth/group cleanup. `connector-output.ts` validates bounded UTF-8 JSONL and final structured output. `github-tracker.ts` implements persistent publication intent and exact read-back to only `pym96/Pan-agent#46`.

The prompt includes the exact common project AGENTS.md from the reviewed connector; its digest is retained alongside the role template and full prompt digest. Ignoring unrelated project discovery does not discard these shared rules.

A model returns role, attempt session, input candidate SHA, outcome and frozen blockers. The adapter requires successful process completion, one fresh CLI thread, a complete turn, matching final JSONL message/output file and strict schema. A model message never selects an executable, role, target issue or diagnostic text. The Builder edits only the trial files and runs tests; the fixed wrapper commits/pushes the validated edits to the disposable candidate branch. Its normalized Handoff binds the resulting full SHA. The Regulator receives that exact candidate in a separate clean worktree; its writable cwd is a separate probes directory, and any candidate modification rejects its output. Actual CLI thread identity and raw-output hashes are bound through the evidence file. A reused thread marker refuses a new attempt.

Trial criteria remain C-SUM-01 with the formal contract's safe-integer/running-total cases. Only `criterion_failed` against that existing ID can reserve a repair. Missing evidence, malformed output, quota/permission/auth failure and uncertainty stop. The wrapper's fixed failure category points the operator to private logs; those logs are not uploaded. No built-in Codex review or ordinary prose acts as the project Verdict.

The GitHub connector publishes allowlisted trial-target Handoff/Verdict fields and a terminal trial summary, always explicitly distinguished from acceptance of this connector. Only fixed GET-comments and POST-comment operations exist. Per-key write intent precedes POST; response loss triggers read-back rather than another POST. A missing/ambiguous read-back stops reconciliation. A changed comment, author, digest, ID or contract is rejected. Cooperating coordinators serialize effectful operations with the existing owner lock. Remote comments remain mutable; this is not a distributed exactly-once guarantee.

On connector recovery, pending owned stops/deadlines are cleaned before network/auth queries. When live work has historical remote results but no stop yet, remote-history uncertainty conservatively stops that owned work for reconciliation instead of blocking cancellation on GitHub. Local result checks and the independent current process receipt still apply. After cleanup the connector checks remote history, retains any mismatch, and never starts a next role from that path. `pre-transport-cleanup.json` distinguishes cleanup from subsequent history validation. This is deliberately more conservative than uninterrupted execution; it does not silently relaunch a Codex session.

## Fixed CLI interface and configuration

Local read-only discovery observed **codex-cli 0.153.4** and exec support for `--json`, `--output-schema`, `--output-last-message`, `--ignore-user-config`, `--strict-config`, `--sandbox`, `--cd` and model selection. No installation change or inference was used for discovery. Official [non-interactive documentation](https://developers.openai.com/codex/noninteractive) describes JSONL lifecycle events and structured output; the parser accepts a narrow observed/documented boundary and rejects malformed, incomplete or unsupported events. Documentation is not live interoperability proof.

The fixed invocation creates a fresh `exec` session with workspace-write permissions, no tool network, no approval escalation, explicit model, structured schema and private output paths. It never attaches, forks, uses `resume --last`, built-in review, dangerous bypass flags or automatic approval review. Subagent/apps/hooks configuration is disabled. A dedicated tool HOME and explicit environment prevent inherited API/provider/GitHub tokens from reaching model tool subprocesses. There is no fallback provider or API key selection.

Official [authentication](https://developers.openai.com/codex/auth) and [configuration references](https://developers.openai.com/codex/config-reference) document ChatGPT versus API authentication, `forced_login_method`, configuration and shell-environment controls. Stage B forces ChatGPT and checks the official CLI's login-status response without reading/copying credential files. Unknown/auth-unavailable output refuses before a Codex role launch. The explicit auth home must have only recognized auth/session/cache metadata, no config/extensions; project/ancestor config roots and known managed configuration files cause refusal. Unknown strict-config settings or unavailable permissions stop; they are never removed or bypassed automatically.

`effective-config.json` records the exact requested argv/environment and auth/binary binding. Stage A does not claim the real CLI accepted every setting, that subscription credentials are available, or that a real model's complete effective configuration was observed. Stage B must retain those observations; incompatible behavior means an honest stop and, if source changes are needed, fresh Stage A review. Model choice is supplied by Master, not chosen by an implicit default.

## Stage B preparation and activation contract

After independent Stage A PASS and same-SHA Human checks for L-AUTH/L-STOP/L-CONTAINMENT, Master prepares one disposable Node target and binds its base/candidate branch and paths. The manifest shape is shared with the offline coordinator; connector mode is `codex`, repository identity `sum-integers-trial`, issue 46, C-SUM-01, and the same fixed role template hashes. `delegation.json` has the strict Binding shape exported by `connector-authority.ts`. `authorizeConnector(manifest,binding)` seals the local manifest/delegation digests without performing inference; it is an operator preparation helper, not a grant from model text.

Binding fields include the exact reviewed connector SHA, native CLI binary path/hash/version, explicit model, `auth: chatgpt`, dedicated auth-home path, fixed GitHub executable hash/author/target, one campaign identity, and Stage A review/Human review/Master activation URLs on #46. The operator may provision the dedicated auth home only through official CLI login for the already authorized subscription account; this utility never copies or reads raw credentials. Existing Human sessions and their stores remain untouched. Do not repoint an existing session or silently reuse an auth home containing unrelated configuration.

The independent Regulator and Human must append the exact structured records generated by exported `stageAReviewBody(reviewedSha)` and `humanReviewBody(reviewedSha)` respectively, only after their actual checks pass. These records bind role, explicit PASS, Criteria-Version and named outputs to the full SHA. A rejected record, prose merely mentioning the SHA, wrong author or different SHA cannot unlock launch. They supplement the detailed review evidence; they do not grant the Builder authority to fabricate a review.

The required Master comment body is produced by exported `activationBody(binding)`: a fixed Stage B heading and canonical JSON of the declared identities. Store its exact #46 comment URL in `binding.masterActivation`, then seal the binding. The tracker checks the frozen formal contract digest, this exact activation body, expected author and same-SHA review references before fresh inference. These are operator-owned authority records; a local actor with the same OS/GitHub authority can forge records, so this is not a cryptographic Human-signature scheme or protection against a malicious authorized operator.

Stage A Handoff contains no activated B binding or real auth observation. Master has not selected a trial model/CLI credential home here. One activated manifest/workspace is one campaign; resume keeps its original expiry and reserved repair counts. A failed/incomplete trial is not permission for another campaign. Real outputs belong to #46 as trial-target records, never as the outer connector Verdict. Independent outer Regulator checks C-LIVE-07 and retains final acceptance authority. No automatic landing follows.

## Evidence, checks and limits

Default checks retain all **36 #45 tests** and new connector tests. The original #45 scope checker is byte-identical and is also executed on its exact accepted baseline; a new #46 scope checker accounts for explicitly authorized governance/doc changes without weakening historical obligations. Product100/conformance18, Reference34/conformance13, without-Python100, Python259 and host82 remain required. All original validators/evidence and protected Product/Reference/Python bytes stay unchanged.

The authorized host-copy gate uses only the frozen four root and three project-tool exclusions. Original-host extra-file BLOCK stays separately reported; no original file or validator is changed. Failed development/check observations are retained rather than overwritten by later passing runs.

L-AUTH/L-RESULT/L-TRACKER/L-STOP/L-CONTAINMENT and retained A-* indexes contain raw references and exact identities. Private raw session files are mode 0600 and directories 0700. Synthetic canary inputs/raw logs are separately classified and stay local. Public payloads contain only strict typed fields and fixed categories. Subscription cost is unavailable, never claimed CNY 0; per-attempt CLI token usage is retained when provided. Stage A fake counters do not meter the Human-started Builder account.

Cleanup retains the #45 monotonic algorithm: TERM promptly, escalation grace at most 250 ms, verified ordinary group empty within 2000 ms, sentinel absent through at least 3000 ms. Persisted wall deadlines survive restart; live monotonic checks enforce the bounds while running. Deadline/config checks repeat before actual role spawn after auth preflight. An unverified/reused PID is never signaled; unconfirmed cleanup remains explicit.

This is trusted local orchestration with bounded Codex workspace permissions, not a universal filesystem/secret sandbox, hostile-native-code containment, escaped-process-group guarantee, subscription cost meter, distributed lock or promise of zero internal HTTP retries. Linux and actual Codex trial behavior remain unverified until appropriate evidence exists. C-LIVE-07 is NOT_EVALUABLE in Stage A.

A retained #46 check exposed a short-lived empty-wrapper PID identity mismatch. The ps identity reader now confirms process status again after reading the command/start string, distinguishing an intervening exit from a still-live changed identity. A deterministic OS-response regression fails on the prior implementation and passes with the extra check; live mismatches remain untrusted and unsignaled. The original failed run and its uncertainty are retained, not relabelled as a passing observation.

The public Master activation contains hashes for local executable/auth-home paths; exact paths stay in the operator-owned binding. No private auth-home path is published by the generated activation body.
