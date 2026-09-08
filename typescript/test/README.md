# Product tests

- [streaming.test.ts](streaming.test.ts): #44 byte/delta partitions, source barriers, cancellation cleanup, observer lifetime, visibility and replay boundaries.
- [#44 obligation map](../../docs/design/workorder-44-obligations.json): every prior test title and exact English-label changes. Existing test files and frozen fixtures remain at their declared semantics.

Run `npm --prefix typescript run check` from the repository root. Reference remains separately installed and unchanged.

[file-input.test.ts](file-input.test.ts): seven #43 deterministic tests for deliberate preparation, byte/resource bounds, authority, immutable Context/archive provenance and safe display. Existing 92 obligations remain mapped.

[file-repair.test.ts](file-repair.test.ts) adds the #43 prospective 1.1 Tab/navigation/grapheme regression. The 99 prior Product obligations remain unchanged.
