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
