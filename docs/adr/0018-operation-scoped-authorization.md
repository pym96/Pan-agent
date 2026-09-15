# ADR-0018 — Operation-scoped authorization, Criteria 1.1

Status: candidate implementation of the Human/Master-authorized #49 contract; independent review pending.

Authority: [activation 1.0](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5676412208), [ScopeChallenge](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5676448051), [active amendment 1.1](https://github.com/pym96/Pan-agent/issues/49#issuecomment-5676762017).

Startup confirmation was a session-wide acknowledgement, not authorization for an actual operation. Product now composes a session-owned authorization controller around tool invocation without changing NativeKernel scheduling or persistent event types. Concrete file tools own resource inspection and pre-effect checks. The application-side callback receives display metadata and returns a decision for exactly the pending request. Model arguments and replay records never install callbacks or confer authority.

The public session accepts optional `authorization: {protectedPaths, approval}`. No approval channel denies protected/outside file access and Shell; ordinary eligible workspace files work. `setApprovalChannel` is the trusted UI attachment seam, not model input; `revokeShellTrust` backs `:trust off`. Trust applies only to Shell and never survives close/restart/replay. Native session tools bind run/call/argument identity; admission is reserved before asynchronous Runbook/archive setup to prevent overlapping calls confusing identity. Direct tool factory calls retain built-in no-channel policy.

File policy uses a resolved workspace anchor and component-boundary matches, not glob/regex secret detection. `.git`, `.ssh`, `.pan-agent`, `.npmrc`, `.env` and `.env.*` are protected; exactly `.env.example`, `.env.sample`, `.env.template` are exceptions. `protectedPaths` adds literal paths and subtrees, snapshotted for the session. Symlink components, nonregular files and multiply linked regular files are unsupported regardless of approval. Classification reads metadata only.

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
- New `authorization.test.ts`: no-channel/direct entry, policy, forged/late decisions, trust/revocation, cancellation, unsupported links, pre/post-check swaps, partial ancestor creation, opened-handle behavior and safe approval interaction. Frozen historical fixture bytes remain unchanged.

## Review

Builder results are not acceptance. Independent groups: A-POLICY, A-IDENTITY, A-TARGET-CANCEL, A-DISPLAY and A-ENTRY-AUDIT. C-AUTH-07 requires seven Human answers on the exact package. Source/package/raw PTY identities and zero external runtime meters belong in SHA-bound Handoff. No real Provider, credential, balance, paid execution, main push or fact promotion is authorized.
