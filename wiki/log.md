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
