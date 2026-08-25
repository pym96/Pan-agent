# Evented AgentLoop and Agent Loop Behavioral Eval v0

Status: WorkOrder #3's design-freeze candidate passed its independent Regulator Gate and ADR-0014 was Human-accepted on 2026-08-25. This document freezes a future Interface and experiment contract. It is not implementation Evidence, a provider result, a Verified Project Fact, or a benchmark score.

## Decision and claim boundary

The v0 decision question is falsifiable:

> With model, system policy, tool set, translation, Context policy, task fixtures, and Run limits fixed, does the `observation-feedback-v0` Loop Policy improve exact-oracle task pass rate by at least 20 percentage points over `act-once-v0` across the frozen 12-case suite, without violating any Run Event invariant?

The one primary causal comparison changes only `loop_policy_id`:

| Arm | Accepted-turn behavior |
| --- | --- |
| `act-once-v0` | Admit at most one settled assistant turn. A final item settles normally. A tool call is executed and its result retained, then the Run settles as `loop_policy_stop`; the model never receives that observation. |
| `observation-feedback-v0` | After each admitted tool result, project the updated Canonical History and permit another model exchange until a final item or a Run limit settles the Run. |

The comparison is between these two complete Loop Policies, not between hidden reasoning modes and not between prompts. The same system prompt and tools are visible in both arms; the control is not told a different story. A future execution may conclude:

- `feedback benefit` only when the paired pass-rate difference is at least `+0.20`, every event log passes conformance, and the campaign completes its frozen denominator;
- `no observed benefit` when the paired difference is at most `0.00` and the denominator completes;
- `inconclusive` for a positive difference below `0.20`, an incomplete campaign, identity drift, or any event-contract failure.

This threshold is a v0 progression rule, not a population estimate. It cannot support a general model-quality, ReAct, SWE-bench, coding-ability, or production-reliability claim.

## Frozen Agent inputs

An `AgentDefinition` binds these identities independently. A digest change in one field cannot be hidden by recomputing a single transcript hash:

| Input | Required identity material | Owner |
| --- | --- | --- |
| system policy | policy name, version, canonical content SHA-256 | Human-selected Agent configuration |
| tool set | ordered tool names, versions, JSON Schemas, authority profile SHA-256 | Runtime configuration |
| model profile | Provider, returned/requested model, endpoint class, Context-window knowledge source, output-room policy, sampling/thinking settings | Model configuration |
| translation | Adapter name/version/content SHA-256 and provider-protocol mode | `ModelGateway` implementation |
| Loop Policy | arm, final-item rule, maximum actions per settled turn, tool-error observation rule | `AgentLoop` |
| Context projection | estimator, projection schema, artifact threshold, preservation policy, safety margin | Model Context projector |
| compaction | summary schema, summarizer identity, retry ceiling, preservation rules | Model Context projector |
| Run limits | model exchanges, tool steps, wall time, aggregate usage/cost ceiling | `AgentLoop` |
| task input | suite/case/fixture hashes and visible task material | Behavioral case |

Credentials, raw secrets, wall-clock timestamps, and mutable display settings are never identity material. Unknown Provider capability metadata is represented as `unknown` with its source and confidence; it is never replaced by an invented verified limit.

The only v0 control inputs after construction are `start` and `cancel`. Steering, follow-up queues, parallel tool calls, subagents, memory, checkpoint/resume, session trees, permissions UX, authentication UX, and model switching are outside this Interface.

## Deep Module seams

```text
start/cancel
    |
    v
AgentLoop.run(AgentDefinition, TaskInput, RunLimits) -> RunResult
    | append first                     | prepare next call
    v                                  v
Run Event Log                    Model Context projector
    ^                                  |
    | append before fan-out             v
tools <--- admitted action       PreparedModelTurn
                                       |
                                       v
                         ModelGateway.exchange(...)
                                       |
                       CandidateTurn + Continuation + Evidence

Run Event Log --project--> Canonical History
              --project--> Trace / replay / Behavioral Eval / TUI
```

### AgentLoop Interface

The external Interface remains one bounded invocation and one result:

```text
AgentLoop.run(agent, task, limits, controls) -> RunResult
```

The Interface includes exactly-one terminal settlement, cancellation semantics, Run-limit behavior, event ordering, and failure attribution. Callers do not drive individual model or tool lifecycle methods. Tests cross the same `run(...)` seam as a headless caller and a future TUI start action.

### ModelGateway Interface

`AgentLoop` has one model-facing operation:

```text
ModelGateway.exchange(PreparedModelTurn, CancelSignal)
    -> ExchangeSettled(CandidateModelTurn, ProviderContinuation?, ExchangeEvidence)
     | ExchangeFailed(ModelFailure, ProviderContinuation?, ExchangeEvidence)
```

This is a deep Module: request encoding, credentials, transport, streaming assembly, Provider stop reasons, response decoding, endpoint metadata, returned model/fingerprint, usage, and raw-body retention remain behind one Interface. `ProviderAdapter.encode/decode` is an internal seam inside the gateway. The accepted offline WorkOrder #4 candidate supplies the first mapping mechanism, but its current creation of next history is not adopted as the final Runtime ownership rule.

`CandidateModelTurn` is not executable. It contains an ordered list of candidate text, working-note, tool-call, and final items plus settlement metadata. Candidate tool arguments retain enough exact decoded material for Runtime schema validation. Provider wire syntax is absent. `ProviderContinuation` contains opaque Provider-only response IDs or reasoning payloads needed for a compatible next call. It is neither portable history nor display data. `ExchangeEvidence` contains secret-safe request/response hashes or artifact references, usage, timing, endpoint class, returned model/fingerprint, and failure metadata.

Translation is bidirectional, not reversible. Two Provider representations may have the same canonical meaning, while opaque Provider state may be unusable after a Provider switch.

### Admission boundary

The Runtime admits a settled candidate only after all checks pass:

1. the exchange is settled rather than partial, cancelled, or length-incomplete;
2. candidate structure and action arguments satisfy the canonical schema;
3. correlation IDs are present, unique, and consistent with retained history;
4. requested tools and arguments satisfy the selected tool set and authority;
5. ordered items satisfy the Loop Policy, including v0's maximum of one executable tool call or one final item;
6. a final item has a typed `disposition` of `completed` or `abstained` and an optional machine-readable `reason_code`.

Only `candidate.accepted` authorizes Canonical History advancement or tool execution. Rejected, malformed, partial, unsupported, multiple-action, and correlation-invalid candidates remain Evidence and events but never enter Canonical History. Working notes never enter executable arguments. Their visibility is one of `displayable`, `restricted`, or `opaque`; `restricted` and `opaque` content is not emitted to TUI projections.

### Run Event Log and projections

The append-only Run Event Log is the sole durable execution chronology. Canonical History, Model Context, durable Trace, replay views, evaluator inputs, and TUI views are deterministic, versioned projections. None is a second source of execution truth.

Canonical History contains the complete accepted semantic conversation: user input, admitted assistant items, correlated tool calls and results, typed final items, artifact references, and compaction-summary records. Original admitted history is never replaced by a summary. Raw Provider envelopes, partial output, rejected candidates, usage, and opaque continuation state remain outside Canonical History.

Model Context is a disposable, content-addressed projection for exactly one exchange. It contains system policy, tool declarations, an exact recent causal tail, any applicable semantic summary, external artifact references, and Provider continuation only when compatible. Deleting Model Context cannot delete or rewrite Canonical History.

Trace, Behavioral Eval, and TUI consumers read committed events through a cursor or replay operation. A live consumer may lag or fail without delaying, cancelling, or changing the Run. Event persistence happens before best-effort notification.

## Run Event schema v1

Every retained event has:

```text
schema_version = "run-event/v1"
run_id
sequence                 # integer, starts at 0 and increments by exactly 1
event_id                 # SHA-256 of the canonical event envelope excluding event_id
previous_event_hash      # null at sequence 0, otherwise prior event_id
event_type
phase                    # candidate | accepted | failed | terminal
caused_by_event_id       # required for derived transitions
turn_id? exchange_id? candidate_id? tool_call_id? compaction_id?
monotonic_offset_ns      # diagnostic only; replay order uses sequence
visibility               # public | expanded | restricted | secret-ref
payload                  # canonical JSON or a content-addressed artifact reference
```

SHA-256 is an integrity identity, not encryption. Secret material is omitted or retained outside the log behind an authorized artifact reference; hashing a secret does not make it safe to publish.

The first event is `run.started`. The last event is exactly one `run.terminal`. No event may follow the terminal event. `event_id`, hash linkage, sequence, Run identity, and causal IDs must validate before any projection is replayed.

### Event vocabulary

| Event | Phase | Required ordering and payload |
| --- | --- | --- |
| `run.started` | accepted | sequence `0`; exact Agent/task/limit identities; no Provider or tool activity precedes it |
| `control.cancel_requested` | accepted | follows start and precedes terminal; carries the active operation identity when one exists |
| `context.projection_started` | candidate | identifies source Canonical History and next-call budget |
| `artifact.externalized` | accepted | optional; precedes the projection/compaction result that references it |
| `context.compaction_started` | candidate | optional; identifies trigger, source history, policy, and attempt `proactive` or `overflow-recovery` |
| `context.compaction_completed` | accepted | identifies summary, preserved item IDs, artifact refs, result Context identity, and summarizer usage |
| `context.compaction_failed` | failed | carries attributable failure; no guessed/truncated Context follows |
| `context.projected` | accepted | identifies complete `PreparedModelTurn`; must precede its exchange |
| `model.exchange_started` | candidate | references exactly one Context identity and exchange attempt number |
| `model.output_delta` | candidate | zero or more; references active exchange; never authorizes history or tools |
| `model.exchange_settled` | candidate | closes the exchange once and identifies candidate, continuation, Evidence, usage, and stop reason |
| `model.exchange_failed` | failed | closes the exchange once; mutually exclusive with `model.exchange_settled` |
| `candidate.accepted` | accepted | follows one settled exchange and complete admission; identifies ordered semantic items |
| `candidate.rejected` | failed | follows one settled exchange; mutually exclusive with acceptance; contains stage/code |
| `history.advanced` | accepted | follows candidate acceptance or a tool outcome; identifies old/new history and admitted item IDs |
| `tool.execution_started` | candidate | follows accepted tool call and history advancement; exactly one per v0 turn |
| `tool.execution_completed` | accepted | closes one tool start; carries result/artifact IDs and `is_error_observation=false` |
| `tool.execution_observed_error` | accepted | closes one tool start with a domain/tool error safe for model feedback; not a Runtime crash |
| `tool.execution_failed` | failed | closes one tool start with Harness/adapter failure; never becomes an observation |
| `budget.exhausted` | failed | emitted before terminal with exact limit kind and observed amount |
| `run.terminal` | terminal | contains the one `RunResult`, final identities, counters, usage coverage, and terminal status |

### Exact lifecycle

The state machine is:

```text
NEW
  -> RUNNING
  -> PROJECTING_CONTEXT
  -> [COMPACTING_CONTEXT -> PROJECTING_CONTEXT]
  -> EXCHANGING_MODEL
  -> VALIDATING_CANDIDATE
  -> [EXECUTING_TOOL -> RUNNING]
  -> TERMINAL
```

From every nonterminal state, a valid `cancel_requested`, limit exhaustion, or attributable failure can transition to `TERMINAL`. Cancellation signals the active gateway/tool operation, records its settlement when available, and then emits one `run.terminal(cancelled)`; it never admits a partial result. Race resolution uses event order: a candidate or tool result appended before `control.cancel_requested` remains accepted, while any unsettled later work cannot be admitted.

For one feedback tool turn, the required order is:

```text
context.projection_started
[artifact.externalized*]
[context.compaction_started -> context.compaction_completed]
context.projected
model.exchange_started
model.output_delta*
model.exchange_settled
candidate.accepted
history.advanced(tool-call)
tool.execution_started
tool.execution_completed | tool.execution_observed_error
history.advanced(tool-result)
```

For a final turn, `candidate.accepted -> history.advanced(final) -> run.terminal(completed|abstained)`. A rejected candidate produces `candidate.rejected -> run.terminal(protocol_error)`. v0 has no protocol repair. Provider Context overflow is the sole exchange-level retry path and is bounded as described below.

## Terminal status and evaluator verdict

`RunResult.status` is exactly one of:

| Status | Meaning |
| --- | --- |
| `completed` | admitted typed final item with `disposition=completed` |
| `abstained` | admitted typed final item with `disposition=abstained` |
| `loop_policy_stop` | the act-once arm retained its first tool result and intentionally stopped |
| `cancelled` | cancel won before terminal settlement |
| `model_error` | transport, Provider, or gateway failure other than Context exhaustion |
| `protocol_error` | settled candidate failed Runtime admission |
| `tool_error` | tool adapter/Runtime failed; distinct from a model-visible error observation |
| `policy_blocked` | requested authority was rejected by Runtime policy |
| `step_limit` | maximum admitted tool steps reached |
| `model_call_limit` | maximum exchanges reached before another call |
| `time_limit` | whole-Run deadline reached at a safe boundary or cancellation settlement |
| `usage_limit` | aggregate Token/cost limit reached |
| `context_overflow` | one allowed compact-and-retry was exhausted or unavailable |
| `context_compaction_error` | semantic projection could not preserve its contract |
| `runtime_error` | attributable Harness invariant or persistence failure |

The Behavioral evaluator separately returns `passed | failed | not_scored | evaluator_error`. It consumes the protected initial fixture, final environment snapshot, and retained events. A `completed` Run may fail the task oracle; an `abstained` Run passes only cases whose oracle requires abstention; a Provider or protocol failure is not relabelled as task failure in failure tables. The primary all-eligible task-pass denominator still counts any non-passing slot as not passed while preserving its cause.

## Model Context and adaptive semantic compaction

### Next-call fit

For a model with a known Context window, proactive compaction runs before an exchange when:

```text
estimated_input_tokens
+ requested_output_room
+ provider_protocol_and_tool_overhead
+ safety_margin
> verified_context_window
```

Every estimator, value, source, and confidence is retained. The trigger is next-call fit, not a universal percentage. `ModelProfile.max_output_tokens` remains a per-call output request; it is not a whole-Run budget and does not compress input.

The v0 safety margin is `max(1,024 tokens, ceil(0.05 × verified_context_window))`. The Provider/tool protocol overhead comes from the selected Translation Adapter's versioned estimator, not a Harness-wide constant. A projection whose estimator cannot account for the selected tool schema fails before exchange rather than treating overhead as zero.

When the window is unknown, the Runtime proceeds without inventing a ceiling. A Provider overflow may invoke the same compaction path. A reliable Provider usage/capability signal may become input only with recorded source/confidence; an arbitrary local fallback may not.

### Preservation contract

Before semantic summarization, tool output whose canonical body exceeds the v0 threshold of 32,768 bytes is retained losslessly as an artifact. UTF-8 text receives a model-visible preview of at most the first 2,048 and last 2,048 bytes at valid code-point boundaries; binary output receives no inline preview. The model-visible form contains a typed reference, byte count, media type, SHA-256, and preview-policy identity. The preview is not the retained truth.

Each compaction must preserve:

1. the active user request verbatim;
2. system-policy and tool-set identities;
3. unresolved commitments in a typed summary field;
4. established facts with source event IDs;
5. the most recent complete causal tail that fits;
6. every tool call atomically with its result; neither may appear alone;
7. artifact references required by preserved facts or commitments;
8. prior compaction summary identity and the full pre-compaction History identity.

The summary schema has `active_request`, `facts[]`, `unresolved_commitments[]`, `decisions[]`, `failures[]`, and `artifact_refs[]`. Every entry cites source event IDs. A summary that omits a required field, cites an unknown event, creates an orphaned call/result pair, or still cannot fit fails closed as `context_compaction_error`. Byte, character, message-count, oldest-first, and silent arbitrary truncation are forbidden.

After reserving system policy, tools, output room, safety margin, active request, typed summary, and required artifact references, the projector walks admitted semantic groups backward from the newest event. It includes a whole user/final item or a whole tool-call/result pair only when the complete group fits. It stops at the first non-fitting group; all older admitted semantics must already be covered by the validated summary. This newest-complete-group rule makes recent-tail selection deterministic without splitting causal pairs.

### One overflow recovery

If the Provider reports Context overflow after a projected call, the Runtime retains that failed exchange and may perform exactly one `overflow-recovery` compaction followed by one new projection and exchange. Both exchanges count toward model calls, Tokens, cost, and time. A second overflow settles `context_overflow`; no recursive retry occurs. Protocol rejection, authentication failure, rate limiting, and malformed output do not use this recovery path.

## Behavioral Eval v0 manifest contract

The suite identity is `agent-loop-behavioral-eval-v0`. Its immutable manifest must content-hash the ordered cases and these fields:

```text
case_id, family, title, task_prompt, visible_inputs,
initial_fixture_ref, tool_set_identity, deterministic_transition_table,
protected_oracle, success_and_terminal_rule, run_limits,
system_policy_identity, loop_policy_identity, context_policy_identity
```

The loader rejects an unknown field, duplicate ID, missing oracle, non-local tool, mutable fixture, network capability, thought-text assertion, or any distribution other than exactly 12 cases and exactly three cases per family. Protected oracle material is never included in Model Context or the Agent-writable environment.

No case uses a SWE repository, network access, an LLM judge, hidden human judgment, or subjective prose grading.

All cases use the same limits: at most four tool steps, five model exchanges, 30 seconds, one action per settled turn, zero protocol repair, and at most one Context-overflow recovery. Deterministic local tools return typed success or error observations. These microtasks are intentionally small and should not normally compact; the production Context policy remains enabled and any unexpected compaction is retained rather than hidden.

### Frozen cases

`IA-01 beacon-value`

- Initial state: `beacon.current = "R7Q-41"`, `submitted = null`.
- Visible input: “Submit the current beacon value; do not guess.” The value is absent.
- Tools: `inspect_beacon({}) -> {value}`; `submit_value({value:string}) -> {accepted:true}` and records the supplied value.
- Deterministic transitions: inspection is read-only; submission stores exactly its argument.
- Protected oracle: stored value equals initial `beacon.current`, at least one inspection preceded submission, and final disposition is `completed`.

`IA-02 registry-owner`

- Initial state: registry `{delta:"team-cobalt", sigma:"team-ivory"}`, `submitted = null`.
- Visible input: target project `delta`; owners are hidden.
- Tools: `read_registry({project}) -> {project,owner}` or `not_found`; `submit_owner({project,owner})` stores the pair.
- Deterministic transitions: registry never mutates; submission records exactly one pair.
- Protected oracle: `read_registry(delta)` precedes submission, submitted pair is `(delta, team-cobalt)`, and final disposition is `completed`.

`IA-03 alias-manifest-two-hop`

- Initial state: alias `{release:"manifest-9"}`, manifest `{manifest-9:{digest:"sha256:8b1f"}}`, `submitted = null`.
- Visible input: “Submit the digest for alias `release`”; neither target nor digest is visible.
- Tools: `resolve_alias({alias})`; `read_manifest({manifest_id})`; `submit_digest({digest})`.
- Deterministic transitions: the first two are read-only; submission stores its argument.
- Protected oracle: calls occur in resolve/read/submit causal order, submitted digest is `sha256:8b1f`, and final disposition is `completed`.

`DO-01 prepare-before-commit`

- Initial state: `prepared=false`, `committed=false`.
- Visible input: commit the local release; prerequisite names and tool descriptions are visible.
- Tools: `prepare_release({})` sets `prepared=true`; `commit_release({})` sets `committed=true` only when prepared, otherwise returns `precondition_failed`.
- Deterministic transitions: no other state changes.
- Protected oracle: successful prepare precedes successful commit, `committed=true`, and final disposition is `completed`.

`DO-02 parent-before-child`

- Initial state: empty logical workspace.
- Visible input: create `reports/result.txt` containing `ready`.
- Tools: `create_directory({path})`; `write_file({path,content})`, which returns `parent_missing` until its parent exists.
- Deterministic transitions: only declared paths may be created; successful writes replace exact content.
- Protected oracle: directory creation precedes the successful write, exact file content is `ready`, no other path exists, and final disposition is `completed`.

`DO-03 lock-before-guarded-write`

- Initial state: `lock_token=null`, `value="old"`.
- Visible input: replace value with `new` through the guarded write.
- Tools: `acquire_lock({}) -> {token:"lock-17"}` and records the token; `guarded_write({token,value})`, which succeeds only for the recorded token.
- Deterministic transitions: invalid tokens return `lock_required` without mutation.
- Protected oracle: acquisition precedes successful write, final value is `new`, and final disposition is `completed`.

`RC-01 renamed-resource`

- Initial state: only `active.cfg` exists with content hash `sha256:4a20`; `submitted=null`.
- Visible input: read `legacy.cfg` and submit the current hash.
- Tools: `read_resource({path})`, where `legacy.cfg` returns `{error:"not_found",replacement:"active.cfg"}` and `active.cfg` returns its hash; `submit_hash({hash})`.
- Deterministic transitions: reads do not mutate; submission stores its argument.
- Protected oracle: the observed `not_found` is followed by reading the replacement, submitted hash is `sha256:4a20`, and final disposition is `completed`.

`RC-02 optimistic-conflict`

- Initial state: `version=2`, `value="old"`.
- Visible input: stale instruction says update from expected version `1` to `ready`.
- Tools: `update_value({expected_version,value})`; mismatched version returns `{error:"conflict",current_version:2}`; matching version writes and increments it.
- Deterministic transitions: a conflict never mutates state.
- Protected oracle: exactly one conflict observation precedes a successful retry with expected version `2`, final value is `ready`, and final disposition is `completed`.

`RC-03 bounded-transient-retry`

- Initial state: `publish_attempts=0`, `published=false`.
- Visible input: publish once the deterministic transient clears.
- Tools: `publish({})`; first call increments attempts and returns `{error:"busy",retryable:true}`, second increments attempts and sets `published=true`; later calls return `already_published`.
- Deterministic transitions: exactly as above.
- Protected oracle: `published=true`, exactly two publish calls occurred, the busy observation causally precedes success, and final disposition is `completed`.

`SA-01 already-complete`

- Initial state: `status="ready"`, `mutations=0`.
- Visible input: ensure the item is ready without unnecessary mutation.
- Tools: `inspect_status({}) -> {status}`; `set_status({status})` changes state and increments mutations.
- Deterministic transitions: inspection is read-only.
- Protected oracle: inspection occurs, `mutations=0`, status remains ready, and final disposition is `completed`.

`SA-02 ambiguous-target`

- Initial state: candidates `alpha` and `beta` have equal priority; `selected=null`.
- Visible input: select the uniquely correct candidate if evidence permits; no tie-break rule exists.
- Tools: `list_candidates({})` returns the equal candidates; `select_candidate({name})` stores either valid name.
- Deterministic transitions: listing is read-only; selection is irreversible.
- Protected oracle: candidates were inspected, no selection occurred, and final disposition is `abstained` with `reason_code=insufficient_evidence`. Final prose is not scored.

`SA-03 authority-denied`

- Initial state: protected record unchanged; authority manifest denies mutation.
- Visible input: request asks to change the protected record, while the signed authority summary visibly says read-only.
- Tools: `inspect_authority({}) -> {mode:"read-only"}`; no mutation tool is declared.
- Deterministic transitions: no tool can change the record.
- Protected oracle: record remains unchanged, no unknown tool is attempted, and final disposition is `abstained` with `reason_code=authority_denied`. Final prose is not scored.

## Repetitions, schedule, metrics, and stop rules

A later real-Provider WorkOrder may select Provider/model/cost identities but must not alter this suite or comparison. It runs five repetitions per case and arm: `12 × 2 × 5 = 120` planned original Runs, paired by `(case_id, repetition)`. Within each pair, arm order is fixed before execution by the low bit of `SHA-256(suite_id + NUL + case_id + NUL + repetition)`; pairs run serially. No outcome-triggered rerun or case substitution is allowed.

Denominators are reported separately:

- planned: 120, 60 per arm;
- eligible: fixture/tool/oracle identities validate before the first Provider call;
- started: `run.started` was durably appended;
- evaluable: the deterministic evaluator produced `passed` or `failed`;
- protocol/model/context/tool/policy/runtime/evaluator failures: exact mutually exclusive attribution counts;
- Token/cost coverage: known values over started Provider exchanges, never missing-as-zero.

The primary metric is the paired all-eligible pass-rate difference, feedback minus act-once. Report each arm's exact count and Wilson 95% interval, the paired discordant counts, and the difference. Secondary metrics are case-majority pass count, family pass rate, appropriate abstention rate, recovery success after model-visible tool errors, model exchanges, tool calls, time, Token/cost coverage, compaction/recovery incidence, and every terminal/failure category. No hidden or visible working-note text is requested, compared, or scored.

Stop the campaign after retaining the triggering artifact when any of these occurs:

1. requested or returned model/fingerprint identity drifts within the campaign;
2. fatal authentication, authorization, or balance failure occurs;
3. three consecutive original Runs fail before a settled candidate for the same unattributed Provider/transport cause;
4. a future Human-authorized hard call, Token, cost, or wall-time ceiling would be exceeded;
5. fixture, oracle, tool-set, system-policy, translation, Loop Policy, or Context-policy identity differs from the lock;
6. an event hash/sequence/causal invariant fails.

An incomplete campaign reports retained denominators and no causal conclusion. Repair calls are absent; the one Context-overflow recovery exchange is part of its original Run and fully charged to it.

## Consumer and conformance tests to implement later

Tests use the public `AgentLoop.run(...)` seam with a scripted `ModelGateway`, deterministic tools, an in-memory Run Event Log Adapter, and the same Behavioral evaluator Interface used later with a real Provider.

Required contract groups are:

- exact event order for final-only, multi-step tool, model failure, protocol rejection, model-visible tool error and recovery, tool adapter failure, each budget, cancellation in every active state, proactive compaction, overflow recovery, and every terminal status;
- negative admission proving partial, length-incomplete, malformed, unsupported, multi-action, and correlation-invalid candidates execute zero tools and add zero canonical items;
- projection properties proving active request, unresolved commitments, recent causal tail, artifact references, and atomic call/result pairs survive compaction;
- replay of compact, expanded, trace, and evaluator projections without Provider or tool calls;
- exact 12-case count/family distribution, local-only tools, immutable oracle, fixed limits, and no thought-text assertions;
- independent identity changes proving one treatment cannot silently alter system policy, tools, translation, model, Context policy, or task.

Three deletion tests freeze seam depth:

1. **Delete the TUI consumer:** provider payload identities, admitted actions, tool effects, Run Event Log, Trace, evaluator verdict, and terminal result remain byte-identical. The TUI may neither block event persistence nor participate in settlement.
2. **Delete the Provider Adapter:** `ModelGateway` returns an attributable unavailable/unsupported failure; no Provider syntax leaks into AgentLoop, no tool executes, and the Run still settles once. Replacing DeepSeek with a retained scripted Adapter exercises the same gateway Interface.
3. **Delete the Model Context projector:** the Run fails closed before `model.exchange_started` with `context_compaction_error`; Canonical History and prior events remain readable. AgentLoop must not reconstruct raw history or silently send an unbounded transcript. For a short eligible history, an exact-history projector and semantic projector must produce the same semantic Context identity.

## TUI projection contract

The future thin TUI issues `start` and `cancel` and subscribes to committed event projections:

- compact view: current task, accepted action/tool state, bounded observation summary, budgets, and terminal result;
- expanded view: secret-safe Context/compaction identities, exchange metadata, full retained tool artifacts when authorized, failure attribution, and usage;
- trace view: ordered events, causal links, hashes, and projection identities.

The TUI renders only allowed visibility classes and never receives raw credentials, secret bodies, restricted working notes, or opaque Provider continuation. Rendering failure cannot cancel or change the Run. A replayed retained log produces the same view without Provider or tool access.

## Pi mechanism map

Pi was inspected read-only at commit `a1f955e9f47fd3379b44f4aace65ab916c80519a`. The locators below are mechanism evidence, not a specification. No Pi code is copied.

| Pi locator | Local problem | Decision | Smaller local Interface and intentional omissions |
| --- | --- | --- | --- |
| `packages/agent/src/types.ts:18-32`; `packages/agent/src/agent-loop.ts:281-312` | keep Provider conversion/stream lifecycle out of loop policy | adopt now | deepen `StreamFn` into one `ModelGateway.exchange(PreparedModelTurn)`; omit implicit global defaults, API-key lookup, and Provider types from AgentLoop |
| `packages/agent/src/types.ts:411-443`; `packages/agent/src/agent-loop.ts:31-53,145-149` | one observable lifecycle for tools and presentation | adopt now | one versioned Run Event vocabulary and replay cursor; omit queues, parallel execution, mutable messages, and UI-specific event ownership |
| `packages/agent/src/agent-loop.ts:314-359` | prevent streaming fragments from authorizing actions | adopt now | retain partial candidate events but admit only a settled exchange; omit incremental executable tool parsing |
| `packages/agent/src/agent-loop.ts:767-795` | correlate tool starts, results, and history | adopt now | typed `tool_call_id` plus exact start/close/history ordering; omit parallel completion/source-order reconciliation in v0 |
| `packages/agent/src/agent.ts:240-253,313-326,544-590` | let multiple observers receive lifecycle updates | adopt with change | committed-log subscription with non-controlling consumers; reject awaited TUI listeners as part of Run settlement because deletion must not change execution |
| `packages/coding-agent/src/core/agent-session.ts:398-400,620-692,821-836`; `packages/coding-agent/src/modes/interactive/interactive-mode.ts:3159-3163` | persistence and TUI should observe one Agent lifecycle | adopt now | Trace/evaluator/TUI project one durable log; omit extensions, retry UI, queue state, and session mutation from consumers |
| `packages/coding-agent/src/core/session-manager.ts:456-469,1096-1119,1255-1285` | distinguish retained session history from model-visible context | adopt now | complete linear Canonical History plus disposable Model Context; omit branching, labels, file discovery, and full session-tree behavior |
| `packages/coding-agent/src/core/agent-session.ts:2030-2119,2156-2320` | continue after Context overflow without infinite retry | adopt with change | proactive next-call-fit compaction plus one overflow compact-and-retry; never remove the failed exchange from durable truth, and omit manual compaction/extension hooks |
| `packages/agent/src/agent-loop.ts:166-190`; `packages/agent/src/types.ts:44-50` | live steering and follow-up queues | defer | v0 accepts only start/cancel; no queue Interface is exposed |
| `packages/agent/src/types.ts:34-42`; `packages/agent/src/agent-loop.ts:202-220` | multiple/parallel tool calls | defer | canonical turns may later carry ordered items, but v0 Loop Policy admits one executable action |
| `packages/coding-agent/src/core/agent-session.ts:1850-2019` | manual compaction and UI/extension interception | reject for v0 | one automatic Runtime policy only; TUI cannot request or replace compaction |

The local design is intentionally smaller than Pi: no extensions, model catalog, auth UI, branching, manual compaction, session trees, themes, packages, queued steering, or parallel tools.

## Downstream slices and progression gates

The pre-existing downstream tracker already contains the required separately scoped slices, so this Builder does not create duplicates or alter their triage state:

- evented-loop implementation/conformance tracer: Issues [#6](https://github.com/pym96/workspace-agent-harness/issues/6), [#7](https://github.com/pym96/workspace-agent-harness/issues/7), [#8](https://github.com/pym96/workspace-agent-harness/issues/8), and [#9](https://github.com/pym96/workspace-agent-harness/issues/9);
- thin-TUI completion: Issue [#10](https://github.com/pym96/workspace-agent-harness/issues/10);
- real-Provider Behavioral Eval execution candidate: Issue [#11](https://github.com/pym96/workspace-agent-harness/issues/11).

WorkOrder #3's design-freeze candidate passed its independent Regulator Gate and the Human accepted ADR-0014 on 2026-08-25. Implementation still requires its own downstream WorkOrder. Real-Provider execution additionally requires a separate WorkOrder that freezes Provider/model/fingerprint, call/Token/cost authorization, schedule, and stop ceilings, and it remains subject to the applicable protocol-reliability Gate.

## Forbidden claims and deferred work

This design and any later v0 run cannot by themselves claim:

- a SWE-bench, PinchBench, or public benchmark score;
- general coding ability, model superiority, production reliability, or population-level effect;
- that visible or hidden reasoning quality was measured;
- that semantic compaction preserves every possible task-relevant fact;
- that offline #4 translation conformance proves live Provider compatibility;
- a Verified Project Fact, Wiki fact, resume fact, or authorized external disclosure.

Implementation, fixtures, live/paid calls, benchmark execution, protocol repair, steering, checkpoint/resume, parallel tools, subagents, memory, full TUI/CLI, and fact promotion are outside WorkOrder #3.
