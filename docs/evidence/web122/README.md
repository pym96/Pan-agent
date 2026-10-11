# #122 Builder evidence (in progress)

[Criteria1.0](https://github.com/pym96/Pan-agent/issues/122#issuecomment-6104471326),
[composition](../../design/pan-web/live122.md), [deployment](../../../apps/evidence-web/deploy/README.md).
Baseline `494169799fa57ed85539c1d1a7c2bc0c2684c56b`. Independent review pending.
Private cumulative root `/Users/panyiming/.local/state/pan-agent/web122/`.
Original #114 evidence and Human-authorized video relocation remain unchanged.

Offline logs retain initial fixture setup failures (missing test env, synthetic SSE
missing its required object field, test launcher PATH), followed by corrected runs.
These are Builder test setup mistakes, not live model failures. No real requests
occurred in those tests. The privacy repair separates provider credentials from the
persisted reconciliation environment and Docker child environment. Public history
is quoted for a new task instead of forged as adapter-owned continuation.

See [current evidence navigation](SOURCE_OF_TRUTH.md). Live manifests and final
Handoff will bind exact code/artifact identities; no acceptance is claimed here.

## Offline pre-live evidence

[Offline test/hash index](offline.json): real PG/Redis race regression, vet/build,
UI build, installed Kimi fake transport and actual Docker, synthetic secret/private
continuation boundaries, auth/rate-limit/cancel and zero-send resume rejection,
artifact JSON/CSV negatives, isolation, operator, structure, two Faux browser turns
and explicit receipt recovery. The #114 installed Pan dist remains exactly 82 files.

The resource sampler's `productHash` refers to its retained #97 runner verification,
not the Web package. Current Pan identity is explicitly in `pan-dist.json` and the
Web package/installation manifest. No historical ledger baseline is reset.

## Live01: failed before any send; retained and repaired

Manifest `execution-manifest-live01.json` binds code
`e156863cdb9833d7fcb24cd2e691f130284cc46d`.
Task `d2311640dc8c1cd628d7a41ea6d5f653479e5f18b2e2629cf3009de40aaced76`
ended interrupted with stop confirmed and **0 provider.send / 0 model-turn starts**.
The real importer copies `manifest.json`; Builder's first live allowlist omitted
this authorized input. Direct executor fixtures also omitted it, so they missed the
composition mismatch. Raw task input, events, stderr, original manifest and browser
video remain under `live-data01` / `live-browser01`.

An offline replay against the original installed executor rejects the exact retained
Go layout before admission/send; the repaired validator accepts the same read-only
layout. It verifies that manifest declares only the fixed report with its actual hash,
and continues rejecting unrelated attachments and altered hashes. Tests now include
the real three-file layout. Safe startup error codes are retained without arbitrary
exception text. This is a Web input-boundary defect, not a provider failure. Further
live work uses a new code SHA/manifest/task; the first attempt is not erased or resumed.

## Live02: two completed tasks, reporting scope narrowed afterward

[Retained results/hash index](live02.json). Actual installed Kimi drove Python/Docker,
with 89-row and five-row CSVs and valid hashes/pointers. q1 also presented an unsolicited
18/23 conditional ratio and the separately labeled cumulative observed-usage field.
Those values were not injected into the prompt and are not promoted as a benchmark
score. Builder judged the answer broader than the contract's reporting boundary and
retained it verbatim. The next prompt explicitly limits reporting to counts, valid
score denominator and segment7 task accounting; it adds no expected counts or task
answers. New commit/manifest/tasks are used, and both earlier completions stay in the
cumulative denominator. This is a prompt scope correction, not a provider/parser fix.

- [Credential, outbound-data and recovery boundary review material](boundary-review.md).

The read-only [independent row/context oracle](verify_results.py) can be rerun by
Regulator into their own output path:

```sh
python3 docs/evidence/web122/verify_results.py live-browser03 \
  --root /Users/panyiming/.local/state/pan-agent/web122 \
  --output /path/to/regulator/verification.json
```

It derives counts/denominator from raw rows, checks every CSV task/state/reward/score
cell and original pointer, checks file hashes, and decodes the quoted public context.
The first private oracle attempted an unescaped substring comparison against JSON
quoted history; that check was corrected to decode the JSON. Its original script is
retained. No product output or model context was altered by the verifier.

## Final Builder delivery

[Final evidence/hash index](final-index.json) binds live runtime commit
`27dde5c199364858c48e4e2f673dec92c6bd66dd`. Later candidate commits contain evidence
and navigation only. The final full candidate SHA is supplied in the GitHub Handoff
on [#122](https://github.com/pym96/Pan-agent/issues/122), with its Draft PR.

Latest journey (`live-browser03`) completed the two exact contract questions:
classification counts 18/5/20/20/26 across 89 rows, valid-score denominator 23,
segment7-only usage, followed by exactly five valid failures. Independent raw-row
recalculation checks every CSV task/state/reward/score cell, original pointer and
artifact hash; actual second-exchange public context equals the first completed
answer. No expected counts or failed-task list were injected into the model prompt.

All three manifests and five real task attempts remain retained: live01 interrupted
before any send; live02 two completions with overbroad reporting; live03 two completed
constrained answers. Cumulative **25 actual sends / 25 settled turns**, known input
111,613 and output 10,673 (total 122,286), reported cache-read 0; cache-write unknown
on all 25 turns. There were 18 actual Docker analyses and four artifact-validation
results across the four completed real tasks. These are this Web delivery's usage,
not the historical report's usage or a benchmark score. Offline Faux and fake
transport probes are separate and contribute zero real Provider sends.

Go race with real PG/Redis, vet/build, UI build, source/package identity, fake Kimi
privacy/failure/feedback tests, Docker isolation, Faux two-turn/receipt-recovery and
actual live checks are recorded. Source Go and TypeScript stayed unchanged after
those final Go tests; subsequent live repairs affected only input validation and
prompt scope and were covered by fresh Node/Docker probes. Installed Pan 82-file
identity is unchanged. No old migrations or #97 evidence were modified.

Actual account-B reads return404; the retained interrupted live task returns409
unsupported on resume, without send. Stop/start retains results/context/download
hashes and total25 sends. Final application processes and analysis containers are
absent. Physical private PG exports and all attempt/event/admission records are under
`ledger-final/`; the point-in-time private inventory lists 7,340 files and found no
known startup credential in their bytes. Subsequent report/Handoff additions are
separately hash-bound.

Video: `video/pan-web122-live.mp4`, 306.96 seconds, 1440×1080 H.264. It transcodes the
entire latest actual browser recording, without cuts, time jumps or Faux/earlier-run
splices. Full ffmpeg decoding and Chrome playback to ended=true/error=null passed.
Older videos remain retained. Package: `pan-web122-live03-macos-arm64.tar.gz`.
Both live under the private root; no original video or credential is uploaded.

Resource sample: cumulative57,492,975,616 bytes <57,982,058,496; free24,045,641,728
>=21,474,836,480. Original Docker baseline48,503,971,840 remains unchanged, and the
Human-relocated #114 asset is counted. No prune, old-evidence deletion, main update,
Terminal-Bench run, Provider implementation change or acceptance claim occurred.

Limits: fixed authorized report only; validation proves structure/hash/pointer
validity, not general answer correctness; live private continuation has no persisted
recovery. Independent Regulator and the contract's high-risk boundary review remain.
