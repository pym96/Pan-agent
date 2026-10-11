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
