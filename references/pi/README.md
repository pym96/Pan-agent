# Pi Frozen Reference

Classification: **Frozen Reference**, authorized by WorkOrder #34 Criteria-Version 1.0. Pan-authored integration from accepted base `55afc93deff70035810666f0efbf583357ad12fc` is conserved here. No upstream Pi source is copied. No new reference features are authorized.

Install this package independently from repository root, then run its checks:

```bash
npm --prefix references/pi ci --ignore-scripts
npm --prefix references/pi run check
npm --prefix references/pi run conformance
npm --prefix references/pi run agent -- --help
```

An authorized Human operator may launch its TUI with `npm --prefix references/pi run agent -- --workspace /absolute/workspace --memory-root /disjoint/memory`. Omitted selection and explicit `--kernel pi` retain baseline behavior. Provider execution still requires separate authorization; #34 makes zero real calls. Accepted Pi versions are pinned to `0.84.4` in this manifest and independent lockfile.

This source-reference package consumes Pan source interfaces from `../../typescript/` in the same repository. Its installation/typecheck/test does not require the Product dependency install: it owns its own compiler/types and Pi packages. Product never depends on this directory; it remains runnable when this directory is absent. This is not a standalone published/packed-consumer claim.

`src/model-adapter.ts`, `src/tools.ts`, `src/pi-compatibility.ts`, `src/kernels/pi-kernel.ts` preserve baseline integration with relative import edits only. `src/session.ts` is a composition facade injecting PiKernel into the one Product Session lifecycle. `src/cli.ts` preserves the reference entry. `test/` retains Pi-specific tests, old default-selection checks, Pi differential-oracle tests and shared v1/kernel-v1 fixtures; `test/compatibility.test.ts` holds moved compatibility assertions. See the [inventory](../../docs/design/product-isolation.md).
