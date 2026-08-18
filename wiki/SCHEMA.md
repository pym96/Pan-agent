# Learning Wiki Schema and Operations

The Wiki preserves a source-grounded learning path. It is not the product glossary, governance authority, project-fact register, architecture decision log, benchmark, or resume evidence gate.

`index.md`, `log.md`, and this Schema are control pages. Every other substantive Wiki page must be exactly one of the two knowledge-object types below.

## Knowledge objects

### Verified Learning Fact

Required fields and sections:

- `Type: verified-learning-fact`
- `Verification: source-located | triangulated | experiment-reproduced`
- `Source`: stable URLs, repository paths, run IDs, or private-source locators
- `Updated`: ISO date
- `Verified facts`: statements supported at the declared verification level
- `Boundaries`: what the verification does not establish
- `Links`: related facts, questions, Evidence records, code, or external decisions

`source-located` means the source was inspected and does make the recorded statement; it does not make that statement universally true. `triangulated` requires materially independent sources. `experiment-reproduced` requires a stable run/artifact locator and a reproducible procedure.

### Open Learning Question

Required fields and sections:

- `Type: open-learning-question`
- `Verification: open`
- `Source`: the fact, observation, or decision that exposed the question
- `Updated`: ISO date
- `Question`: one decision-relevant unknown
- `Why it matters`: the learning or design consequence
- `Known boundaries`: what is already known and must not be reopened
- `Verification path`: the source comparison or experiment that can answer it
- `Links`: supporting facts, Evidence records, or external decisions

Trivia, vague curiosity, and questions without a verification path are rejected.

## Admission boundary

- Unverified Interpretation or Hypothesis becomes an Open Learning Question or stays out of the Wiki.
- Source, experiment, and failure pages are provenance records, but each page still adopts one of the two knowledge-object types above.
- Product-domain definitions live in `../CONTEXT.md`.
- Architecture decisions live in `../docs/adr/`.
- Governance decisions live in `../docs/governance/decisions/`.
- Verified Project Facts live in `../docs/evidence/verified-project-facts.md`.
- No Wiki status or verification label promotes a project or resume fact.

## Language

- Write all Wiki headings and explanatory prose in English.
- Preserve non-English source locators when necessary, but write extracted facts and questions in English.
- Code blocks, inline code, URLs, and Markdown link destinations may retain original spelling.

## Ingest

1. Preserve an immutable source or stable locator without silently rewriting it.
2. Decide whether it supports a Verified Learning Fact or exposes an Open Learning Question.
3. Record verification level, provenance, and boundaries.
4. Link affected learning objects and any external ADR/governance record.
5. Append the change to `log.md`.

## Query

1. Start at `index.md` and follow explicit links.
2. Prefer `experiment-reproduced` over `triangulated`, and `triangulated` over `source-located`.
3. Return verification level, source locators, and boundaries with every factual answer.
4. Return Open Learning Questions as unknowns, never as inferred answers.

## Lint

A Wiki snapshot fails when a local link is broken, a substantive page uses any other knowledge-object type, a fact page lacks verification/provenance/boundaries, a question lacks importance/boundaries/verification path, an `Interpretation` or `Hypothesis` section appears, prose is not English, a decision page remains under `wiki/`, or the Wiki claims product, benchmark, project-fact, or resume-fact authority. `log.md` is append-only: corrections are new entries and never edits that hide an earlier mistake.
