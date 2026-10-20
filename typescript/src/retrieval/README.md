# Retrieval

- `config.ts`: explicit CLI selections, persistent root identities and fixed limits.
- `tool.ts`: bounded fresh ingestion, exact provenance, replaceable lexical ranking and AgentTool integration.

Sources remain read-only. Permission comes from `SessionAuthorization.authorizeRetrieval`, then per-file existing policy and `AuthorizedFile` handles. See [design](../../../docs/design/retrieval-tool.md).
