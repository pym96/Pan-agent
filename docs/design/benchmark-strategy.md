# General and Vertical Evaluation Strategy

Status: Human-accepted design. The Evaluation Campaign kernel and two-case `vertical-development-smoke` path passed ordinary same-model Regulator review; no PinchBench Adapter, 15+15 suite, external run, result, public score, or project fact is implemented or accepted.

## Decision snapshot

Evaluation has two lanes outside the General Agent Runtime:

1. **General compatibility lane:** use a content-pinned PinchBench profile to test breadth and external task compatibility.
2. **Vertical evidence lane:** freeze 30 local cases, 15 for `data-analysis` and 15 for `workspace-coding`, and compare runs under one Runtime and model configuration.

One deep **Evaluation Campaign** Module orchestrates both lanes through the public `GeneralAgentRuntime.run(RunRequest) -> RunReport` Interface. It cannot call a model, tool, pack evaluator, workspace collaborator, or Trace writer directly. A suite supplies cases and provenance; the Runtime remains the only execution path, and the selected Vertical Domain Pack remains the owner of each case's deterministic evaluation.

This placement keeps benchmark selection and aggregation out of the Runtime. Deleting the campaign Module would force version pinning, repetitions, eligibility, artifact retention, and metric aggregation into every benchmark caller; it therefore earns Depth rather than acting as a pass-through.

## Why PinchBench is an external profile, not a Runtime specification

The selected upstream source is `pinchbench/skill` tag `v2.0.0`, commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`. The inspected `tasks/` Git tree is `1368925645e3bffa49fb2d238958e2530236a3e0`; `tasks/manifest.yaml` has SHA-256 `38d7cd1bddfa5e9fefc7b6945c91955f36dc5c88c32c994bf8676344b1069a7b`.

Machine inspection of that pinned source found 147 unique manifest tasks in 11 categories, a 21-task `core` list, 25 automated tasks, 101 hybrid tasks, 21 LLM-judge tasks, and three multi-session tasks. The same tag's README says 53 tasks, its `SKILL.md` lists 23, and its release prose has advertised another count. The adapter must therefore trust the pinned manifest and content digests, not prose task counts.

The upstream runner is coupled to OpenClaw: it creates an OpenClaw agent and invokes `openclaw agent`. It also extracts Python grading code from task Markdown and executes that code in the benchmark process. The local Harness will not run upstream grader code inside the host Runtime process.

Consequences:

- a local translated result is labelled `pinchbench-compatible`, never an official PinchBench or leaderboard result;
- no upstream task is eligible merely because it appears in the manifest;
- official compatibility is deferred until an unmodified, pinned upstream runner can invoke the Harness through a documented Adapter and the required tool surface exists;
- PinchBench does not define Runtime policy, Trace, pack ownership, or success semantics.

## PinchBench compatibility stages

### Stage P0: catalog audit

Verify the tag, commit, task-tree digest, manifest digest, task IDs, fixtures, grading type, tool requirements, network requirements, session semantics, and license. Source drift or a missing artifact aborts before any Runtime call.

### Stage P1: portable translated profile

Admit only an explicitly frozen list of tasks that can be translated into an existing proof pack without adding Runtime branches. Each translation records:

- upstream task ID and content digest;
- local case ID and transform version/hash;
- selected pack ID/version/hash;
- fixture mapping and authority request;
- deterministic Domain Evaluator mapping;
- intentional omissions from the upstream task or grader.

For the first profile, LLM-judge and hybrid tasks are ineligible for the primary pass metric. Automated tasks are still ineligible until their grader logic has been reviewed and re-expressed as a protected Domain Evaluator or executed in a separately accepted isolated grader. Network, email, calendar, image, memory, live-research, skill-installation, and OpenClaw-specific tasks remain ineligible until their capabilities exist and are authorized.

### Stage P2: broader local compatibility

Add cases only when a second real capability Adapter and a deterministic evaluation path justify the new seam. Report every excluded case and reason; never shrink the denominator silently after observing failures.

### Stage P3: upstream-runner compatibility

Run an unmodified pinned PinchBench runner only after an accepted Adapter makes the Harness callable through its required agent surface. Preserve upstream task and grading semantics, raw transcripts, runner version, and official/non-official submission state. This stage may require a later `general-assistant` pack, but the current rule still forbids a third domain before the two proof packs are rigorous.

## Vertical evidence lane

The Composio thread is a methodology reference, not a reusable benchmark artifact. It reports one comparison in a minimal third-party harness across 30 practical operations tasks and tracks pass rate, task duration, Token use, tool calls, cost per task, and cost per success. It names task families such as batch edits, email cleanup, repository audits, and cross-app ledger synchronization, but does not publish a frozen task set, runner, graders, raw results, repetition protocol, or variance.

The local 30-case campaign therefore uses original, attributable fixtures and deterministic evaluators:

- `data-analysis`: 15 cases spanning schema inspection, filtering, exact arithmetic, grouping, joins, missing/malformed values, dates, rankings, and anomaly handling;
- `workspace-coding`: 15 cases spanning navigation, bounded edits, tests, multi-file consistency, configuration repair, failure diagnosis, diff policy, and authority attacks.

The seed cases in [`proof-domains.md`](proof-domains.md) become case 1 of each 15-case pack suite. Additional cases are frozen only after the Runtime contract and seed evaluators pass independent review. Difficulty is produced by real input and failure-mode variation, not by granting unrestricted shell or filesystem authority.

The campaign publishes per-pack results and a 30-case aggregate. A combined aggregate never hides a failing pack, and the two packs use the same Runtime instance, Model Adapter configuration, hard limits, Trace schema, campaign repetitions, and metric rules.

## Selected Evaluation Campaign Interface

The target below is a design contract, not current source:

```python
campaign = EvaluationCampaign.create(
    runtime=runtime,
    suites=[pinchbench_profile, vertical_evidence_suite],
    artifacts_root=campaign_artifacts_root,
)

report = campaign.run(
    CampaignRequest(
        suite=SuiteSelector("vertical-evidence", "1.0.0", "sha256:..."),
        repetitions=3,
        case_ids=None,
    )
)
```

The suite seam is deliberately small:

```python
class BenchmarkSuite(Protocol):
    manifest: SuiteManifest

    def source_material(self) -> JsonValue: ...

    def cases(self) -> tuple[BenchmarkCase, ...]: ...
```

`SuiteManifest` pins suite identity, lane, source revision/digest, case-list hash, canonical transform descriptor/hash, required pack selectors, and metric-schema version. During preflight the Campaign recomputes source, cases, transform, and top-level Suite identity hashes before creating any attempt. `BenchmarkCase` contains one exact `RunRequest`, source-case provenance, eligibility, and a stable ineligibility reason. It cannot contain a model, raw tool, evaluator callback, host path, credential, or alternate execution function.

`EvaluationCampaign.create` requires and snapshots Runtime-owned provenance, validates unique exact suite identities and disjoint artifact/control/workspace roots. `run` selects one exact suite, freezes a campaign configuration digest, invokes only eligible cases through the injected Runtime, retains every attempt, and returns one immutable `CampaignReport`. Aggregate provenance starts from that baseline and then adds attempt observations, so provider/bootstrap exceptions cannot erase Runtime/model/tool/workspace/evaluator identities.

## Eligibility and denominator rules

Every case has one pre-run state:

- `eligible`: all source, pack, fixture, capability, evaluator, and policy prerequisites are satisfied;
- `ineligible`: at least one prerequisite is absent, with a stable reason code.

Ineligible cases are visible in the report but never invoked. Pass rate is:

```text
passed eligible attempts / all attempted eligible attempts
```

Provider, policy, tool, Runtime, timeout, budget, evaluation-failed, and evaluation-error attempts remain in the denominator. A campaign-wide preflight failure, such as source drift or a missing exact pack, aborts before attempts and produces no score. Case selection and eligibility freeze before the first model call and cannot change after observing outcomes.

## Metrics and usage provenance

Primary quality metrics:

- pass rate overall and per pack/category;
- exact passed, failed, error, ineligible, and attempted counts;
- failure-attribution distribution from Runtime and Domain Evaluator records.

Efficiency metrics:

- wall time per attempted case and distribution across repetitions;
- model requests, input/output/cache Tokens, and tool calls;
- observed cost per attempted case;
- observed cost per successful case: total observed attempt cost divided by passed attempts.

Each aggregate reports measurement coverage. Unknown Token or cost values stay unknown; they are not converted to zero. Cost records pin provider/model identity, currency, pricing source or billed-cost field, and observation time. A public comparison requires at least three independent repetitions per case, raw attempt rows, distribution statistics, and the exact configuration digest. A one-run smoke test is labelled development evidence only.

To support these measurements without leaking provider internals into the campaign Interface, `RunReport` gains a Runtime-owned `RunUsage` value populated from structured Model Adapter responses and Trace events. A legacy string-returning Model Adapter may be wrapped with unknown Token/cost fields, but cannot support Token- or cost-efficiency claims.

## Artifact and Bad Case contract

Each attempt retains:

- exact suite, source task, transform, pack, Runtime, model, tool, fixture, evaluator, and pricing identities;
- `RunRequest`, `RunReport`, Trace reference, final artifact snapshot, evaluation record, and usage record;
- wall-clock timestamps and monotonic duration;
- terminal and evaluation failure attribution;
- raw grader/test output where applicable.

Artifacts are append-only by campaign ID. Retries create new attempts and never overwrite a failure. Reports link raw attempts rather than embedding only averages. Public benchmark numbers remain high-risk Claims and require independent review plus a different model family or explicit human review under the governance contract.

## Ordering and failure modes

The campaign owns this order:

1. select the exact suite and verify all source/content digests;
2. resolve exact required pack identities against the already-created Runtime;
3. freeze case order, eligibility, repetitions, Runtime/model/tool configuration digest, and metric schema;
4. run a declared smoke case when the suite requires one;
5. call `runtime.run` once per eligible attempt;
6. persist the complete attempt before starting the next one;
7. aggregate without changing eligibility or dropping Bad Cases;
8. write one immutable campaign report.

Typed pre-run errors cover unknown/mismatched suite, source drift, duplicate case, invalid repetition count, missing exact pack, and artifact-root overlap. Per-attempt Runtime and evaluator failures keep their original attribution. Aggregation errors do not rewrite completed attempts.

## Campaign contract matrix

[`../../tests/test_benchmark_campaign_contract.py`](../../tests/test_benchmark_campaign_contract.py) specifies behavior at the accepted campaign seam:

1. an exact suite selector with the wrong content hash is rejected before any Runtime call;
2. ineligible cases remain visible but are never invoked or included in the pass denominator;
3. cost per task and cost per success use raw attempt cost, preserve a failed attempt's cost, and report measurement coverage;
4. raw attempts are written immediately to a unique append-only campaign directory and linked from the final report.
5. source/case/transform drift fails during preflight before any Runtime call;
6. each attempt retains request, timestamps, duration, terminal/evaluation attribution, and exact configuration/provenance links; aggregate usage, Token, tool, pricing, and failure fields report measurement coverage.
7. execution terminal failures plus evaluation `FAILED`, `ERROR`, `NOT_RUN`, and Runtime exceptions remain distinctly attributed in the attempted denominator.
8. explicit Runtime/model/evaluator baseline provenance remains present when every Runtime call raises before producing a `RunReport`.

These contracts are green and passed ordinary same-model Regulator review. They prove only the generic campaign seam and aggregation behaviors under test. The two-case `SeedVerticalSmokeSuite` development Adapter exists; a PinchBench Adapter, complete 15+15 suite Adapters/catalog, external run, and benchmark result remain absent.
