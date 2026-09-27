# #98 disk policy candidate | Criteria1.0

Base `e0d88ecee96c2c1a45ccf1af8e34cf9ffebef2b1`. Builder implementation evidence, not an independent Verdict. [Structured summary](terminal-bench-disk-policy-summary.json) and [prospective operating procedure](../design/terminal-bench-full-campaign.md#98-disk-policy-and-preparation-only-successor).

## Change and evidence

C-DISK-01: full CLI uses one resourceCheck at initialization, prepare/run admission and periodic execution sampling. Free >= 21474836480 bytes; unchanged cumulative formula `owned + max(0,currentDocker - originalDocker) < 25769803776`. Exact byte boundaries and timer cancellation are exercised through deterministic samples, including no broker/model start after cancellation. Historical five-task chain, CPU/memory, package, manifests, provider, official timeouts, authorization and cleanup remain unchanged.

C-DISK-02: narrow `migrate97` successor command pins the entire original99-file inventory, old runner, 96 preparation records and original baseline. All89 states remain visible:59 ready,2 official-resource incompatible,1 image-not-cached,27 untouched. Read-only Docker image inspections matched all59 stored digests; no pulls or container starts. Byte-preserved source snapshots, new campaign provenance, imported-prefix checks and completion marker prevent silent rewriting. Existing source lock plus exclusive fixed destination prevent concurrent/repeated import. Source hash/baseline/identity/execution artifacts, altered imported digest/archive, duplicate/partial destinations and old signed binding are negative controls. The real successor directory remains absent.

C-DISK-03: disk/migration11 pass; full CLI23 pass (including original16 cases and7 resource cases); identity/selection/broker9 pass. These suites cover related mechanisms and are not benchmark scores. Host path/package acceptance PASS. Frozen package/manifest/Product unchanged; original99 campaign files and9 old real ledgers byte-identical. Unchanged #96 accounting, reservation, cleanup, scoring and lifecycle implementation evidence is carried forward by base SHA; this does not transfer acceptance to changed code.

## Reproduction and raw evidence

Raw evidence: `/Volumes/WD_BLACK/pan-agent/wo98-disk-20260927/builder/`. `index.json` indexes test logs, initial failures, dependency receipt, image inspections, source snapshot and positive/negative migration fixtures. Some fixtures intentionally contain corruption; their test names/logs define expected rejection. See `reproduce.sh` for exact offline test commands and issue-owned environment variables. The candidate working copy is `/private/tmp/wo98-disk/candidate`.

Test preparation recovered363 exact Harbor source files from the existing #74 archive (SHA256 `c7c3454798b41d7e0578b6cb2ae1f2578af41635ff18bc7f4b0e386ce1bdcac2`) into `/private/tmp/wo98-disk/deps`, plus minimal Name/Version metadata from its pyproject. The original installation had also lost Python dependency source files. Pinned `scripts/harbor/requirements.lock` dependencies were downloaded/installed solely in `/private/tmp/wo98-disk/python-deps` for Python3.12, no dependencies resolved beyond the lock. This setup is for offline tests only, not a changed production package. Failed missing-Harbor/metadata/dependency runs are retained; final tests passed against exact Harbor source and pinned imports. No credentials read, model calls, official evaluations, image downloads, Docker cleanup or old-environment writes.

## Judgment and remaining boundary

Human chose20GiB; Builder implemented/tested the boundary and successor; upstream Harbor supplied frozen dependency code. Initial assumption that the old Python test environment remained usable proved false at import. Rather than changing old paths or weakening the broker assertion, the Builder reconstructed an issue-owned test import environment and retained each failed attempt. Production dependency restoration remains a separate #97 startup prerequisite. Next time validate the entire import closure before starting regressions.

Independent Regulator must review exact remote candidate SHA and perform C-DISK-01/02 high-risk review with a different model family or Human H-DISK-BOUNDARY after technical review. No self-acceptance or real evaluation was performed. Master owns SOURCE_OF_TRUTH and prospective #97 contract/runner updates after accepted integration; Builder did not edit those out-of-scope files. No implementation facts or resume claims promoted.
