# Wiki Schema and Operations

## Page schema

Every substantive page contains:

- `Type`: source, concept, experiment, failure, decision, or question.
- `Status`: raw, interpreted, tested, superseded, or open.
- `Source`: a stable URL, repository path, run ID, or private-source locator.
- `Facts`: claims directly supported by the Source.
- `Interpretation`: the author's current judgment, kept separate from Facts.
- `Links`: related Wiki pages, code, Trace, evaluator, or ADR.
- `Updated`: ISO date.

## Ingest

1. Preserve raw material or a stable locator without silently rewriting it.
2. Create or update the matching source page.
3. Separate Facts from Interpretation and record uncertainty.
4. Link affected concepts, experiments, failures, decisions, and questions.
5. Append the change to `log.md`.

## Query

1. Start at `index.md` and follow explicit links.
2. Prefer tested experiment evidence over interpretation and interpretation over open questions.
3. Return source locators with factual answers.
4. Surface conflicting pages instead of merging them silently.

## Lint

A Wiki snapshot passes only when all linked local Markdown pages exist, every substantive page has Type/Status/Source/Facts/Interpretation/Links/Updated fields, Facts and Interpretation are separate, `log.md` is append-only, and no page assigns product, benchmark, desktop UI, vector search, knowledge graph, multimodal parsing, or MCP scope to the Wiki.
