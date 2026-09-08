# DeepSeek

Relocation preserves credential resolution, transport, model behavior and all literals.

- [`deepseek-profile.ts`](deepseek-profile.ts): profile definitions.
- [`deepseek-transport.ts`](deepseek-transport.ts): one-request transport.
- [`pan-deepseek-model-adapter.ts`](pan-deepseek-model-adapter.ts): canonical/wire translation and response assembly.

- [abortable-body.ts](abortable-body.ts): races pending body reads against abort and requests source cleanup without waiting for EOF.

#44 prospectively makes the existing SSE decoder incremental. The request settings, credential resolution, reasoning continuation, complete validation, usage and identity semantics remain unchanged. Only public content enters progress.
