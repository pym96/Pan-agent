# Model Context Protocol: official documentation and the "why MCP matters" claims

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://modelcontextprotocol.io/introduction> and <https://modelcontextprotocol.io/docs/concepts/tools> (fetched 2026-08-26; documentation tracks spec version 2026-07-28); plus a user-pasted article in session on 2026-08-26 arguing "why MCP matters" over traditional APIs (no URL supplied; private locator only)
- Updated: 2026-08-26

## Verified facts

From the official documentation:

- MCP is "an open-source standard for connecting AI applications to external systems", self-described as "like a USB-C port for AI applications". Servers expose tools, resources, and prompts; clients connect over JSON-RPC with capability negotiation.
- Tools are "**model-controlled**": "the language model can discover and invoke tools automatically based on its contextual understanding and the user's prompts". Self-description is load-bearing, not decorative.
- A tool definition carries `name`, optional `title`, `description`, a JSON Schema `inputSchema` with per-property descriptions, an optional `outputSchema` (servers MUST conform to it when declared; clients SHOULD validate), and optional `annotations` — which clients MUST treat as untrusted unless the server is trusted.
- Discovery is `tools/list`; change propagation requires the server to declare the `listChanged` capability and emit `notifications/tools/list_changed` over a client-opened subscription stream. The exposed tool set MAY vary by request authorization (the spec's own example: returning only the tools the caller's granted scopes permit) but MUST NOT vary per-connection or as a side effect of other requests.
- Servers SHOULD return tools in deterministic order to preserve LLM prompt-cache hits.
- There are two error channels: protocol errors (JSON-RPC errors; structural problems models are unlikely to fix) and tool execution errors (`isError: true` results, which clients SHOULD feed to the model for self-correction). Error text is written for a model reader.
- MCP has no protocol-level session: cross-call state must be carried by explicit opaque handles that the model is responsible for carrying forward; a handle "is a name, not a capability" and must be re-authorized per call.
- The specification itself is versioned by date (observed: 2026-07-28).
- The official documentation warns there SHOULD always be a human in the loop able to deny tool invocations.

Verdicts on the user-pasted article's claims, checked against the above:

| Article claim | Verdict |
|---|---|
| Tools are self-describing with semantic parameter documentation | Confirmed |
| "The interface itself is the documentation" | Confirmed — `tools/list` serves descriptions and schemas at runtime |
| Changing a tool's parameters "won't break any clients; they adapt dynamically" | **Overstated** — the protocol enables runtime rediscovery, but breakage-freedom holds only when the call-time consumer is a model reading the new schema; a programmatic client with hardcoded arguments still fails input validation (servers MUST validate inputs) |
| New tools are discovered automatically | Confirmed with preconditions — `listChanged` capability plus client subscription |
| Tools can be exposed conditionally on context (e.g., only after login) | Confirmed, and the spec is more precise — the set may vary by *authorization*, not by connection or side effects |

The synthesis adopted from the session's correction of the article: **a traditional API's consumer is human-written code at build time; MCP's consumer is a model at run time.** Interface-change adaptation does not disappear; it shifts from deterministic (compiler-enforced, human-driven) to probabilistic (model-interpreted). Versioning pain is relocated, not eliminated.

## Boundaries

- The pasted article has no verifiable locator; its claims are recorded only as checked against the official documentation. Its closing "AI + MCP > AI + API" is opinion and is not admitted.
- MCP guarantees delivery of the interface surface, not its design quality: a compliant server can expose badly described tools. ACI design remains a separate discipline — see the link below.
- Documentation was fetched for spec version 2026-07-28; protocol details may differ in later dated versions.
- "Structured content" in tool results is unrelated to LLM structured outputs (schema-constrained generation), per the spec's own note.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [Canonical conversation](../concepts/canonical-conversation.md) — same philosophy as MCP's explicit handles: state made explicit, no hidden connection state.
- [Signal–decision separation](../concepts/signal-decision-separation.md) — MCP names M2 at protocol level (human-in-the-loop SHOULD) and M1 via machine-checkable schemas.
- [Harness Engineering](../concepts/harness-engineering.md)
- [Earendil: What is a harness](2026-08-23-earendil-what-is-a-harness.md) — tools layer and translation layer framing.
- [SWE-agent paper](2026-08-20-swe-agent-paper.md) — ACI design discipline: what MCP delivers is still designed, not free.
