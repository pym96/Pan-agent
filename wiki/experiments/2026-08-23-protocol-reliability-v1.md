# Fixed-context DeepSeek action-protocol reliability

- Type: verified-learning-fact
- Verification: experiment-reproduced
- Source: `.runs/protocol-reliability-v1/` manifest `sha256:4a268ecea3e8f852d5d571bb7d9a7f6a1d03ea92681d9bb20b10311ab1c21814`; corrected deterministic summary SHA-256 `c36894362f4f0b92c6f9df9b6e9e96ae439d6fda561c1f0a3b998b1a3d519d31`; [candidate Evidence record](../../docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md)
- Updated: 2026-08-23

## Verified facts

- The frozen corpus contains 24 real provider-visible pre-call histories reconstructed from the 30-slot ReAct MVP: all 16 unique terminal protocol-failure contexts and eight deterministic Act-only/ReAct × depth-band valid controls.
- All 240 original context/transport/repetition slots completed during 2026-08-23 09:41:14–09:51:36 UTC. The experiment made 330 provider calls: 240 originals and 90 bounded repairs.
- Without repair, JSON-object transport reached a canonical L3 action in 57/120 calls (47.5%, Wilson 95% 38.8–56.4%) and Strict Function Calling reached L3 in 93/120 (77.5%, Wilson 95% 69.2–84.1%).
- With at most one repair, JSON reached effective L3 in 104/120 attempts (86.7%, Wilson 95% 79.4–91.6%) and Strict reached L3 in 120/120 (100%, Wilson 95% 96.9–100%).
- JSON repair recovered 47/63 eligible failures; 15 responses still lacked the ReAct `thought`, and one repair had a transport error. Strict repair recovered all 27 eligible failures in this fixed run.
- Strict output still required Translation Layer validation: 26 originals contained invalid function-arguments JSON and one had an unexpected argument. Twenty-one invalid argument strings ended with `finish_reason=length`; five ended with `finish_reason=tool_calls`.
- The effective transport difference was cohort-dependent: original Strict exceeded JSON on the challenge cohort (67/80 versus 17/80), while original JSON exceeded Strict on controls (40/40 versus 26/40).
- Repair had measurable cost. Known totals were 514,924 Tokens for J0, at least 773,317 for J1 with 182/183 charged calls covered, 602,134 for S0, and 777,722 for S1.
- All 329 decoded responses returned `deepseek-v4-flash` with the same non-empty system fingerprint. The one transport-error repair has no provider identity or usage and was not retried.

## Boundaries

- These rates describe one provider/model/endpoint time window and 24 correlated fixed contexts. They are not persistent provider reliability or population estimates.
- Protocol validity means that a response canonicalized to bash/finish. It does not establish that the action was useful, safe, task-correct, or executed.
- Strict plus one repair reached 120/120 only in this frozen replay; the Wilson lower bound and observed original failures rule out treating it as a guarantee.
- The experiment is not a SWE-bench score, task-quality comparison, general Harness reusability proof, Verified Project Fact, factual-ledger entry, or resume fact.
- The result and implementation remain Working Agent candidate Evidence until a separate Regulator inspects primary artifacts and negative tests.

## Post-v1 sensitivity qualification

- The no-repair Strict rate is a result under the bundled 2,048-token request ceiling, not an unconfounded estimate of transport alone.
- A 2026-08-24 follow-up raised the same five affected Contexts to 4K, 8K, and a separately identified 16K extension. L3 did not improve monotonically, and 15/25 16K responses still ran exactly to the new ceiling.
- The follow-up supports bounded validation and repair rather than using a 16K default as the protocol fix. See [the maximum-token sensitivity learning fact](2026-08-24-protocol-max-token-sensitivity.md).

## Links

- [Protocol Reliability v1 design](../../docs/design/protocol-reliability-v1.md)
- [ADR-0012](../../docs/adr/0012-freeze-protocol-reliability-v1.md)
- [DeepSeek structured-output mechanics](../sources/2026-08-23-deepseek-structured-output.md)
- [Prior ReAct versus Act-only experiment](2026-08-23-react-vs-act-swebench.md)
