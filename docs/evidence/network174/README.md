# Installed native network candidate

NET1.0 starts from `bf49465572903ec33c5ed84d116d1576e8d880ea`. The #174 Handoff binds the source and tarball identities, clean regression output, actual installed receipts and known limitations. The independent reviewer supplies their own observations.

| Gate | Primary evidence |
| --- | --- |
| C-NET01 | Installed `public-read/archive-0.json`, archived bounded-GET boundary and actual public peer in that run's `network.jsonl`, HTTPS license SHA-256 ad6a59bed78e555088706cbf91314ceec9bb36caf451eff374b49875248ddda8. |
| C-NET02 | `local-and-ungranted` archive includes the sandbox parent/child exchange and direct IPv4/IPv6 refusals. `receipts.json` includes both host controls and only authorized service requests. |
| C-NET03 | Compare the two tasks in each `grant-0` / `grant-1` run, including actual curl reads, grant identity, open/closed events, second-run denial and outside-service receipts. |
| C-NET04 | Source address/changed-DNS tests; installed redirect from a granted service to an ungranted live service; explicit non-GET refusal, direct IP control and [protocol coverage](../../design/native-network.md). The Mac DNS fixture also changes the answer between actual requests. |
| C-NET05 | Source and installed full regression, `explicit-offline` and the existing installed offline TUI fixture. The Handoff distinguishes live from source-only evidence for Docker. |

The host resolver on the actual Mac returned 198.18.0.11 for the public fixture. An ordinary host GET returned its expected bytes, but that reserved peer would invalidate a public-only test. The sandboxed default correctly refused it. A test-only trusted resolver then selected the public Pages IP 185.199.108.153. The gateway used the original TLS name and normal trust, and the sandboxed child checked actual response bytes. One additional run observed a connection to that public peer followed by a TLS disconnect. Keep it as an upstream failure. Hosted Linux uses the ordinary resolver.

A disposable macOS listener showed that stock curl can request an opaque SOCKS tunnel. The implementation supports a bounded HTTP GET gateway over Unix sockets. An early Node ESM shell helper failed during initialization inside the existing OS profile. The shipped `pan-fetch` invokes stock curl, whose macOS build needed readonly access to the single system LibreSSL config. A real in-profile readiness request checks that prerequisite at startup. Human/Master selected the product scope. The Builder implemented the candidate and fixtures. These materials do not update the verified-fact ledger.
