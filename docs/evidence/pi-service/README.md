# Pi service evidence (#142)

Candidate Builder evidence, not independent acceptance or a production-capacity claim.

- [Experiment report](REPORT.md): state boundaries, failure probes, unoptimized pilots and corrected fixed-arrival cache comparison.
- [Results](results.json): all final repeats and diagnostic runs, sample counts, connection/task cardinalities and sampled resources.
- [Manifest](manifest.json): immutable raw evidence identity and source/package/container hashes. Raw files are retained in the Handoff's durable artifact directory, not copied wholesale into the source tree.
- [Resource arithmetic](summarize-resources.py) and [separate post-load replay probe](replay-suffix.py). The latter never invokes Pi or a model and is not a continuation of the original clients.
- [Reproduction and limits](../../../platform/pi-service/README.md).

To recompute existing evidence without running workloads:

```sh
python3 platform/pi-service/scripts/analyze.py /path/to/artifacts/raw
python3 docs/evidence/pi-service/summarize-resources.py /path/to/artifacts/raw
```

Raw `*-task-times.json` fields are PostgreSQL **transaction-start intervals**, not exact queue/commit latency; see `transaction-time-caveat.json` and `workload-timeline.json` in the artifact inventory. Negative diagnostic values are retained. Exact durable-admission-to-claim elapsed time is unmeasured. Original subscribers close at the hold deadline: `replay-suffix-results.json` establishes separate suffix recoverability, not later catch-up by those original connections.

Old Pan Runtime, benchmark records, releases and resume facts are unchanged. Human selected Pi reuse and concurrency learning; Builder implemented and measured this isolated service; independent Regulator owns acceptance.
