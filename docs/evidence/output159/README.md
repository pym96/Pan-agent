# External output paths — WorkOrder #159

Builder candidate under [OUTPATH1.0](https://github.com/pym96/Pan-agent/issues/159#issuecomment-6869419603), based on `ec757b30f2840c8a1a329ff501e21b7ee9c7cae1`. The SHA-bound Handoff on that issue identifies raw artifacts and their manifest. Independent review is required; this document does not declare acceptance.

## Observed defect

The existing installed-package tests `test_verifier_timeout_survives_cli_death` and `test_frozen_verifier_owner_parent_fallback_and_sentinel` passed with ordinary evidence paths. With an external `baseline-中文 space` directory, both failed because their expected PID marker did not exist. Raw verifier events still recorded ownership and a confirmed timeout stop. A sibling file named `baseline-中文` instead contained the PID and the remaining path text, followed by heartbeat lines and their remaining path text.

That evidence distinguishes shell tokenization from a failed Runtime launch: the fixtures interpolated unquoted output paths into shell redirections. The earlier #157 source-checkout URL conversion repair does not address this separate shell/data boundary.

## Repair and regression

The two real fixtures now share a command constructor that quotes each PID/heartbeat pathname with `shlex.quote`. Their commands, two-second verifier limit, fault injection, original timing bounds, process-stop checks and unrelated sentinel assertions are otherwise retained. Product Runtime, package inputs, permissions and locks are unchanged.

Nine additional tests execute that constructor through the byte-verified installed CLI. They check ASCII, Unicode, space, both quote characters, percent/hash, command substitution, semicolons, and combined characters including newline/globs. Exact PID identity, live heartbeat progression, preserved filename components, absent harmless canary effects and confirmed stopping are observed. The old unquoted constructor was tested first: three cases passed and six failed. This is an actual command/installed-consumer regression, not a test of `shlex.quote` in isolation.

Both Node CI cells retain the combined-special-character checkout and additionally use a combined-special-character external output directory. All original 16 installed lifecycle cases remain, alongside the nine new cases. The full entry retains the complete TypeScript, onboarding and walkthrough suites.

The first full entry at `dd35e237b289b428f140a0c9b65a01420113dc1e` passed 269 TypeScript and 25 installed lifecycle cases, then exposed another test-script path boundary: onboarding placed its absolute preload path directly in `NODE_OPTIONS`. An output directory containing quotes caused Node to exit 9 with `unterminated string`, before the CLI could start. SC-OUTPATH-GUARD-01 keeps this failed run and permits the same output-path repair in the test script: `Path.as_uri()` encodes the module specifier for Node's option parser. A bounded `data:` fetch probe confirms the preload guard actually intercepts fetch; it requires no network and retains its own output separately. All seven existing onboarding assertions remain.

CI1 at `9d07ddb5b628feab0a94ad25b7a3e20336f458d7` completed both Node test steps successfully but failed artifact upload: GitHub rejects individual filenames containing `"`, newline, `*` or `?`. There were zero downloadable artifacts, so test-step success did not satisfy C04 evidence delivery. [SC-OUTPATH-ARTIFACT-02](https://github.com/pym96/Pan-agent/issues/159#issuecomment-6869714692) preserves this failure and wraps original evidence in a safe-named tar.gz before upload. A separate result.json remains easy to inspect. The existing root consumer exclusion is retained; internal special paths and raw file bytes are not renamed or removed. Builder checks a local archive/extract round trip against a path/type/content manifest, and independent review must also inspect actual CI archives.

The native tar round trip preserves 900 entries from the passing run and 767 from the earlier failed run, comparing paths, types, file lengths/hashes and symbolic-link targets. Both summaries retain their original PASS/FAIL status. Pytest's `*current` links contain absolute targets in the original evidence; Python's restrictive data extraction filter rejects those links. That probe failure is retained. Native extraction was limited to owned directories after checking archive member paths and that no member descends through a link; extracted content was not executed. This is a checked evidence transfer, not a general untrusted-archive extraction service or a cross-platform guarantee.

## Evidence and limits

The Handoff links ordinary/special baseline logs, the original red regression and source patch, fixed runs, source/package hashes, process observations, and failed preparation commands. An initial `npm pack` invocation from the repository root failed because the package lives in `typescript/`; the corrected invocation and original failure are both retained. Failures are not replaced by later passing records.

The Human chose the Pan-only priority, Builder reproduced and repaired the fixtures, the independent Regulator owns acceptance, and Master coordinates the workorder and integration. This result concerns valid POSIX filename handling in test fixtures; it does not establish Windows portability, a new sandbox boundary, model quality or universal shell security. No server, Docker, GPU or live-model execution was needed, and no project or resume facts are promoted here.
