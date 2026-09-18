# ADR-0018 — Operation-scoped authorization, Criteria 1.2

Status: candidate implementation of the Human/Master-authorized #49 contract; independent review pending.

Authority: [activation 1.0](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5676412208), [ScopeChallenge](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5676448051), [active amendment 1.1](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5676762017).

Startup confirmation was a session-wide acknowledgement, not authorization for an actual operation. Product now composes a session-owned authorization controller around tool invocation without changing NativeKernel scheduling or persistent event types. Concrete file tools own resource inspection and pre-effect checks. The application-side callback receives display metadata and returns a decision for exactly the pending request. Model arguments and replay records never install callbacks or confer authority.

The public session accepts optional `authorization: {protectedPaths, approval}`. No approval channel denies protected/outside file access and Shell; proven ordinary existing workspace files work; unresolved equivalence requires approval, including new files. `setApprovalChannel` is the trusted UI attachment seam, not model input; `revokeShellTrust` backs `:trust off`. Trust applies only to Shell and never survives close/restart/replay. Native session tools bind run/call/argument identity; admission is reserved before asynchronous Runbook/archive setup to prevent overlapping calls confusing identity. Direct tool factory calls retain built-in no-channel policy.

Current 1.2 file policy uses a resolved workspace anchor and component-boundary matches, not glob/regex secret detection. `.git`, `.ssh`, `.pan-agent`, `.npmrc`, `.env` and `.env.*` are protected; exactly `.env.example`, `.env.sample`, `.env.template` are exceptions. `protectedPaths` adds literal paths and subtrees, snapshotted for the session. Symlink components, nonregular files and multiply linked regular files are unsupported regardless of approval. Classification reads metadata only.

## Resource equivalence and uncertainty (1.2)

Authority: [Human-approved amendment 1.2](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5726933239). The rejected `2275aef69de9a254c61ab549a317e790a22de24f` used lexical comparisons; rejected `87644584c1ff36a0b1f1dd03a0ce800bf4cf8a0c` added filesystem identity but incorrectly skipped comparisons using an incomplete NFD/lowercase fold. R49-01 and R49-02 Evidence remain unchanged. [ScopeChallenge](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5726889995) established the missing-name comparison gap; 1.2 authorizes uncertainty instead of a speculative fold.

`PathAssessment` records `same / different / unknown` plus the basis and observed metadata for every applicable comparison. No JavaScript case/normalization/collation function, platform-name inference, native dependency, Unicode special-case table, or effectful classification probe is used. Exact lexical matches establish positive policy matches. Two existing eligible resources compare actual device/inode. If one resource exists and lookup of the other spelling is absent, it cannot be another spelling of that existing object: that specific comparison records `existing_resource_negative_lookup`. Two missing names never use this rule and remain unknown. Missing/unavailable configured anchors remain unknown even when other comparisons differ.

Protected ancestry is checked component by component using actual lookups of `.git`, `.ssh`, `.pan-agent`; no speculative string prefilter. Exact file classes `.env` and `.npmrc` also use actual lookup. Native realpath of an existing target supplies stored spelling, identity-checked against the request. A stored spelling that matches a protected lexical class is positive evidence even when the request spells an exception. For the `.env.*` basename family, an existing ASCII stored basename has finitely many possible suffix boundaries: compare the target with `.env.` prepended at every boundary using full filesystem lookups, without folding. Missing/native-unresolved or non-ASCII stored basename pattern semantics remain unknown unless a known protection match wins. This deliberately routes some ordinary Unicode filenames to approval; it is not a complete filesystem equivalence algorithm. ASCII input alone never bypasses ancestor, configured-anchor, stored-name or target-eligibility checks.

The exact lexical `.env.example`, `.env.sample`, `.env.template` exceptions remove only that pattern match, and only the same exact stored spelling discharges the corresponding existing pattern comparison. Protected ancestry, a known protected stored alias, outside access, additive configuration and unresolved comparisons still win. A missing exception file is uncertain. Positive protected matches take precedence over uncertainty; known outside access likewise requires approval. Proven ordinary existing controls remain automatic. Eligible uncertainty uses `resource_equivalence_uncertain`, with readable approval text; it is not labelled unsupported or definitely protected. Existing symlink/hardlink/nonregular/target-validation failures remain non-overridable.

The audit carries classification, read-only comparison/metadata evidence and its hash, bound into resource identity. File bodies remain length/hash only. Approval rechecks the recorded target and policy anchors before effects. Replaced or newly materialized configured anchors invalidate decisions. The file tool may acknowledge only its own recorded device/inode/mode creations to advance initially missing observations; this avoids a new approval loop without accepting unrelated new objects. Existing-handle operations retain their validated opened object after pathname rename. Metadata checks remain non-atomic under the unchanged 1.1 race boundary below; no content access, directory listing, probe creation or rollback is part of classification.

### Prospective expectation migration (1.2)

- Authorization policy tests now distinguish pre-existing ordinary files (automatic) from missing targets/ancestors/configured anchors (approval). Exact exception, unsupported-target, case/Unicode alias, ordinary/distinct and configured-anchor-swap controls are retained or expanded.
- Post-check creation and partial-ancestor limitation probes explicitly approve their uncertain creation before injecting the race. They still assert the same retained 1.1 partial effects, not vacuous pre-approval rejection.
- The installed authorization driver seeds its ordinary file as synthetic setup and adds `uncertain` / `uncertain-deny`. The PTY captures both reason and allow/deny at wide/narrow sizes.
- #61 installed activity and #60 view/archive regression seed existing ordinary files before Product execution, preserving their file effects and view assertions without leaving an unanswered approval. This changes setup, not the replay/view oracle. Existing approved semantic fixture sessions remain explicitly approved.
- Offline guard permits only read-only lstat probes of protected candidate names inside synthetic allowed roots and reserved peers of the exact allowed-root ancestors, logged separately. Original filesystem/content/network/credential restrictions remain. No real protected body is read to classify a name.
- CLI/TTY docs disclose uncertain file approvals. Old Human feedback and rejected captures retain their original SHA/package binding; new 1.2 evidence still needs independent and Human review.

## Named race boundary (1.1)

`AuthorizedFile.check` is the final validation immediately before each synchronous pathname syscall. There is no Human await or unrelated asynchronous work after it. Pre-check swaps invalidate the operation. Existing files open without create/truncate, are checked with fstat before content access, and all reads/truncates/writes use that same validated descriptor. Path renaming does not redirect a descriptor.

Missing directories are created one at a time, each preceded by checks; new final files use O_EXCL/O_NOFOLLOW. Post-creation checks precede writing content. Per-result `effects` reports completed directory/file creation and whether content writing began. Later failure retains this record; no path-based rollback is attempted.

Checks are not an atomic snapshot or atomic with pathname resolution. A concurrent replacement during checks or before the next syscall can cause creation in an unintended location. This is the Human-accepted 1.1 limit, NOT OS containment. Post-check probes remain limitation evidence, including empty replacement files, paired with mandatory pre-check rejection probes. Completed steps are not rolled back; cancellation does not undo completed effects. No native helper/dependency is added.

## Display, disclosure and audit

TTY approval defaults to Deny. Arrows select Deny / Allow once / (Shell only) Trust shell for this session; Enter confirms, Ctrl-G denies, Ctrl-C cancels. Page keys/wheel scroll full escaped operation text. An end marker distinguishes full details from an intermediate viewport. Paste does not choose or approve and does not alter the retained draft. Draft/caret/attachments/focus are restored. Non-TTY input has no interactive approval channel unless a trusted application explicitly provides one.

Commands are explicitly disclosed in approval. Arbitrary user secrets embedded in commands are not automatically detectable. File bodies/edits use only byte length and SHA-256; new audit carries request/session/run/call, policy/resource/arguments hashes, finite reason, scope and decision, not file payloads, environment values or reusable grant material. Existing ToolResult field behavior is retained. Sealed archives and replay execution are untouched.

## Expectation migration inventory

- Product daily/compact/readline startup: confirmation → idle task prompt, without Provider/credential-source invocation. Existing first-run settings configuration remains explicit configuration behavior.
- Existing conformance, general-agent, memory-lanes, pan-faux-tools and pan-deepseek-adapter fixture sessions: implicit unrestricted Shell → explicit trusted synthetic Allow-once callback. Tool semantics, environment and process-group cancellation assertions remain. The general-agent CLI fixture installs its callback explicitly. This is not the production default.
- Pan tool cwd oracle: lexical path → resolved anchor (macOS `/var` versus `/private/var`).
- Compact hostile-banner test: exit at idle instead of rejecting removed startup confirmation.
- Shared readline rendering retains the existing acknowledgement only for an explicitly injected Pi Frozen Reference kernel. Product CLI still rejects Pi; no Reference source/fixtures are modified. Cancellation received during asynchronous admission is remembered and seals a cancelled zero-call run before Kernel entry.
- New `authorization.test.ts`: no-channel/direct entry, policy, forged/late decisions, trust/revocation, cancellation, unsupported links, pre/post-check swaps, partial ancestor creation, opened-handle behavior and safe approval interaction. Frozen historical fixture bytes remain unchanged.

## Review

Builder results are not acceptance. Independent groups: A-POLICY, A-IDENTITY, A-TARGET-CANCEL, A-DISPLAY and A-ENTRY-AUDIT. C-AUTH-07 requires seven Human answers on the exact package. Source/package/raw PTY identities and zero external runtime meters belong in SHA-bound Handoff. No real Provider, credential, balance, paid execution, main push or fact promotion is authorized.
