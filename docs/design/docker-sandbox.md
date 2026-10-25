# Docker sandbox — SB1.0 candidate

WorkOrder: [#148](https://github.com/pym96/Pan-agent/issues/148). This is a Product extension; historical Python/Harbor implementations are unchanged.

The host owns model calls, authorization and durable receipts. A `SandboxSession` creates a fresh `DockerSandbox` for each Pan run; registered tool schemas are reused without constructing host executors. All four tools cross this boundary. The existing authorization channel admits each exact invocation once; sandbox approval has no trust-shell expansion. Retrieval is not registered.

The Docker module hides fixed profile flags, exact ownership checks, command wait state, export validation and recovery. State is atomically fsynced outside the volume before resource creation. Resource labels bind a random token and sandbox run ID; known IDs and deterministic names are reconciled before stop/removal. Multiple verifier intents remain recorded. A missing main container can be replaced only by a never-started, fixed-profile read-only reader for archival. Reader creation intent precedes Docker creation, so death before ID persistence is recoverable by its deterministic name.

`prepared → running → stopping → stopped → verifying/exporting → archived → cleaned`. A command wait timeout returns feedback while its bounded tracked command can continue. Task cancellation closes admission and stops the container. Process death is uncertain execution: recovery stops first and never reruns commands. Verification starts only after execution stops and mounts the volume read-only.

Export reads a bounded Docker tar, validates every entry before writing any output, stages regular files, commits a hash manifest by rename, then writes a receipt. Death between rename and receipt is repaired only after validating every exported file. Cleanup revalidates the archive; tampering blocks volume deletion. Staging locations remain in the event history if a controller dies before publication.

## Deliberate limits

- Linux ordinary Docker / cgroup v2 only; no rootless fallback, daemon mutation, root helper, GPU, socket mount or network. Docker daemon access is trusted. This is container isolation, not a hostile-daemon boundary.
- Fixed image/profile. A daemon-mediated fixed initialization tar assigns the existing `nobody` UID/GID 65534 to the fresh task directory before the container starts; no model-controlled initialization and no overwrite during recovery.
- Input snapshots are individually selected regular files, up to 1 MiB aggregate. Default host-local behavior is unchanged.
- 1 MiB stdout/stderr capture and 64 MiB / 1,000 regular-file export. PAX/GNU long-name extensions, links and special files are rejected rather than rewritten.
- No disk quota or free-space monitor during arbitrary task execution. The 20 GiB preflight is not a hard disk limit. Resource-test watchdogs are test harness controls, not a claim that ordinary TUI tasks have a 120-second lifetime.
- Cooperative single lifecycle controller per state directory; concurrent independent controllers are not supported. State and selected-input paths must be trusted host locations.

See [evidence](../evidence/sandbox/README.md) for real CPU Docker probes, failures and source identities.
