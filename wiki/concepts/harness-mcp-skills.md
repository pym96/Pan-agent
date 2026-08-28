# Harness, MCP, and skills: three capability layers

- Type: verified-learning-fact
- Verification: triangulated
- Source: [MCP official documentation](../sources/2026-08-26-mcp-official-docs.md) (spec 2026-07-28, fetched 2026-08-26); [Skill packaging mechanics](../sources/2026-08-18-skill-packaging-mechanics.md) (source-located); [Canonical conversation](canonical-conversation.md) (triangulated); session synthesis converged with the user on 2026-08-27
- Updated: 2026-08-27

## Verified facts

**MCP is not installable; MCP servers are.** MCP is the protocol — "a USB-C port for AI applications" in the official analogy. What a user installs is an MCP *server*: a concrete provider exposing a self-describing set of tools (plus optional resources and prompts), discovered at runtime via `tools/list`. Installing a server delivers a tool set; it does not grant use — the client-side harness still gates invocations (the spec's human-in-the-loop SHOULD).

**A harness's capability surface has three distinct layers:**

| Layer | What it is | Protocol | Example |
|---|---|---|---|
| Native tools | Capabilities implemented inside the harness process | none (private) | Claude Code's Read/Edit/Bash |
| MCP servers | External, self-describing tool-set providers (separate process or remote) | MCP (public standard) | Playwright server, GitHub server |
| Skills | Knowledge/playbook packages — a `SKILL.md` with frontmatter plus layered loading | none (file convention) | installed engineering skills |

A skill is not a tool: it teaches the model *when and how* to use tools — whether native or MCP-sourced — but provides no executable capability itself. Tools are the hands; skills are the technique.

**Convergence at the wire, divergence at the trust layer.** To the model, native and MCP tools are nearly indistinguishable: both enter the canonical conversation as tool schema plus description and are encoded identically into the provider request. The differences live in the harness's execution and trust layers: native tools execute in-process under the harness's own authority; MCP tools are RPC across a process/network boundary with runtime discovery, untrusted-by-default annotations, and third-party code inside the trust perimeter.

**Discovery differs per layer.** Tools are *declared* to the model; skills are *read* by it. Native tools are hardcoded in the harness; Anthropic-schema tools arrive trained-in and are merely referenced by type/name (no local artifact at all — server tools leave the client holding only results); MCP tools are discovered at runtime by a machine-to-machine `tools/list` RPC whose result the harness converts into the provider's structured `tools` parameter — the model never reads a tool-list document; skills alone are filesystem artifacts (`SKILL.md`) that the model may literally open and read.

**Asymmetry observation (session 2026-08-27):** the tool side of the boundary has an industry standard (MCP); the model side has none, so every harness builds its own canonical layer and TranslationAdapter. MCP is to tool servers what a hypothetical provider-protocol standard would be to models — the former exists, the latter does not, and provider dialects drift over time as well as across vendors (OpenAI replaces envelope generations; Anthropic extends additively via beta headers).

**Corollary (Signal–decision separation):** tool origin determines the verification burden. MCP-sourced tools (and installed skills, which import third-party instructions) demand stronger M2 by default — independent verification and permission gates — because they are external code and text entering the harness's trust boundary.

## Boundaries

- "Native built-ins do not ride MCP internally" is drawn from public surfaces; vendor internal architectures are not fully public, and some harnesses are migrating internal capabilities toward MCP-shaped implementations.
- Skill discovery/scope mechanics were observed on one installer plus the Claude Code/Codex pair; other harnesses may differ (per the skill-packaging page's boundary).
- The three-layer framing is this Wiki's synthesis from the linked sources, not an industry-standard taxonomy.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [MCP official documentation](../sources/2026-08-26-mcp-official-docs.md)
- [Skill packaging mechanics](../sources/2026-08-18-skill-packaging-mechanics.md)
- [Canonical conversation](canonical-conversation.md) — where the layers converge.
- [Signal–decision separation](signal-decision-separation.md) — the M2 corollary.
- [Earendil: What is a harness](../sources/2026-08-23-earendil-what-is-a-harness.md) — tools as one of the four harness components.
