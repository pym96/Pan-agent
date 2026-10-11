# #122 real Kimi Web composition (candidate)

Baseline `494169799fa57ed85539c1d1a7c2bc0c2684c56b`;
[Criteria1.0](https://github.com/pym96/Pan-agent/issues/122#issuecomment-6104471326).
Only Web composition changes. Installed Product tar SHA256
`70b6c7680f07f936343737f064e94cb9838aefb6264448c3639a935accce9d0e` and its 82 dist
files are reused; no provider parser or TypeScript changes.

## Credential and data flow

Operator startup environment → trusted Go Worker `Execution.KimiKey` → current
Node environment → installed `KimiFetchTransport` Authorization header, fixed
`https://api.kimi.com/coding/v1/chat/completions`. Persistable execution environment
excludes the key; reconciliation rejects an accidentally supplied key. Docker CLI
gets only PATH/DOCKER_HOST/DOCKER_CONFIG. The container mounts only read-only input
and isolated output. API/PG/Redis never get the provider credential. No credential
discovery is performed. Backup requires explicit reinjection for a new start.

The live input gate pins the report hash and excludes unrelated imported files.
The model sees the current question, completed public conversation quoted as user
history, input schema/instructions and necessary computed tool fragments. It writes
Python; no Faux code is selected for live. Installed adapter owns wire parsing and
exact in-memory continuation. Completed public answers are not forged adapter-owned
assistant messages. No raw transport body, response reasoning or secret is logged.
Structure diagnostics contain counts/types only.

## Execution and validation

Go persists mode/provider/model/reasoning/endpoint and attempt ID before sending
the job; Node records prompt/tool/validation/entry hashes before provider admission.
Existing PG authority ACKs gate every model/tool effect. An exclusive live Worker
session lock prevents concurrent Workers on the same database; existing Faux
capacity stays unchanged. Model errors stop the Worker after publishing the outcome
and cleanup. No new retries or whole-live-task clock limit; individual transport
exchanges and Docker commands retain bounded waits and cancellation.

`validate_artifacts` checks bounded regular single-link files, complete JSON,
version/summary/data/sources schema, immutable summary hash, RFC6901 pointers,
strict CSV shape and row source pointers. Repair feedback returns to the current
Native loop. Completion rechecks actual files. Completed execution with invalid
files is displayed as invalid; no invented correction. This validation does not
prove statistical/semantic correctness. Independent comparison against original
rows is a separate evidence calculation, never injected into live prompts.

## Recovery and evidence

Kimi checkpoint/operation restoration is rejected before transport, including a
Faux checkpoint presented to Kimi. HTTP resume rejects live task identity after
ownership lookup. Process loss keeps interrupted/unknown and sealed public archive;
no automatic new task. Faux restore stays intact. Browser refresh is read-only.

Fake transport tests exercise installed Kimi parsing/continuation, real Native loop
and Docker with synthetic private markers. Negatives cover missing credentials,
endpoint override, raw errors, auth/rate-limit, cancellation and pre-send restore
rejection. Real PG/Redis race tests cover single live Worker, resume isolation,
authority/fencing and cache behavior. Actual live work requires committed code and
an append-only manifest before the two-question browser journey. All attempts stay
private; only safe summaries/hash inventories enter Git. Independent review pending.
