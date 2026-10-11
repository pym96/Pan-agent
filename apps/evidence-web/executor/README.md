# Web107 Native Pan consumer

main.mjs consumes the public built Pan exports (`GeneralAgentSession`, `RunArchiveStore`, `FauxModelAdapter`). Node stdin accepts one server-created job; stdout emits JSON event/result envelopes, never TUI text. Go keeps stdin open while alive; EOF cancels the session. The executor is not an HTTP endpoint and client-supplied executable paths/modes/code are not accepted by the API.

The ModelAdapter factory is the injection seam for a separately authorized provider consumer. In this delivery only the deterministic Faux factory is used: it scripts Python code, then reads the real canonical tool result to construct its final response. NativeKernel owns the actual model/tool turns and error feedback. This fixture proves wiring/computation, not natural-language understanding. Do not switch factories to a real provider under #107; reported0 provider sends applies only to this Faux composition.

analysis.py is the **scripted code fixture**, not an answer file. Docker computes counts/CSV from the copied input; no target counts are embedded. A second synthetic report with changed scores is used to verify changed computed output. Mode `tool-failure` scripts exit7 then a successful call, `model-error` a terminal canonical failure with unavailable usage, and `hold` a long tool for process-termination testing. Only trusted operator environment WEB107_SCENARIO selects these test scenarios. No model/API credential is loaded.

Docker tool uses a pinned image ID, standard Python library, network none, read-only root and input, task-only output, non-root65534, all capabilities dropped, no-new-privileges,64PIDs,64MiB tmpfs,2CPU/4GiB defaults (bounded1–4CPU/1–8GiB). No home/DB/socket mount. Generated code is a Docker argv value, not a host shell command. Tool exit/stdout/stderr returns to Pan. Each container is inspected, stopped/removed and absence-checked before output reads. Artifacts are a fixed allowlist of regular single-link files <=2MiB; symlink/traversal requests fail. Original input copies are never edited. JSON/base64 output is bounded; the DB stores downloads atomically, and paths from clients/model output never select host files.

resources.mjs reuses the existing read-only cumulative sampler and original48503971840 Docker baseline before each tool launch. It includes old required roots, issue state, external media, dependency caches and PostgreSQL. No dynamic/networked dependency installer exists; the pinned standard-library image is prepared without evidence mounts. Package build/install is normal development setup, not an analysis tool.

check-isolation.mjs runs a harmless actual Docker probe for denied input writes, network/host-file/socket access, absent credentials, and output traversal/symlink rejection; use only issue-owned WEB107_TASK_ROOT and pinned PAN_IMAGE. It retains fixtures.

#108 adds hash-bound execution-time public snapshots through existing initialMessages. Actual first-exchange canonical messages are recorded. New session per task; no archive reopening/private continuation. Follow-up scripted Python checks prior valid_failure count against the same immutable input and emits filtered rows with original pointers. Trusted WEB_FAUX_BARRIER test mode pauses before the first exchange until the owned release file is written, with explicit waiting/released observations; no request-supplied host paths. WEB_ISSUE=web108 selects only that issue container namespace, preserving defaultweb107.

#109 keeps one structured Node job but accepts a later trusted stdin `{action:"cancel"}` control. It aborts via the existing Pan session.cancel hook; no inner Agent Loop is copied. WEB_ISSUE includes web109. Cancellation observations, terminal Run Archive and raw envelope remain historical; the Go transaction decides whether the envelope is public success or an old attempt. Trusted tool/result barriers provide deterministic fault ordering for offline tests; they are disabled by default and not controlled by HTTP/model text.

## #110 checkpoint mode

`checkpoint.mjs` supplies identity/file validation, private fsync barriers and two-stage Faux; `stage2.py` consumes `stage1.json` to produce five failure CSV rows while retaining whole-report counts. `archive-recover.mjs` performs stop-only existing Product sealing and preserves original unsealed event bytes. Private checkpoint files never enter HTTP downloads or stdout.

#111: `operation.mjs` owns the private pre-dispatch/dispatch/receipt barriers and bounded reconciliation; `reconcile.mjs` is a readonly server-launched verifier, never a model tool. `WEB_OPERATION_MODE=1` adds single-tool pending points. Trusted fault fixtures `WEB_OPERATION_FAULT=pre-dispatch|after-dispatch|after-receipt|receipt-failure` hold/fail only owned executions. Faux question `fixture:nonzero` produces the explicit exit7 feedback fixture. Receipt completion occurs after the container exits, before its cleanup and before returning to Native. Cleanup remains required before API admission. [Design](../../../docs/design/pan-web/operations111.md).

#112 adds `ownership.mjs`: per-action job-bound admission ACKs for the model wrapper and Docker tool; generation enforcement remains PG-authoritative. Before/after fixtures are private fault barriers. `sandbox.execution` preserves actual Docker start/finish timestamps.

#113 reuses #112 ownership admission under the separate `web113` resource
namespace, with the same default 1CPU/1GiB analysis containers. Redis is never
passed to or consumed by the executor or Native Pan.

#119 supersedes the historical namespace capability selectors above: `WEB_ISSUE` is only a validated resource namespace; the current Go entry injects `WEB_MODE=product`, and Node requires explicit authority for every model/tool action. Defaults are 1 CPU/1 GiB. Go process/stream/stop adapter now lives in `../internal/executor/`. No changes to the TypeScript Product package.

#114: `resources.mjs` contains the standalone equivalent of the accepted inode-deduplicated host sampler and strict cumulative thresholds; no benchmark-runner import is required by the deployment. Includes historical roots plus the installed program/data and web114 archives. `check-resources114.mjs` verifies allocation aliases and limit boundaries.

#122 adds `live.mjs`: explicit installed Kimi composition, fixed profile/endpoint,
quoted completed public history, bounded artifact validation with in-loop feedback.
`check-live122.mjs` and `check-live-failures122.mjs` use **fake transport only**;
the former runs real Docker. They never establish real model success.
Docker subprocess environment is now an explicit allowlist, not Node's environment.
See [live design](../../../docs/design/pan-web/live122.md).
