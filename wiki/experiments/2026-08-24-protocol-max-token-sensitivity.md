# Maximum-token sensitivity in Strict ReAct action generation

- Type: verified-learning-fact
- Verification: experiment-reproduced
- Source: `.runs/protocol-reliability-v1.1-max-token-sensitivity/` manifest `sha256:042ea1f38c17f75140e76b6b3fa0c5e7fec2b21702313ba2eed11d0fce1558aa`; v1.1 summary SHA-256 `d1f1e0dee9f3b3c1320ff88a2226ec52165de85f517f7ffd5a1ffdc3b557aaef`; `.runs/protocol-reliability-v1.2-max-token-16k-extension/` manifest `sha256:b4379278ed4b46bfe638f97d2183cb92d855a4046ec1ee03511cae1da90d633b`; v1.2 summary SHA-256 `ab1b10233c2dc66040a811035b4c88ec5779d623dd91a2b93dd0ce0f87694ec7`; [candidate Evidence record](../../docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md); [DeepSeek model limits and billing](https://api-docs.deepseek.com/quick_start/pricing/)
- Updated: 2026-08-24

## Verified facts

- A provider is the external party serving model inference through an API. In this experiment DeepSeek is the provider, `deepseek-v4-flash` is the requested and returned model, and the Harness is the client that translates between the provider contract and canonical Agent actions.
- `max_tokens` is a per-call output ceiling, not a required allocation. The 16K arm produced short responses of 84–209 Tokens as well as exact 16,384-token responses. DeepSeek's inspected model page listed a 384K maximum output and billing based on Tokens actually used, so 16K was within the documented service limit at the measurement date.
- Source verification selected the five real ReAct Contexts that exactly covered all 21 Strict `finish_reason=length` failures at the parent experiment's 2,048 ceiling. No Context was handwritten or substituted.
- The 2K, 4K, and 8K arms each completed 25 calls with no repair. Canonical L3 action rates were 2/25, 4/25, and 4/25; exact ceiling hits were 19/25, 16/25, and 20/25.
- The separately identified post-v1.1 16K extension completed 25 calls with no repair. It reached L3 in 5/25, hit exactly 16,384 Tokens in 15/25, and had one L0 transport error with unknown underlying cause.
- Known completion-Token totals rose from 39,651 at 2K to 66,651 at 4K, 164,455 at 8K, and 246,815 across the 24 usage-bearing 16K calls. A higher ceiling increased worst-case cost and latency without a monotonic L3 gain.
- The maximum retained function-argument string grew approximately with the ceiling: 8,232, 16,432, 32,868, and 66,437 characters. Every arm retained repeated DSML/invoke markers among the ceiling-hit population.
- Temperature zero did not make the provider deterministic. Identical Context/ceiling repetitions could branch between a bounded short response and a malformed response that ran exactly to the ceiling.
- The Harness retained successful HTTP response bodies losslessly and hashed them. The provider's `finish_reason=length` and exact usage show server-side generation stopping at the requested ceiling; there was no Harness post-response compression or shortening.
- The experiment supports a bounded-ceiling plus validation/repair strategy over setting 16K as the default protocol fix. It does not prove that 2K is globally optimal.

## Boundaries

- The corpus is deliberately failure-enriched and contains only five correlated Contexts. Rates are not provider-wide estimates.
- The 16K condition was requested after v1.1 completed and is transparently versioned as an extension, not a preregistered v1.1 arm.
- Repeated returned markers diagnose a visible response loop; they do not expose, decrypt, or reconstruct hidden model reasoning.
- One 16K artifact records only `RuntimeError` at L0. The underlying network reason was not retained, so timeout, provider disconnect, and other causes remain unresolved.
- Protocol L3 means canonical bash/finish syntax only. It does not establish useful action choice, execution safety, task success, or SWE-bench performance.
- The result remains Working Agent candidate Evidence pending independent Regulator review and creates no Verified Project Fact, factual-ledger fact, or resume fact.

## Links

- [v1.1 design](../../docs/design/protocol-reliability-v1.1-max-token-sensitivity.md)
- [v1.2 16K extension design](../../docs/design/protocol-reliability-v1.2-max-token-16k-extension.md)
- [Parent protocol-reliability-v1 learning fact](2026-08-23-protocol-reliability-v1.md)
- [DeepSeek structured-output mechanics](../sources/2026-08-23-deepseek-structured-output.md)
