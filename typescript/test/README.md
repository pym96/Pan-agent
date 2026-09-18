# Product tests

- [streaming.test.ts](streaming.test.ts): #44 byte/delta partitions, source barriers, cancellation cleanup, observer lifetime, visibility and replay boundaries.
- [#44 obligation map](../../docs/design/workorder-44-obligations.json): every prior test title and exact English-label changes. Existing test files and frozen fixtures remain at their declared semantics.

Run `npm --prefix typescript run check` from the repository root. Reference remains separately installed and unchanged.

[file-input.test.ts](file-input.test.ts): seven #43 deterministic tests for deliberate preparation, byte/resource bounds, authority, immutable Context/archive provenance and safe display. Existing 92 obligations remain mapped.

[file-repair.test.ts](file-repair.test.ts) adds the #43 prospective 1.1 Tab/navigation/grapheme regression. The 99 prior Product obligations remain unchanged.

[daily-workspace.test.ts](daily-workspace.test.ts): #47 grapheme/multiline draft, input admission/cancellation and stale picker/snapshot state. Installed PTY checks are under scripts.

#47 repair navigation: [Criteria-Version 1.1](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5597954262) covers SGR wheel, source-content reflow anchors, admitted prompt recall and Tab attachment. Startup y remains; old 1.0 evidence is retained.

#47 Criteria-Version 1.2 adds timer-free compatibility framing (Ctrl-G Back, ESC prefix only) and immutable raw-prefix screen evidence. Old 1.1 grids remain historical failed evidence.

[preview-entry.test.ts](preview-entry.test.ts): #51 frozen preview-first-task fixture shape, independent marker identity and verification-asset binding. The 115 prior Product obligations remain unchanged.

[config-first-run.test.ts](config-first-run.test.ts): #52 settings roundtrip/permissions, closed provider/model/thinking selection, wizard flows incl. kimi-code unavailability, explicit Keychain remember/decline/failure, configure command and restart restore. The 117 prior obligations remain unchanged.

[kimi-adapter.test.ts](kimi-adapter.test.ts): #53 request shape, byte-boundary fragmentation, ordered multi-call correlation, missing-usage, malformed rejections, status-only errors, cancellation-before-admission, fixed-model settings. The 130 prior obligations remain; the one retitled #52 wizard test is the authorized kimi-availability change.

[scroll-layout.test.ts](scroll-layout.test.ts): #62 bounded wheel-layout cost harness (p95/rebuild/visit bounds), scroll/follow semantics, resize invalidation and view-only invariance. The 137 prior obligations remain unchanged.

[scrollbar.test.ts](scrollbar.test.ts): #60 frozen scrollbar geometry table and rendered-track assertions, primary press/drag/release mapping and inert/cancellation rules, SGR framing split/variant/quarantine safety, hostile-text escaping, sealed-archive/replay invariance and the #62 timing bounds extended over drags. The 141 prior obligations remain unchanged.
# WorkOrder #61

# WorkOrder #49

[`authorization.test.ts`](authorization.test.ts): Criteria 1.2 same/different/unknown policy, Unicode aliases, zero-effect uncertainty, identity/cancellation, both race-boundary sides and TUI approval probes. [Expectation migration inventory](../../docs/adr/0018-operation-scoped-authorization.md) identifies prospective startup/permission fixture changes; original frozen snapshots remain intact.

## Retained #61 coverage

[`tool-activity.test.ts`](tool-activity.test.ts) covers digest density, multiple-run selection, safe labels, live overlay updates and missing/inconsistent retained records. The unchanged scrollbar and scroll-layout suites cover #60/#62 regression.
