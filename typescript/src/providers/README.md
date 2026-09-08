# Providers

Provider implementations depend on shared protocol. CLI selects concrete implementations.

- [`deepseek/README.md`](deepseek/README.md): DeepSeek implementation.
- [`faux/README.md`](faux/README.md): deterministic Pan Faux implementation.

#44 streams provisional public text from concrete Adapters through the optional progress contract. DeepSeek owns the single incremental SSE codec; Faux can receive a deterministic asynchronous fragment source.
