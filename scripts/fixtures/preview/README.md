# Preview first-task verification assets

`../preview-first-task-v1.json` fixes #51's deterministic offline first task: the frozen prompt, four Pan Faux responses, write `hello.js` → `node hello.js` → read exact source bytes, then the frozen `verified PAN_PREVIEW_OK` final marker. This is synthetic offline test data, not a Provider result. The #35 `packed-create-run-verify/v1` fixture keeps its own frozen identity and is not reused.

- [check-driver.mjs](check-driver.mjs): deterministic installed-Product client for C-ENTRY-02. Imports only shipped exports and Node built-ins, feeds the frozen prompt through the real `runTui` streams, asserts four exchanges, three admitted tools in order, Context/archive identities, child-environment allowlisting and zero canary leaks. It never writes or runs the answer itself.
- [replay-driver.mjs](replay-driver.mjs): fresh-process `:replay` client for C-ENTRY-03. Empty Faux script, workspace-read traps, tool-effect traps, sealed archive and workspace hash equality, zero exchanges.
- [interactive-driver.mjs](interactive-driver.mjs): Human-facing TTY composition used by `../../demo_preview.mjs`. Scripted streaming Faux replies, local transcript/report recording, no real Provider.

These are verification clients, not Product implementations or live Provider responses.

## #52 first-run settings drivers

- [config-configure-driver.mjs](config-configure-driver.mjs): installed `configure` flows from verifier-supplied answers; kimi-code renders unavailable and persists nothing.
- [config-task-driver.mjs](config-task-driver.mjs): restart restore of the persisted selection, CREDENTIAL line, deterministic Faux task, canary containment.
- [config-boundary-driver.mjs](config-boundary-driver.mjs): capture-only transport probe; the env canary reaches exactly the authorization header on the official endpoint.
- [config-keychain-driver.mjs](config-keychain-driver.mjs): disposable-item accept/decline/interrupt lifecycle with cleanup on every path.
- [config-interactive-configure.mjs](config-interactive-configure.mjs): Human demo configure helper pinned to the test Keychain item.
