# Product conformance fixtures

`fixtures/v1/manifest.json` freezes a small, implementation-neutral contract for behavior retained across the product cutover:

- read, write, edit, and trusted-local bash semantics;
- completed, model-error, incomplete, and cancelled terminals;
- cancellation while a tool is active;
- cross-task Context retention without application-owned truncation.

The fixture documents contain inputs and observable expectations, not executable product logic. The current TypeScript runner is `typescript/test/conformance.test.ts`; it maps each case to the public `GeneralAgentSession` Interface and Pi's deterministic Faux Provider.

Adding a case requires a new fixture, a manifest entry, and a runner assertion through a public product seam. Changing an existing observable contract requires a versioned fixture directory. These fixtures do not claim implementation equivalence, Provider quality, sandboxing, or benchmark performance.
