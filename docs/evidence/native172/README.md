# #172 native macOS sandbox — Builder candidate evidence

Contract: [NMAC1.0](https://github.com/pym96/Pan-agent/issues/172#issuecomment-6973674308). Baseline `664b8c6cb85d66d23256210064e9c05b07ecb05f`. This is Working Agent evidence pending independent technical review and concrete Human review. No project/resume fact or public release is promoted.

Implementation and residual limits: [design](../../design/native-macos-sandbox.md). Source probes: `typescript/test/native-macos.test.ts`; real installed CLI/TUI probe: `scripts/runtime-ci/native-macos.mjs`. Full current regression retains `scripts/runtime-ci/run.py`.

Private raw evidence is retained under `~/.local/state/pan-agent/native172-builder/`, with Handoff manifest and exact package/source identity supplied in the issue. It contains synthetic sentinels and scripted model responses, no real credential, Provider/server/GPU call or daemon changes. Native macOS enforcement comes from actual Seatbelt processes, not Linux CI or generated-flag assertions.

Observed failures remain separate from later results:

- Initial deny-default loader setup terminated before normal execution. A literal `/` read permission was required by dyld; allowing that directory did not grant subtree reads. A system Python shim needed Xcode files outside the policy and was left unsupported rather than exposing Xcode/user roots.
- A real negative probe initially read a synthetic `.env` canary because JSON escaping was combined with SBPL regex-literal syntax. `raw/pan172-native-first.log` retains the failure. Correct ordinary-string regex serialization was applied, and the same filesystem matrix subsequently passed; no real secrets were involved. This counterexample demonstrates why flags/profile inspection alone were insufficient.
- Homebrew Node attempted to read global OpenSSL configuration. The implementation gives a controlled `OPENSSL_CONF=/dev/null`, without adding global configuration read access. Explicit page-size compatibility sysctls were needed for Node allocation; narrowed sysctl failures and repaired computation remain in raw logs.

Minimum probe coverage includes shared edit/test bytes, outside and protected paths, relative/symlink aliases, child reads, hardlinks, environment inheritance, real owned loopback socket denial, normal descendant cancellation, configured tool denial, setup failures and sealed archive identity. This is bounded evidence under the declared policy, not a universal security proof or performance measurement. Human supplied desired boundaries; Builder implemented/self-tested; independent Regulator supplies final technical judgment.

Additional diagnosis and review boundaries:

- A protected read-deny alone did not make an executable an invalid setup fixture. Executable authority is now explicitly scoped to the same declared roots, with protected execution denied. A copied platform-signed `/bin/echo` was initially SIGKILLed even on the host; that was an invalid control. A task-owned ad-hoc-signed copy supplied a real positive control, then outside/protected execution negatives. No real signing identity/private key was used.
- The first complete current runner finished PASS: 282 TypeScript tests, 26 installed lifecycle pytest cases, onboarding/settings/walkthrough. It ran before RB1.1 clarified process concurrency: transient internal Node fanout occurred and compliance with the prospective eight-descendant limit is NOT_ESTABLISHED for that historical run. Its parent/owned tree subsequently settled. Later affected native/authorization/entry tests use explicit `--test-concurrency=1` and preserve all assertions. An attempted NODE_OPTIONS concurrency setting was rejected by Node and retained as a failed invocation; direct CLI concurrency fixed the runner invocation. These controls change test execution, not Product runtime limits.
- Later changes are narrow native execution/read protection, CLI prompt/boundary composition cleanup and focused test additions. Unaffected original current tests are carried by exact raw/source identities; affected tests and final packed installed CLI/TUI are rerun. Final-SHA CI and the independent Regulator remain required.
