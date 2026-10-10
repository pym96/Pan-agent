# #113 Criteria1.0 repair 01 — complete cache JSON

Repairs rejected candidate `bdbc270baece1580ca356c68e294dde835ad33bf`.
Original report, failed tests, metrics, inventory and cumulative ledger are retained.

Regulator source: `/Users/panyiming/.local/state/pan-agent/web113/regulator/Verdict.md`,
SHA256 `4b2a6381309a312511071e7b7d5999cf1142c74f61ad3261fcc7d01cedbaa75a`.
Blocker C-WEB113-01: a valid signed envelope followed by malformed text was
accepted as a hit because a single Decode only checks a stream prefix.

`lookup` now requires a second Decode to return io.EOF. JSON trailing whitespace
is allowed; another value or syntax error is a miss. Existing unknown-field,
identity, MAC and age checks remain. The fix does not change authorization,
limits, Worker state, TS Product, dependencies or migrations.

`TestCacheCompleteJSONEnvelope` uses real Redis GET/SET and the real handler/PG.
After capturing a signed queued view it changes PG state without eviction.
No suffix and `space/tab/CR/LF` still hit the signed queued view. Garbage,
a second object and a second null must miss and return PG's cancelled state.
This verifies actual fallback, not only a header or decoder unit result.

Private originals: `~/.local/state/pan-agent/web113/repair-01/`.
`red.log` records all three negative cases failing before the code fix;
`green.log` records the full Go race suite passing after it. `vet.log` and
`build.log` passed. The child-only test's parent skip remains intentional.
[Validation and identity binding](validation.json), [changed paths](changed-files.json).

Commands (from apps/evidence-web, with a new dedicated dummy PG/Redis):

```sh
go test -race -v -run '^TestCacheCompleteJSONEnvelope$' .
go test -race -v ./...
go vet ./...
go build -o <repair-root>/evidence-web .
```

New services use dedicated ports 54115/63114, now stopped. Old runtime, Redis
and Regulator processes/data were not restarted or modified. Old 3770-entry
inventory reverified with zero mismatches. Baseline Docker allocation remains
48503971840 bytes; resource sampling includes the Regulator's expanded roots,
all Web106–113 external archives and npm cache. Earlier narrower samples remain
historical; the new figures neither reset nor replace cumulative costs.
No new real Provider, Faux task, benchmark or scoring calls; original task/call
ledger carried forward unchanged. Coding tokens unknown.

Impact: original 800-query measurements remain evidence of the old SHA, not new
performance measurements. No repeated load or selection of best rounds. The
new EOF check adds bounded parse work and changes malformed-input behavior;
valid-cache semantics and configured limits are unchanged. Independent Regulator
must bind the new SHA and continue its remaining checks; no acceptance implied.

Learning: verifying a signature over a parsed object does not establish that all
input bytes obey its serialization contract. The original tests covered damaged
prefixes/fields but missed valid-prefix-plus-suffix inputs. Regulator found the
boundary; Builder added both accepted-whitespace and rejected-suffix controls.
Human authorized the repair. No evidence of cross-account access or forged
execution authority was established by this particular bug.
