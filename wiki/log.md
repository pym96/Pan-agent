# Append-only Learning Log

Do not edit or delete existing entries. Corrections are new entries that link to the earlier record.

## 2026-08-13｜Product migration

- Ingested: private first-hand advice from an engineer working on a data-analysis Agent.
- Decision: migrate the product from autonomous research to a Local Workspace Agent while preserving the bounded loop and Trace implementation.
- Evidence: ADR-0008 and the 30-task v1 contract.
- Open: validate six seed tasks before freezing the full Evaluation Suite.

## 2026-08-17｜Learning ingest: harness engineering and agent-design sources

- Ingested five sources: Hung-yi Lee Harness Engineering lecture; Lidang agent career Q&A recording; lidangzzz/goal-driven; nashsu/llm_wiki; jpoehnelt Agent DX CLI scale.
- Added concepts: Harness Engineering; Distrust-driven verification.
- Rationale: recent working sessions produced design-relevant claims (harness three-lever taxonomy, model-specific harness, agents-as-untrusted-operators) that the Runtime/Domain Pack design gate will rely on; per Schema, sources are ingested before use.
- Open: map the harness three-lever taxonomy onto `docs/design/deerflow-mechanism-map.md`; evaluate per-model workflow knobs when the model adapter becomes real.

## 2026-08-17｜Decision: terminology rulings recorded

- Decision page: decisions/2026-08-17-terminology-rulings.md (glossary home, Working/Regulator independence, naming ladder, verification vocabulary, fact-promotion ladder).
- CONTEXT.md gained a "Process and verification vocabulary" section; the historical "Workspace Agent Harness" entry now points to the active definition.
- Correction: harness-engineering.md previously equated General Runtime with the Harness; fixed to the ruled ladder (AgentLoop ⊂ Runtime ⊂ Harness; Wiki outside the product boundary).
- Note: Evidence has exactly two producers (Tests, Domain Evaluator); Criteria are the Gate's yardstick, not evidence.

## 2026-08-18 | Correction: learning and verification boundaries

- Human ruling: the 2026-08-17 closed-Evidence statement is superseded. Evidence may be any inspectable artifact or observation with provenance; Tests and Domain Evaluators are verification mechanisms, not exclusive producers.
- Governance moved out of the Learning Wiki to `docs/governance/`; independently accepted implementation facts now belong only in `docs/evidence/verified-project-facts.md`.
- CONTEXT.md now contains project-specific product language only, and AGENTS.md is a navigation map.
- Wiki admission narrowed to Verified Learning Facts and Open Learning Questions. Unverified interpretation must become a question with a verification path or remain outside the Wiki.
- Decision authority is accepted by the human; implementation verification remains pending until a separate Regulator session accepts this change.

## 2026-08-18｜Regulator acceptance: HF-20260818-019

- Independent Regulator (separate session/process, different model family) verified the verification/terminology/learning-boundary decision: canonical files consistent, negative tests effective (three independent mutation probes), 71+15 tests rerun, full acceptance gate PASS.
- Governance decision `Verification-State: passed`; HF-019 marked processed.
- Defect found and fixed during review: the governance state test was coupled to the live pending state and would fail precisely when verification passed; now derives both state variants synthetically.
- Record: independent Regulator acceptance record, 2026-08-18 (held in the unpublished governance workspace).

## 2026-08-18｜Learning ingest: DPO terminology and skill packaging mechanics

- Ingested: DPO = Direct Preference Optimization (arXiv:2305.18290), correcting the user's initial "Deep Policy Optimization" expansion; PPO = Proximal Policy Optimization is a separate object.
- Ingested: skill packaging mechanics (one directory per skill, harness-generated frontmatter listing, progressive disclosure, local vs global install scopes), observed from the agent-dx-cli-scale install.
- Note: the same session's first-principles "essence of wiki" discussion was left outside the Wiki per the admission boundary (interpretation without a verification path is not a knowledge object).

## 2026-08-18 | Learning ingest: general and vertical evaluation references

- Ingested PinchBench tag `v2.0.0` at commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`; machine inspection found 147 manifest tasks and recorded the OpenClaw runner, mixed grading, usage fields, and in-process task-grader execution boundary.
- Ingested the Composio 30-task model-comparison thread as a source-located methodology reference for pass rate, duration, Token use, tool calls, cost per task, and cost per success.
- Added proposed ADR-0010 and `docs/design/benchmark-strategy.md`: PinchBench becomes a content-pinned external compatibility lane; original deterministic cases form a separate 15+15 vertical evidence lane.
- Boundary: no benchmark was executed, no score was produced, and neither source establishes a project or resume fact.

## 2026-08-19｜Learning ingest: cross-entropy and compression (3Blue1Brown)

- Ingested: 3Blue1Brown video on cross-entropy — compression origins (gzip language trees), the forced-logarithm argument for the training loss, distillation, KL divergence as wasted bits.
- Boundary noted: the session's harness-rules-as-compression synthesis remains outside the Wiki per the admission boundary (interpretation without a verification path).

## 2026-08-19 | Implementation checkpoint after ADR-0009/0010 acceptance

- Human accepted ADR-0009 and ADR-0010, opening the design-to-implementation gate without establishing an implementation fact.
- The Working Agent candidate now exercises exact Pack/Suite identity, authority enforcement, evaluator isolation and limits, Runtime provenance, campaign denominators, cost coverage, and append-only attempt artifacts through the accepted Interfaces.
- Candidate tests are green, but concrete `data-analysis` and `workspace-coding` Pack Adapters, protected workspace snapshots, external benchmark Adapters, task catalogs, and scores remain open.
- Boundary: this entry records work performed and open questions; only `docs/evidence/verified-project-facts.md` can register an independently accepted implementation fact.

## 2026-08-19 | Correction: seed proof Packs implemented as candidates

- The earlier checkpoint's statement that concrete proof Packs remained open is now superseded: one `data-analysis` seed and one `workspace-coding` seed run through the same Runtime and scripted Model Adapter.
- Workspace fixtures are staged into per-run roots and frozen into protected snapshots before deterministic evaluation. The coding evaluator rejects nested imports, audits a restricted AST, and runs fixed hidden cases in an isolated-interpreter subprocess.
- A two-case suite runs through the Campaign Module under the explicit lane `vertical-development-smoke`; it is development evidence, not the planned 15+15 suite or a benchmark score.
- Open: independent implementation review, a real provider, 14+14 additional frozen cases, a PinchBench Adapter, and publishable repeated measurements.

## 2026-08-19 | Regulator rejection and candidate remediation

- The first independent implementation review rejected the candidate because Pack/Suite hashes were shape-checked rather than recomputed, a timed-out evaluator thread could continue side effects, Campaign provenance/failure attribution was incomplete, and the coding evaluator omitted the visible public test and raw process evidence.
- The Working Agent candidate now recomputes Pack implementation/material and Suite source/case/transform/identity hashes, terminates timed-out evaluator processes, records configuration/component/evaluator/pricing provenance plus usage and failure attribution, and retains public/hidden coding-test process evidence.
- Negative contracts now cover behavior drift under a reused Pack hash, case drift under a reused Suite manifest, and delayed evaluator mutation after timeout.
- Boundary: these are remediation claims awaiting independent re-review, not Verified Project Facts; the AST/fixed-command evaluator remains explicitly short of a general OS sandbox.

## 2026-08-19 | Second Regulator rejection: explicit provenance and freeze semantics

- The second independent review accepted Suite drift checks, evaluator timeout cleanup, Campaign denominators, and coding public/hidden execution, but found that heuristic Adapter state hashing could collide, evaluator identity did not directly change with evaluator semantics, registered Pack objects could drift after creation, and all-Runtime-error campaigns lost detailed baseline provenance.
- The candidate now requires explicit secret-free Adapter identity material, revalidates Adapter and Pack identities before each run, binds evaluator identity to the exact Pack bundle, and seeds every Campaign report from creation-time Runtime provenance before adding attempt observations.
- New negative contracts cover different private model configurations, missing Adapter identity declarations, post-creation Pack/model drift, and campaigns where every Runtime call raises.
- Boundary: these corrections remain Candidate Claims until another independent review; credentials must never enter identity material, and no production/security/public-benchmark claim is released.

## 2026-08-19 | Third Regulator rejection: live helper rebinding

- The third independent review accepted the explicit Adapter identity, Pack instance revalidation, evaluator bundle identity, and Campaign baseline provenance changes, then showed that rebinding a loaded module helper could still change a bound Pack evaluator while preserving the old identity.
- The candidate registration now clones Pack compile/evaluate methods and same-module helper functions into a private globals snapshot. Live rebinding of the data renderer or coding AST audit helper after Runtime creation no longer changes the registered execution path.
- A regression contract replaces both helpers in memory after Runtime creation and requires both seed runs to retain their original passing semantics and identities.
- Boundary: the snapshot freezes the current repository-local Python Pack path under test; it is not a general hostile-code, mutable-extension-module, or OS sandbox claim, and still awaits independent re-review.

## 2026-08-19 | Fourth Regulator review: ordinary implementation accepted

- A separate same-model Regulator reran module-helper rebinding and original-helper `__code__` replacement probes; both seed paths retained their registered passing semantics and exact Pack/Evaluator identities. It also reran the prior Adapter, Pack, Suite, timeout, denominator, provenance, coding, static, and 39-test gates.
- ADR-0009 Runtime/Pack behavior, ADR-0010 Campaign behavior, and the two bounded seed paths were accepted only for operator-trusted Packs in a non-malicious same-process environment.
- The shallow globals snapshot still shares imported module objects. Deliberate interpreter/stdlib mutation remains outside the accepted boundary, as do tamper-proof, general sandbox, production security, public benchmark, task-expansion, project-fact, and resume claims.
- This Learning Wiki entry records the review outcome and limits; it does not register a Verified Project Fact. `docs/evidence/verified-project-facts.md` remains unchanged.

## 2026-08-19｜Learning ingest: multi-agent collaboration survey (chengyongru)

- Ingested: X article `multiagent 协作问题的初步整理` by @chengyongru (posted 2026-08-17); full text captured via the fxtwitter API, tier table and dialogue example transcribed verbatim by the user. Admitted as `source-located`.
- Recorded: the four-tier problem taxonomy; the single-agent justification rule (a multi-agent workflow must exploit a condition a single agent lacks); six reported coordination failure results (Communication-Reasoning Gap, dialogue-vs-silent embodied success inversion, expert-dilution tradeoff, trust-without-correctness, 20-agent sorting failure with CAMOC, DPBench deadlock rates); and the claim that real multi-agent runtimes need explicit, verifiable distributed-systems protocols rather than prompt advice.
- Boundary: all eight cited references were only link-checked (HTTP 200), not read first-hand; every paper claim is recorded as the article's claim. The survey does not expand the single-agent product boundary.
- Added open question: which coordination mechanisms must be Runtime-encoded vs prompt-level if multi-agent execution is ever justified (verification path gated on a concrete requirement plus first-hand paper reading).

## 2026-08-19｜Note: acceptance anchor update by direct human authorization

- The acceptance validator still pins the workspace repo HEAD to `7d267bc` (the HF-019 acceptance state), while the repo has since advanced through commits `31401db` and `116da36` and carries a large uncommitted working tree from 2026-08-18/19 sessions.
- The human directly authorized updating the validator's `EXPECTED_HEADS` anchor to the post-ingest commit. This entry records that the update is a direct human authorization, not an independent Regulator acceptance; the uncommitted backlog still awaits a proper independent Regulator pass.
## 2026-08-19 | Fifth Regulator review: backlog verified and committed

- A new independent Regulator session (same model family, separate process) re-read primary Evidence, reran the 39 Working Agent tests, and added ten new negative probes (`tests/test_regulator_negative_probes.py`): module data-global rebinding fails closed via per-run identity/content revalidation, original-helper `__code__` replacement cannot change frozen evaluation, an evaluator process group including a grandchild is killed on timeout, Pack method rebinding and forged evaluator identities are rejected, resource traversal is policy-blocked, caller grants wider than the Runtime ceiling fail closed, campaign artifact-root overlap and unregistered required packs are rejected, and repeated attempts remain append-only.
- One probe initially asserted the wrong expectation (silent freeze) and exposed that rebinding data globals is instead caught by per-run drift revalidation; the probe was corrected to assert fail-closed behavior. No defect in the candidate was found.
- The backlog was organized into four semantic commits (governance, design packet, implementation candidate with probes, wiki). Acceptance scope remains ordinary operator-trusted implementation behavior; security/authority-boundary claims, public benchmark numbers, fact registration, and resume disclosure stay closed and await explicit Human or different-model review.
- The acceptance validator's workspace HEAD anchor is updated under this review; the previous move to `611a2e9` was direct human authorization, not a Regulator acceptance.

## 2026-08-20｜Learning ingest: ReAct and SWE-agent papers

- Ingested two first-hand papers from `reference_paper/`: ReAct (arXiv:2210.03629v3, ICLR 2023) and SWE-agent (arXiv:2405.15793v3, NeurIPS 2024), both admitted as `source-located` from direct reading of the main bodies.
- Rationale (user framing, recorded as session context, not as a wiki fact): the user positions these papers as supplements to the Hung-yi Lee three-lever taxonomy — ReAct as the loop grammar beneath the levers, SWE-agent as ablation-measured concretization of the tool/feedback levers. This cross-source mapping remains an interpretation and is deliberately not asserted on any fact page.
- Recorded on the ReAct page: the `A ∪ L` action-space formulation, dense-vs-sparse thought placement, HotpotQA/FEVER numbers, the hallucination-vs-reasoning-error tradeoff from the 200-trajectory human analysis, finetuning results, and ALFWorld/WebShop outcomes including the ReAct-IM ablation.
- Recorded on the SWE-agent page: the ACI concept, the four design principles, the interface components, headline SWE-bench numbers, the per-component ablation table, and the behavioral findings (failed-edit recovery drop, succeed-fast/fail-slow, failure taxonomy).

## 2026-08-20 | PinchBench P0 configuration audit

- Re-audited the pinned PinchBench `v2.0.0` checkout through the new content-lock candidate: exact commit, `tasks/` tree, manifest SHA-256, clean worktree, manifest/task-file set, frontmatter IDs, grading types, timeouts, and per-task content hashes.
- The core/full catalogs resolve to 21/147 tasks. No task or embedded grader was executed; every task remains pre-run ineligible until an explicit local translation and protected evaluator exist.
- New source observation: `task_polymarket_briefing` is categorized as `research` in the canonical manifest and `Research` in its frontmatter. The candidate retains this capitalization discrepancy in source provenance.
- Added an original 15+15 vertical configuration. Only the two already-implemented seeds are eligible; 28 configured cases remain visibly ineligible. A two-attempt development smoke is not recorded as a benchmark score or project fact.

## 2026-08-20 | Benchmark configuration Regulator rejection and remediation

- The first independent configuration review rejected the candidate because the two eligible catalog entries named evaluators that did not match the real seed Pack `ControlProjection`, while the loader accepted forged fixture/evaluator declarations by recomputing a new valid Suite identity.
- The same review found that PinchBench task frontmatter could omit `timeout_seconds` or provide zero/negative values despite the documented timeout audit boundary.
- The Working remediation corrects the evaluator IDs, derives and validates each eligible seed's real fixture/evaluator control identities, retains those exact identities in source provenance, and requires a present positive-integer timeout. New negative contracts cover forged fixture/evaluator values and missing, zero, negative, or non-integer timeouts.
- Boundary: these are remediation claims awaiting a fresh independent review. No benchmark task/result, public number, VPF, factual-ledger entry, or resume claim was added.

## 2026-08-20 | Benchmark configuration second Regulator review accepted

- The same independent Regulator re-read the remediated snapshot and reran its forged-control and timeout probes. Forged fixture/evaluator values plus missing, zero, negative, and non-integer timeouts all failed closed.
- It matched each resolved eligible control to Pack compilation and actual RunReport fixture/evaluator provenance, confirmed vertical configuration identity `sha256:834a3141470bb69acb69b7a37241bd1753f92a64613b9b94623f360b47d85005`, retained Pinch 21/147 as entirely ineligible, and rebuilt/installed the wheel with all locks.
- Ordinary configuration-only boundary: accepted. Pinch translation/execution, official compatibility, public results, the remaining 28 case implementations, high-risk security Claims, VPF, factual-ledger, and resume changes remain outside the Gate.

## 2026-08-20 | ReAct MVP and SWE-bench environment learning checkpoint

- Added an experiment-reproduced fact for the pinned official SWE-bench runner, current enriched Lite dataset source, and ARM Docker behavior. The first implicit x86_64 image acquisition failed as infrastructure; an explicit `linux/amd64` pull followed by the same official gold evaluation completed and resolved the probe.
- Added the bounded Act-only versus visible-ReAct question: five frozen Lite development cases, three repetitions, DeepSeek V4 Flash with provider thinking disabled, bash-only Docker execution, full trajectories, lossless raw command streams, and official `resolved` as the primary outcome.
- The first authorized DeepSeek chat request failed with insufficient balance before a usable completion, so the 30-attempt question remains open. No model outcome, benchmark score, Verified Project Fact, factual-ledger entry, or resume claim was created.
- Corrected the executable dataset source from the older `princeton-nlp/SWE-bench_Lite` copy to the current official `SWE-bench/SWE-bench_Lite` revision containing runner execution metadata. The selected IDs did not change.

## 2026-08-20 | Five-case SWE-bench gold gate completed

- Downloaded the exact Lite development parquet from revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`, locked its SHA-256, and paired each of the five mutable image tags with its observed registry digest.
- All five frozen cases completed and resolved their official gold patches under the pinned runner with zero unresolved, infrastructure, ambiguous, evaluator-error, or unstopped-container counts.
- Added reproducibility scripts for one exact gold gate and one pre-gated Agent attempt. The latter retains full Trace, lossless raw command streams, patch, provider usage, and official evaluation while refusing overwrite and configuration/gate drift.
- Boundary: gold success establishes evaluator eligibility only. DeepSeek balance still blocks Agent execution, so no Act-only/ReAct outcome or SWE-bench score exists.

## 2026-08-23 | ReAct MVP 30-slot experiment reproduced

- Superseded the earlier open Act-only/ReAct question after executing every frozen matrix slot. Twenty-nine slots retained task outcomes and one retained an infrastructure/artifact failure; the raw run-root manifest is `sha256:7a3a153f888f602187e500ac2a693f786d0a5852391f736920354b41d998596a`.
- Act-only and visible ReAct each produced one resolved patch among 15 planned slots, on different cases. One Act-only infrastructure failure leaves task-outcome denominators of 1/14 and 1/15; the result is not a balanced performance estimate.
- Recorded the dominant failure boundary: 26 model-error terminals (16 invalid JSON, 10 missing ReAct thought), four step limits, 26 empty patches, three non-empty patches, and no successful final AgentLoop terminal. Both resolved patches survived a later model/protocol error, demonstrating that Runtime terminal state and evaluator task outcome must stay separate.
- Recorded measurement gaps rather than filling them with zeros: provider usage covers 196/252 calls and v1 persisted no durations. Post-run fixes retain invalid-response usage, preserve the container on ordinary command timeout, record timing, and persist patch-extraction failures; they did not alter or rerun the matrix.
- Boundary: this is an experiment-reproduced five-case learning fact and candidate project Evidence, not a SWE-bench Lite score, Verified Project Fact, factual-ledger entry, or resume fact. A newly frozen protocol-reliability gate is required before selecting a SWE-agent-style ACI treatment.

## 2026-08-23｜Learning ingest: Anthropic harness definitions and first-principles core

- Ingested two Anthropic primary sources (trustworthy-agents research page, managed-agents engineering page) as one source-located page: the normative definition ("instructions, and the guardrails, that the model operates under"), the operational definition ("the loop that calls Claude and routes Claude's tool calls to the relevant infrastructure"), the session/harness/sandbox runtime split, and context management assigned to the harness.
- User authorized adding the first-principles core to the Harness Engineering concept page: a raw model call is a stateless text-to-text function, so identity, instruction framing, action execution, continuation, memory, and enforcement must be supplied by non-model components. The concept page now rests on four sources.
- Session synthesis (recorded here, not on fact pages): the internalized one-line definition — "the model thinks; the harness decides what it sees each turn, what its output becomes, and when the loop stops."
- Boundary: the consciousness/cognitive-system analogy from the previous session remains outside the Wiki per the user's decision; only the checkable statelessness premise and the definitional synthesis were admitted.

## 2026-08-23｜Learning ingest: Earendil "What is a harness"

- Ingested the Earendil product blog post (2026-08-20) as source-located, after fetching the URL and confirming it matches the text the user pasted in session.
- Recorded: the four-component framing (system prompt / tools / agentic loop / translation layer), the "harness describes tools but the model decides when to use them" point, and the section-IV agency argument (portable harnesses shift power from AI labs to end users) marked as the author's normative position.
- Boundary noted: vendor blog; its decomposition differs from Anthropic's narrow usage, where tools and environment are adjacent layers the harness routes to.
- The Anthropic-definitions ingest and this page are both uncommitted per the user's decision; they sit alongside another session's uncommitted work and must be isolated at commit time.

## 2026-08-23 | Sixth Regulator review: ReAct MVP backlog verified

- A new independent Regulator session (same model family, separate process) re-read ADR-0011, the design, and all three Evidence records; reran the 68-test suite; and independently recomputed from raw artifacts: the pinned parquet SHA-256, the deterministic five-case selection order, the config content hash, per-variant outcome/failure/Token aggregates, the gold-gate report hashes, the incident-slot anatomy, and the patch-before-failure ordering in the resolved trajectories. All claims reproduced.
- New Regulator probes (now `tests/test_regulator_react_mvp_probes.py`): slot instance/config-hash tampering fails the summary closed; protocol rejects unexpected fields, non-bash tools, and config drift. Credential scan of `.runs/` found no key material.
- Scope: ordinary candidate Evidence verification. The 30-slot result remains a five-case development smoke — not a score, VPF, or resume fact. The frozen `protocol-reliability-v1` experiment (human-grilled design: 24 frozen contexts, J0/J1/S0/S1, one bounded repair, layered L0-L3 metrics, five repetitions, Wilson intervals, time-window identity) is the next Working Agent gate.

## 2026-08-24｜Learning ingest: Trace vs thought, thought-entropy question

- Ingested the Trace-versus-thought-trajectory distinction as a source-located concept page, verified against this repository's `load_trace` integrity rules and trace behavioral tests plus the already-ingested Anthropic session definition. No external source was needed: the repo code is the primary locator.
- Admitted the session's information-entropy discussion as an open question (why self-generated thought improves action quality), with the entropy framing explicitly marked as interpretation; the user intends to find citable theoretical sources later.
- The user's refined Runtime formulation (Context/Observation/Tool-schema/Tool-executor/Agent-Loop distinctions, model-portable wording) was reviewed against `CONTEXT.md` and existing concept pages; its checkable content is already covered by the Harness Engineering page and project terminology, so no new fact page was created for it.

## 2026-08-24｜Correction: local source locators after reference-library reorganization

- The human confirmed the `30-已有资产与参考/` reorganization was intentional: reference repos moved from `工具与方法参考/` to `candidate-projects/`, and `reference_paper/` was renamed `reference-paper/`.
- Locators updated (content unchanged): the ReAct and SWE-agent source pages now point at `reference-paper/`; project design docs and the acceptance validator now point at `candidate-projects/`. Pinned commits (`88252e9`, `54cc51a`) and remotes are unchanged.
- Earlier log entries that mention the old paths are historical records and intentionally left untouched per the append-only rule.
