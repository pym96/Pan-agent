# #113 Builder evidence

[Task source of truth](SOURCE_OF_TRUTH.md), [report](report.md),
[design](../../design/pan-web/cache113.md). Raw records stay in the dedicated
private web113 state root; final inventory binds them by SHA256.

- [Validation map](validation.json), [query measurements](measurements.json),
  [frozen experiment](experiment-manifest.json), [800 query records](query-records.json),
  [Redis counter reconciliation](redis-counters.json).
- [Resource ledger](resources.json), [task/call ledger](ledger.json),
  [stop confirmation](stop.json), [baseline preservation](baseline-preservation.json).
- [Raw inventory binding](inventory-binding.json), [exact changed files](changed-files.json).

- [Repair 01: complete JSON envelope validation after Regulator rejection](repair-01/README.md).
