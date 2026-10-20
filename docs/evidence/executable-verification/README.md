# #146 executable verification evidence

Candidate implementation; independent acceptance pending. [Protocol](../../design/executable-verification.md), [public commands](../../../scripts/verification/README.md), [CLI tests](../../../scripts/verification/cli.test.mjs). [Evidence manifest](manifest.json) binds the executed source, raw inventory and all retained fixtures; no model calls or release.

## Article17 — executable checks supplement review

Human asked for reproducible checks rather than relying on narrative verdicts. Builder implemented an external trusted runner with separately pinned manifest and receipt identities; independent Regulator owns acceptance. A good test oracle remains a reviewer responsibility: hashes bind bytes, not trustworthy authorship. The demo keeps fixed expected42 outside a target changed42→41→42, and retains the failing assertion rather than presenting only the repaired success.

The first public CLI test failed before implementation. A later genuine failure was macOS temporary-path aliasing (`/var` versus `/private/var`): comparing unresolved output parent spelling falsely rejected a safe external directory. Canonicalizing the existing parent fixed the rejection without allowing traversal or writing inside candidate/trusted trees. Public tests also cover prototype-like criterion IDs so JavaScript object inheritance cannot erase an assertion failure. These are finite regressions, not a security or exhaustive coverage claim.

Machine PASS and Human pending are intentionally distinct. Check never executes commands from receipts, and rechecking is not a new run. Original incomplete/refused cases remain NOT_EVALUABLE. Only cooperative POSIX process groups are supported; arbitrary malicious processes and network isolation are outside this local trust contract.

Builder validation: 28 public CLI tests passed on Node26.7/macOS arm64. The standalone demo retained good PASS, defect FAIL, omitted NOT_EVALUABLE, wrong-SHA refusal and restored PASS. Test fixtures and receipts are retained externally, including infrastructure and identity failures. Executed source is `fa4b61f4942d3ddab1767921c08c5cbfd79ef128`; final evidence-only commit is bound in Handoff. Runtime/package files were not modified and unrelated Product tests were not rerun. Independent Regulator must introduce its own counterexample and verify the trust assumptions before acceptance.
