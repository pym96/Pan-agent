# Product conformance fixtures

`fixtures/v1/manifest.json` freezes a small, implementation-neutral contract for behavior retained across the product cutover:

- read, write, edit, and trusted-local bash semantics;
- completed, model-error, incomplete, and cancelled terminals;
- cancellation while a tool is active;
- cross-task Context retention without application-owned truncation.

The fixture documents contain inputs and observable expectations, not executable product logic. The current TypeScript runner is `typescript/test/conformance.test.ts`; it maps each case to the public `GeneralAgentSession` Interface and Pi's deterministic Faux Provider.

`fixtures/kernel-v1/manifest.json` is the WorkOrder #28 Kernel contract. Its six language-neutral cases cover selection, typed cross-task Context, sequential ToolCall batches, invalid-call correlation, active cancellation, turn/step budgets, and terminal/Event/Archive accounting. `typescript/test/kernel-conformance.test.ts` runs every unchanged case through the same public `GeneralAgentSession` Interface against both `pi` and `native`. It also pins the SHA-256 identities of every accepted `fixtures/v1` file.

Adding a case requires a new fixture, a manifest entry, and a runner assertion through a public product seam. Changing an existing observable contract requires a versioned fixture directory. These fixtures do not claim live Provider quality, default-cutover readiness, sandboxing, or benchmark performance.
