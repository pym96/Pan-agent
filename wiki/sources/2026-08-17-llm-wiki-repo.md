# nashsu/llm_wiki repository

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://github.com/nashsu/llm_wiki> (README inspected 2026-08-13)
- Updated: 2026-08-18

## Verified facts

- The repository describes a Tauri/Rust and React/TypeScript desktop app that produces an interlinked, Obsidian-compatible Markdown wiki.
- Its documented layers separate immutable raw sources, LLM-maintained Wiki pages, purpose, and schema.
- Its named operations are Ingest, Query, and Lint.
- Its operating principle is "Human curates, LLM maintains."

## Boundaries

- Source inspection establishes the documented architecture, not that this project implements the desktop app or its full behavior.
- This project's Wiki does not adopt desktop UI, vector search, knowledge graph, multimodal parsing, or MCP product scope.
- The source does not determine this project's knowledge-admission or fact-promotion policy.

## Links

- [Wiki Schema](../SCHEMA.md)
- [Harness Engineering fact](../concepts/harness-engineering.md)
