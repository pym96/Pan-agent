# Packaging verification fixtures

`packed-create-run-verify-v1.json` fixes #35's four-response Pan Faux task: write `hello.js`, run it with Node, read exact source bytes, then final text. This is synthetic offline test data, not a Provider result. The consumer driver may read this fixture but does not implement the task's tools itself.
