# Packaging verification fixtures

`packed-create-run-verify-v1.json` fixes #35's four-response Pan Faux task: write `hello.js`, run it with Node, read exact source bytes, then final text. This is synthetic offline test data, not a Provider result. The consumer driver may read this fixture but does not implement the task's tools itself.

`module-layout-public-types.ts` is a compile-only #41 client of all three installed package entry points. It checks Tool, Adapter, Session, CLI and TUI contracts against both baseline and candidate local tarballs; the compiler stays outside the consumer. It does not perform a task or replace any #35 tracer behavior.

## WorkOrder #42 UI fixtures

- [PTY driver](tui-pty-driver.mjs): actual Product CLI with parent-controlled Faux/Tool barriers.
- [Installed archive setup](tui-archive-consumer.mjs): cancelled 2/3 batches through Product Session and one explicitly corrupt fixture.
- [Fresh-process replay](tui-replay-consumer.mjs): actual installed TUI, blocked task-file reads, zero execution and sealed-byte equality.

These are verification clients, not Product implementations or live Provider responses. The original packed-create-run-verify/v1 fixture remains unchanged.
