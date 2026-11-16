# #163 onboarding and system guarantees — Builder candidate

[WorkOrder #163 ONBOARD-SYSTEM1.0](https://github.com/pym96/Pan-agent/issues/163#issuecomment-6906385757) starts from accepted `de54065f7d0081df48b537f79f5b2c5077e826e2`. Human requested simple onboarding and an audit of whether timing/recovery comes from system mechanisms. Builder changed documentation and validation only; independent Regulator acceptance is required. No project/resume fact promotion.

## Findings and change

The active consumer guide still advertised v0.1.8 source-only installation and a literal `pan-agent-0.1.8.tgz`, while the actual package and primary README use public v0.1.9. This was a documentation/distribution mismatch, not an observed Runtime defect. The corrected guide installs the public release; checkout is required only for its test driver. Root README retains the short install and links to [the guarantee matrix](../../demo/consumer-readiness/system-guarantees.md).

Existing tests already cover monotonic cadence, global admission counts, late/forged/UNKNOWN goal evidence and interrupted execution. The missing continuous check was the combination of a completed side effect, controller death, read-only inspect and refusal to restart that old state. The new installed test uses a real one-time shell append, kills at the next persisted model reservation, observes owned processes stopped **before teardown**, and asserts that inspect/refused restart leave state, archives and effects unchanged. The original 25 installed tests remain.

The existing onboarding script adds a public URL mode with independent archive SHA256 and complete installed-file identity. Its seven PTY/error cases are reused. Installation network access is separate from the execution-time fetch guard. Runtime code, launchers, package metadata/locks, permissions and the public release artifact were not changed. Correcting the active `typescript/README.md` changes only that documentation member in a newly packed candidate; its archive hash must be reported separately. The published v0.1.9 archive remains immutable and its bundled older README is not replaced by this work.

During pre-Handoff review, the Regulator identified a second documentation mismatch: the real-task example promised one trailing newline but used `$(cat ...)`, which strips trailing newlines. Three retained inputs reproduced the old predicate accepting missing/extra newlines. The real-task example now uses byte comparison (`printf` piped to `cmp`): exact content passes, missing/extra newline fail. The existing scripted walkthrough keeps its original predicate and now states that weaker boundary. This was a review-discovered example correction, not a Runtime failure or new model result.

## Evidence status

Fresh actual public URL installation and seven PTY/onboarding cases passed; the public archive SHA256 is `3f6783bd6674e9e57e49dac7d67a183313a6c61d3a9f1117b476019ab5c3aeab`, with 122 matching installed files. Public installed walkthrough and the new interruption probe also passed. The full shared entry on clean source `d1894d032673a57e481cbfc634f50567f1fcfb61` passed 269 TypeScript tests, 26 installed lifecycle cases, 7 onboarding cases and 8 walkthrough checks, with no unexpected skips. This run preceded the later package-README correction; it is not relabeled as a later-SHA run. The test/runtime files are unchanged by that correction; final candidate package content/install checks and exact-SHA independent/CI results are recorded separately in the Handoff. This is not an acceptance claim.

The final documentation-adjusted candidate archive SHA256 is `4af21a06437a0e68ebe3934d7fd06225d7af40f84daaea225e643829d4fa14da`. All 122 file names match the public archive; only `package/README.md` differs. The complete installed-file comparison and fresh seven-case onboarding on that candidate passed. No Runtime/test/validation-script bytes changed after the full run at `d1894d0`; [the machine summary](summary.json) preserves that distinction.

External raw evidence is retained in the issue-specific Builder directory, with file hashes and location supplied to the Regulator. It includes original guide text, download/install receipts, PTY logs, package/file identities, walkthrough events, process/crash observations and full-suite logs. No original failure is removed or rewritten.

## Limits and contribution

Timing eligibility, admission, independent verification and evidence retention are system mechanisms. Installed automatic schedule/task continuation is absent. The exported checkpoint library interface requires application composition and a compatible adapter; archive replay is not checkpoint resume. Budget settlement idempotence is not general exactly-once side-effect execution.

Human supplied the reliability objective, Builder audited and added test/documentation coverage, Regulator independently reviews, Master coordinates integration. No provider, Docker daemon, server, GPU, credential or npm registry operation occurred. CPU tests do not revalidate Docker containment or prove real-model quality. Historical files retain their original version/scope.
