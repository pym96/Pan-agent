# Fixed-version historical assertions

This optional entry reproduces three revision-specific checks removed from the
[current regression](../runtime-ci/README.md). It does not establish current
graph correctness, repeat a full historical acceptance, or calculate a benchmark.

| Proof | Original accepted source | Executed assertion |
|---|---|---|
| `layout41` | `75de6de21c4f0c5e0a93c7a4143c5ecf94d92358` | Original four-test file and checker, including all five forbidden-edge forms, incomplete relocation map and changed executable default; checker reads `97fb7db1574a240b1a689733bc1b56791879c6d6`. |
| `facts25` | `3dc834ef3405564d8eeff802ca54cb5874079df3` | Exact C-MEM-08 facts-register freeze excerpt against `c366060a706ddbf1905943eed8d4aa029837e8c2`; only imports and a Node test harness are added. The Pi-era runtime is not loaded. |
| `routing43` | `eda8bd58e95ff52af95fe2e021ebf6c7778ba74f` | Entire original cutover test, including source installation wording and the then-active #43 heading. Its C-CUT criteria originate in #24 and were retained by #43. |

[manifest.json](manifest.json) pins full source and prerequisite Git SHAs,
test/checker/fixture/lockfile hashes, the exact facts excerpt lines/hash, and
[original criteria snapshots](criteria/README.md). Source commits pin the
remaining transitive files. Tests and the #41 checker are read from those
commits, never substituted with current versions.

## Explicit preparation

Use Node **22.19.0** or **26.7.0**, npm, Python 3, Git, a POSIX filesystem and
`ps`/normal process facilities. Historical setup owns its Git/network/storage
cost. A full clone is the simplest way to obtain the pinned revisions; an
existing local repository containing every manifest revision also works.
Choose new external paths:

```sh
git clone --no-checkout https://github.com/pym96/Pan-agent.git /tmp/pan-history-objects
mkdir -p /tmp/pan-history-home
HOME=/tmp/pan-history-home npm --prefix typescript ci --ignore-scripts \
  --no-audit --no-fund --cache /tmp/pan-history-npm-cache
python3 scripts/history-replay/run.py all \
  --repository /tmp/pan-history-objects \
  --npm-cache /tmp/pan-history-npm-cache \
  --output /tmp/pan-history-replay
```

The current and #41 lockfiles require the same pinned development packages;
the preparation command seeds that cache. Replay installs **the original #41
lockfile** with `npm ci --offline --ignore-scripts`. It never downloads a missing
package or a missing Git object. Replace `all` with a table ID for one proof.
An unknown ID, missing revision, missing/corrupt snapshot or unavailable offline
dependency is a non-success result with a diagnostic; prepare the named input
and retry into a new output directory. Do not treat absence as a skip.

Each replay creates independent Git object databases through local `file://`
transport with no alternates, plus its own HOME/TMP. The input repository is
read only. Commands have 120-second limits and share a 600-second deadline;
timeouts kill the owned process group. `result.json` records source/input hashes,
commands, return codes and nonempty TAP counters; stdout/stderr and generated
facts adapter survive failures. Output must be external and is never deleted
automatically. Remove only your own replay directories after retaining needed
evidence. Local and CI current verification never invoke this entry.

## Original evidence availability

Original [#25 Verdict](https://github.com/pym96/Pan-agent/issues/25#issuecomment-5548621547),
[#41 Handoff](https://github.com/pym96/Pan-agent/issues/41#issuecomment-5569244059)
and [Verdict](https://github.com/pym96/Pan-agent/issues/41#issuecomment-5569381978),
and [#43 final Verdict](https://github.com/pym96/Pan-agent/issues/43#issuecomment-5584418862)
retain original artifact locators and limits. Their external `/tmp` raw logs
are not stored by Git and are not assumed available. A commit SHA preserves
tracked source, not those external files. This command creates new bounded
reproduction evidence; it does not replace or rewrite an old Verdict.
