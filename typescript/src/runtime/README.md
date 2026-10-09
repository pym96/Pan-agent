# Runtime

Runtime consumes protocol contracts and memory; it does not import concrete Providers/Tools or the UI.

- [`session.ts`](session.ts): task admission and memory binding.
- [`authorization.ts`](authorization.ts): #49 session-owned approval, identity binding, same/different/unknown protected-path policy, read-only evidence/revalidation and Shell trust/revocation; see [ADR-0018](../../../docs/adr/0018-operation-scoped-authorization.md).
- [`agent-kernel.ts`](agent-kernel.ts): Kernel contract, observations and limits.
- [`native-kernel.ts`](native-kernel.ts): existing iterative model/tool execution.

#44 adds SessionProgress (runId + turn + public delta) and a separately contained onProgressError diagnostic. This route is transient and closes on abort/settlement; SessionObservation and all existing execution/Context/memory semantics are unchanged.

- [`checkpoint.ts`](checkpoint.ts): private versioned Native state and awaited commit/invalidate barriers. `GeneralAgentSession.resumeTask` uses a new archive and the existing loop, without re-appending the user. Default runTask remains unchanged.

#111: optional pending/settled barriers preserve the single-tool response gap. Version2 recovery accepts only a trusted completed result or not-started resolution; default paths and version1 settled points retain their behavior. [Bounded consumer design](../../../docs/design/pan-web/operations111.md).
