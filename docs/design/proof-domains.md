# Proof Domains

Status: Human-accepted design; both concrete seed fixtures, capability Adapters, deterministic evaluators, and the scripted same-Runtime integration passed ordinary same-model Regulator review. They remain a two-case development proof, not a Generality Fact; the remaining 14+14 cases and any publishable results are not implemented or authorized.

## Purpose

The first Generality Proof uses exactly two materially different Vertical Domain Packs through the same General Agent Runtime Interface and lifecycle. The proof is rejected if either domain bypasses Runtime policy, Trace, terminal-result, or evaluation behavior.

Both cases use the same model Adapter, Runtime configuration, `RunRequest` shape, budget semantics, and `runtime.run(...) -> RunReport` entry point. They vary only through the selected pack and its protected fixture/evaluator material.

## Shared control contract

- The Runtime selects a registered pack by `pack_id` and records its version and content hash before admitting the run.
- Runtime authority is the intersection of the host grant, request grant, and pack ceiling. Pack guidance is inert text and cannot widen that intersection.
- The Runtime stages an agent-writable workspace from a protected fixture. The original fixture and evaluator stay outside that workspace.
- A terminal `RunResult` describes execution. A separate `EvaluationRecord` describes domain success, failure, evaluator error, or `not_run`; evaluation never rewrites the terminal result. Runtime attempts evaluation for every terminal execution whose final artifact snapshot can be frozen so partial-output Bad Cases remain measurable.
- Raw final workspace state, Trace, evaluator output, and pack identity form the candidate Evidence Bundle. They are not automatically Verified Project Facts.

## Domain A: `data-analysis`

This seed is implemented as a candidate case 1 of the proposed 15-case `data-analysis` vertical suite. The remaining cases are not frozen or implemented.

### Bounded task

Given a protected `orders.csv`, create `outputs/region_summary.csv` for valid paid orders. A row is valid when `status == "paid"`, `quantity` is a positive integer, and `unit_price` is a non-negative decimal. Group by `region`, calculate `order_count` and exact decimal `revenue = sum(quantity * unit_price)`, sort by region, and format revenue with two decimal places. Do not modify the input.

Frozen seed fixture:

```csv
order_id,region,quantity,unit_price,status
o1,east,2,10.00,paid
o2,west,1,5.50,refunded
o3,east,3,7.00,paid
o4,north,0,99.00,paid
o5,west,4,2.50,paid
```

Expected output:

```csv
region,order_count,revenue
east,2,41.00
west,1,10.00
```

### Pack-owned material

- Task decoder: validates the case ID and the logical input/output locators.
- Guidance: explains validation, exact decimal arithmetic, grouping, ordering, and required output schema.
- Requested capabilities: `table.read`, `table.inspect`, `table.aggregate`, and `workspace.write-output`.
- Policy ceiling: read only the staged input; write only `outputs/region_summary.csv`; no command execution, source modification, network, or evaluator access.
- Protected fixture reference: identifies the frozen CSV without exposing a host path.
- Domain Evaluator: parses the protected original fixture and the final output snapshot with deterministic standard-library decimal and CSV logic.

### Deterministic evaluator

The evaluator passes only when all of the following hold:

1. the protected input hash still matches the frozen hash;
2. the only workspace write is `outputs/region_summary.csv`;
3. the output header is exactly `region,order_count,revenue`;
4. rows are unique and sorted by region;
5. counts and `Decimal` revenue values exactly match a fresh calculation from the protected fixture;
6. revenue is rendered with exactly two fractional digits.

The evaluator reports a structured reason for input mutation, unexpected writes, schema error, row-set mismatch, arithmetic mismatch, or formatting mismatch. No model judgment is used.

## Domain B: `workspace-coding`

This seed is implemented as a candidate case 1 of the proposed 15-case `workspace-coding` vertical suite. The remaining cases are not frozen or implemented.

### Bounded task

Repair `slugify(text: str) -> str` in a small Python repository. The required behavior is:

1. normalize text with Unicode NFKD;
2. discard combining marks and characters that cannot be represented as ASCII letters or digits;
3. lowercase the result;
4. collapse each run of non-alphanumeric characters to one hyphen;
5. strip leading and trailing hyphens;
6. return `"untitled"` when no alphanumeric content remains.

Only `src/slugify.py` may change. Existing public tests are visible; additional evaluator cases remain in the protected control path.

### Pack-owned material

- Task decoder: validates the repository case ID and the one allowed source path.
- Guidance: describes repository inspection, a minimal patch, and running the declared test command.
- Requested capabilities: `workspace.read`, `workspace.search`, `workspace.patch`, and `test.run-declared`.
- Policy ceiling: read the staged repository; write only `src/slugify.py`; run only `python3 -m unittest discover -s tests -p 'test_*.py' -v`; no network, package installation, Git history rewrite, or evaluator access.
- Protected fixture reference: identifies the initial repository tree and hidden tests.
- Domain Evaluator: checks the write set and runs public plus hidden deterministic tests with the hidden suite mounted read-only outside the agent workspace.

### Deterministic evaluator

The evaluator passes only when all of the following hold:

1. the initial fixture hash and all non-allowed files match their protected hashes;
2. the write set is exactly a subset of `{src/slugify.py}` and contains a substantive source change;
3. public tests pass in a clean interpreter process;
4. protected tests pass for whitespace, repeated separators, accents, punctuation-only input, mixed case, and empty input;
5. no network, undeclared command, or control-plane path was accessed according to Runtime Trace.

The evaluator reports a structured reason for forbidden diff, public-test failure, hidden-test failure, process error, or policy evidence mismatch. Test output and exit status are retained raw.

## Why the seam is real

The two packs vary in more than prompts:

- task payloads differ: a table-transformation case versus a repository repair case;
- requested tool capabilities differ: typed table operations versus search/patch/test execution;
- authority ceilings differ: one fixed output file versus one source file and one declared command;
- evaluator mechanisms differ: exact artifact recomputation versus diff inspection and executable tests;
- failure taxonomies differ, while Runtime lifecycle, policy, Trace, budgets, model Adapter, and terminal semantics stay unchanged.

A design that places CSV grouping or Python test execution inside Runtime fails locality. A design that gives both packs unrestricted filesystem or shell access fails authority depth. A design that calls evaluators from agent-visible tools fails evaluator isolation.

## Thirty-case vertical campaign target

After both seed cases and ADR-0009 pass independent review, each pack expands to 15 frozen cases. The `data-analysis` suite varies schema inspection, filters, exact arithmetic, grouping, joins, missing/malformed values, dates, rankings, and anomalies. The `workspace-coding` suite varies navigation, bounded edits, tests, multi-file consistency, configuration repair, diagnosis, diff policy, and authority attacks.

The two 15-case suites run under one campaign configuration and publish per-pack results before a 30-case aggregate. They use deterministic primary evaluators and retain all Bad Cases. PinchBench remains a separate external compatibility lane; its task count, scoring, or tool surface does not replace this Generality Proof.

The campaign shape and efficiency metrics follow [`benchmark-strategy.md`](benchmark-strategy.md). The referenced Composio thread supports the use of pass rate, duration, Token use, tool calls, cost per task, and cost per success as comparison fields, but it does not supply reusable local tasks or graders.

## Contract-test matrix

The implementation candidate supplies tests at the public seam for these behaviors:

1. one Runtime instance selects and executes both registered packs through the same `run` method;
2. both reports contain exactly one terminal `RunResult` and the matching pack identity/hash;
3. a pack whose guidance asks for a forbidden tool still cannot expose or execute that tool;
4. a traversal or direct write toward the evaluator/control directory is policy-blocked and leaves a sentinel unchanged;
5. a correct execution with a wrong artifact remains an execution success but receives a failed domain evaluation;
6. an evaluator exception is reported as evaluator error and does not become a tool/model/Runtime failure;
7. Trace uses distinct Runtime and domain namespaces and includes the selected pack version/hash.

The generic Runtime contracts and the concrete two-Pack integration are green and passed ordinary same-model Regulator review within the operator-trusted boundary. The coding evaluator performs an AST allowlist audit before a fixed, isolated-interpreter subprocess that runs the visible public test and protected hidden cases; raw stdout, stderr, unittest output, and exit status are retained. This is not a general OS sandbox. High-risk Human/different-model review and the separate fact-promotion Gate still stand between this bounded proof and any Verified Project Fact.
