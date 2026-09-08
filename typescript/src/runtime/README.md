# Runtime

Runtime consumes protocol contracts and memory; it does not import concrete Providers/Tools or the UI.

- [`session.ts`](session.ts): task admission and memory binding.
- [`agent-kernel.ts`](agent-kernel.ts): Kernel contract, observations and limits.
- [`native-kernel.ts`](native-kernel.ts): existing iterative model/tool execution.

#44 adds SessionProgress (runId + turn + public delta) and a separately contained onProgressError diagnostic. This route is transient and closes on abort/settlement; SessionObservation and all existing execution/Context/memory semantics are unchanged.
