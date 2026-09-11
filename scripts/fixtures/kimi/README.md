# Kimi Code verification fixtures

`kimi-wire-v1.json` freezes the #53 OpenAI-compatible Kimi wire transcripts: four exchanges of the preview first task (write → bash → read → final with usage), the missing-usage wire, malformed wires (bad JSON, data after [DONE], unknown finish, reasoning field) and status-coded provider errors whose bodies carry canary text that must never surface. Synthetic offline data, not a Provider result.

Drivers:

- [kimi-task-driver.mjs](kimi-task-driver.mjs): installed restart task through the REAL PanKimiModelAdapter with a scripted no-network transport; asserts request shape, tool order, archive and canary containment.
- [kimi-boundary-driver.mjs](kimi-boundary-driver.mjs): capture-fetch boundary probe; the env canary reaches exactly the authorization header on the frozen official endpoint.
- [kimi-switch-driver.mjs](kimi-switch-driver.mjs): provider switch starts a fresh session — no DeepSeek history crosses into the first Kimi request; the old run stays replayable with zero effects.
- [kimi-interactive-driver.mjs](kimi-interactive-driver.mjs): Human demo composition streaming the frozen wires through the real adapter.
