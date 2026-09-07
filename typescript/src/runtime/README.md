# Runtime

Runtime consumes protocol contracts and memory; it does not import concrete Providers/Tools or the UI.

- [`session.ts`](session.ts): task admission and memory binding.
- [`agent-kernel.ts`](agent-kernel.ts): Kernel contract, observations and limits.
- [`native-kernel.ts`](native-kernel.ts): existing iterative model/tool execution.
