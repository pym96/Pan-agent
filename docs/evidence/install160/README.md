# #160 installed onboarding candidate

WorkOrder: https://github.com/pym96/Pan-agent/issues/160 — INSTALL1.0. Base `3d5297b30e6d5851baae1975e7f19ad691640e92`. Builder candidate; no acceptance or npm publication implied.

Implementation: installed launcher selects Native, runtime defaults cwd and persistent `~/.pan-agent/archives`; existing disjoint-path guard remains. A writable archive check gives startup feedback. Package metadata prepares v0.1.9 for publication. README separates the available v0.1.6 release from unpublished v0.1.9.

Validation entry: `scripts/runtime-ci/run.py`, including the global-prefix real-PTY consumer checks in `scripts/runtime-ci/onboarding.py`. Raw evidence and final package identity are attached to the SHA-bound Handoff; independent Regulator owns acceptance.

Early failures retained: TypeScript cast precedence prevented typecheck; first PTY run exposed the still-required kernel flag, fixed only at the installed launcher (library contract unchanged); next harness used an incorrect credential prompt; next assumed idle Ctrl-C exited but actual daily UI retains a draft, so test and README now use `:exit`; missing-key probe sent exit before task settlement, corrected to wait for the idle state. An early full-suite navigation check failed because this evidence index was not yet written. A subsequent full run caught removed historical README classification anchors; the existing collapsed catalog was restored, preserving its checks. No failed run is reported as a pass.

Human specified simple installation; Builder implements and tests; Regulator independently reviews; Master integrates. No benchmark, security, resume or publication claim.

Builder full-entry local run02: 269 TypeScript, 16 installed lifecycle, seven onboarding and eight walkthrough cases passed, zero skips. Follow-up final exact-commit run is identified in Handoff; these results alone do not authorize integration.
