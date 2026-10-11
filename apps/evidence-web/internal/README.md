# Internal responsibilities

- `config/`: startup configuration
- `database/`: unchanged migration ledger/SQL
- `identity/`: accounts and sessions
- `evidence/`: pure evidence parser
- `bundles/`: atomic imports
- `taskview/`: read-only public projections
- `httpapi/`: HTTP protocol and bounded cache
- `tasks/`: task transactions and explicit authority
- `executor/`: Node/Docker adapter
- `worker/`: coordination and independent maintenance
- `startup/`: dependency assembly and lifecycle
- `querylog/`: SQL observations
- `result/`: shared outcome/file data
- `testfixture/`: isolated real-PG test setup (not linked into the executable)

[Design and mapping](../../../docs/design/pan-web/packages119.md).

#122 keeps provider credentials in the Worker-only `config.Execution.KimiKey`
field, never in persistable reconciliation environment. Executor injects it into
only the task Node. Live sessions acquire an exclusive Worker lock; read projections
remain mutation-free and retain partial usage as unknown plus known subtotals.
