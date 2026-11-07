# #152 consumer-readiness evidence

Builder candidate evidence for [CR1.0](https://github.com/pym96/Pan-agent/issues/152), based on accepted `01a9a40765d68bba604d8098ad8fe4a04a26651c`. Independent acceptance is pending. The final Handoff comment binds the remote candidate commit; these checks do not promote a project/resume fact.

## Identity and reproduction

[User guide](../../demo/consumer-readiness/README.md) · [Executable walkthrough](../../../scripts/consumer-readiness/README.md)

- Built package: `pan-agent-0.1.8.tgz`, SHA256 `4418b365ca36a4c4d9ee3158b5cad0912829486989546b30ab69cc0f822586a9`.
- Tested Node **v26.7.0**, macOS arm64. Package minimum **>=22.19.0** is the declared requirement, not a tested-minimum claim.
- Production-only offline installation succeeded; all **122** package files match the archive; no TypeScript compiler or third-party runtime dependency in the consumer.
- **73** tracked runtime-source/package/lock files match the accepted baseline byte-for-byte. Only allowed documentation and walkthrough tooling change.
- Published v0.1.6 and historical video links keep their original versions. No release or provider/Docker execution was performed.

## Installed walkthrough observations

| Check | Observed |
|---|---|
| Installed help | Root help describes Sandbox; loop/goal/execution help succeeds |
| Four-second loop | 4 completed attempts; `deadline_exceeded`, exit 0 |
| Ten-second goal | 1 attempt; executable verifier PASS; `succeeded`, exit 0 before deadline |
| Verifier exit 2 | UNKNOWN; `needs_review`, exit 1; no success claim |
| Invalid `0s` duration | Exit 2 before state-directory creation |
| Inspect | Saved goal result; state/workspace/memory hashes unchanged |
| Owned children / network | Recorded worker/supervisor/verifier PIDs settled; zero guarded Node network attempts |

This is a **Faux scripted control-flow test with a pre-existing artifact**, not model task solving, a benchmark score, hostile-code isolation or proof of all failure scenarios. The loop's `modelCalls` count refers to Faux exchanges; no provider was called. The network guard is instrumentation, not a new product capability.

Raw evidence is retained outside the public repository: original pack/install outputs, exact archives and installed trees, run01–04 outputs (including failures), command ledgers, state/archives, package identity and integrity manifest. The Handoff supplies their locators/hashes to the independent Regulator. Raw local paths are intentionally not copied into public documentation.

## What changed our understanding

Accepted runtime tests did not mean the published install had those features: README linked v0.1.6 while describing later v0.1.8 source commands. Builder separated those paths instead of advertising a nonexistent release. Installed testing also found `sandbox --help` unsupported (exit 2); the guide now points to root `--help`, which lists Sandbox. No runtime change was needed.

Other retained Builder failures: an unsuitable local Homebrew Node executable failed to load a library before Pan ran; an incorrect npm pack working directory failed; the first walkthrough revision had a syntax error before invoking Pan. These were environment/tooling errors, not product failures. Subsequent successful checks use the working Node26.7 executable and the corrected installed-only runner. A provisional link check also found this not-yet-created evidence index; the final link check is retained separately.

Human chose the product goal and acceptance contract; Master scoped the WorkOrder; Builder authored navigation/tooling and gathered this evidence; independent Regulator decides acceptance. No old failure record was overwritten.
