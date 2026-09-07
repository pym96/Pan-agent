# ADR-0017 | Product isolation and explicit transitional Native selection

Decision-State: accepted (Master WorkOrder #34 activation, 2026-09-07)
Verification-State: pending

[Activation](https://github.com/pym96/Pan-agent/issues/34#issuecomment-5565979659), Criteria-Version 1.0, accepted base `55afc93deff70035810666f0efbf583357ad12fc`.

Product `typescript/` requires explicit Native or programmatically injected AgentKernel. Omission is a validation failure before effects, not a default switch. Explicit Pi is rejected with separate-reference instructions. `references/pi/` is Frozen Reference with its own installation, typecheck, entry and tests; the dependency direction is reference to Pan interfaces only. Shared Session lifecycle and accepted core behavior are conserved. This prospectively supersedes prior product-default Pi statements for this split; historical Evidence and fixtures are unchanged. #29 alone decides a future default.

See [relocation and coverage](../design/product-isolation.md). No package publish, packed-consumer proof, real model call, credential read, paid run, fact promotion or downstream work is authorized. Independent Regulator review plus different-model-family or Human review of actual P-D6 output remains necessary before landing.
