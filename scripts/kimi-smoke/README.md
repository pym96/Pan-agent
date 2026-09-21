# Bounded Kimi smoke — Stage A

External Product validation tooling for [#69 Criteria1.0](https://github.com/pym96/Pan-agent/issues/69#issuecomment-5754426256). No genuine activation or real-call permission is included.

- [run.mjs](run.mjs): installed public Product composition, identity gate, inert CLI and synthetic injection entry.
- [guard.mjs](guard.mjs): immutable policy, activation validation, durable attempt ownership, byte/time/dispatch limits and pure report reconstruction.
- [lock.json](lock.json): prospective task, tool, model, endpoint and Master-selected ceilings; checked against the compiled-in policy before admission.
- [verify.mjs](verify.mjs): offline installed-session, adverse transport, concurrent-process and leak probes.
- [fixtures.json](fixtures.json): explicitly synthetic private canaries, never an activation.
- [Runbook and limitations](../../docs/design/kimi-bounded-smoke.md).

Use Node 22.19.0. `node scripts/kimi-smoke/run.mjs --help` and `dry-run` do not resolve credentials, import Product, create attempts or call network. `report /absolute/records.jsonl` reconstructs only retained data; an interrupted attempt remains uncertain and consumed.

For offline verification, build/install the unchanged Product per the [accepted package procedure](../../docs/design/packed-product-consumer.md). Then run:

```sh
node scripts/kimi-smoke/verify.mjs /absolute/consumer/node_modules/pan-agent /absolute/pan.tgz /absolute/new-output FULL_CANDIDATE_SHA
```

Run under the unchanged `wo35-consumer-guard.mjs` plus `wo49-consumer-guard.mjs` (copied outside the checkout, named `base-guard.mjs` and `guard.mjs` respectively). Allow only the installed consumer, a copied six-file runner directory and fresh synthetic output; deny the source checkout. Supply a minimal environment and `NODE_OPTIONS=--import=/absolute/guard.mjs`, `WO35_GUARD_CONFIG=/absolute/guard-config.json`. The verifier's two subprocesses inherit those guards. Separately run a caught `fetch` negative control and require nonzero exit with one blocked network attempt. A synthetic fetch is always injected by the verifier; there is no synthetic-to-live switch or default real credential callback in `runSynthetic`.

Retain source SHA, exact command/environment allowlist, all exit codes, stdout/stderr, meters, runtime manifest, tarball identities and failed attempts. Synthetic runtime files preserve their label. This is Builder evidence; independent Regulator probes and both named Human reviews remain required.
