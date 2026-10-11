# Pan Web · #106 design

Current slice: [private evidence import and inspection](../../../apps/evidence-web/README.md). Product candidate, separate from TypeScript Pan execution. #105 describes later conversations/model execution/scheduling/cache/recovery; #106 implements none of those future layers.

The Go service exposes same-origin account/session and immutable evidence APIs. PostgreSQL owns accounts, session-token hashes, bundle ownership, normalized overview and original file bytes. React was chosen for the small stateful upload/list/source interface and straightforward text escaping; esbuild produces static assets without a separate deployment server. No frontend framework approval is needed under the contract.

An Evidence Bundle here is a user's manifest plus exact input copies and parser identity. It is not a Campaign or a Run Archive. The import adapter only reads top-level classifications and segment7Final.tasks[0].accounting.usage. Every row, count collection and usage object carries a JSON Pointer into its immutable imported summary. Historical snapshots are preserved as file bytes but not summed. Null scores remain null; rawReward and validScore are distinct. The UI labels data as imported report records, not fresh official results.

Atomic database storage was chosen over filesystem blobs for this16MiB first slice: the same transaction commits file bytes and ownership, so there is no split database/filesystem success state. A larger artifact store can be considered in a later scoped workorder. Downloads reproduce original bytes; no update/delete endpoint exists. External DB administrators remain trusted and can alter storage; this is not a cryptographic defense against DB-admin compromise.

Boundary checks: cookie sessions plus exact Origin on mutations; per-account queries on every evidence endpoint; strict upload filenames/hash/schema validation before writes; text-only rendering, CSP and download attachment headers. Normal invalid imports return file/field-specific errors; infrastructure/login errors do not echo credentials. Tests cover actual HTTP/DB/browser behavior. Public deployment, comprehensive identity operations, rate limiting, Redis, executor access, performance claims and new benchmark results remain out of scope.

[Evidence](../../evidence/web106/README.md) · [source navigation](SOURCE_OF_TRUTH.md).

## #107 single-question execution

The Product candidate adds an independently deployed Go Worker, holding a PostgreSQL session advisory lock and heartbeat. HTTP creates owned queued tasks; one Worker claims one task, copies only that bundle to an exclusive task directory and starts a thin Node public-Pan consumer. GeneralAgentSession/NativeKernel own the actual model/tool loop, canonical observations and sealed Run Archive. Go persists structured observations, terminal results and validated artifacts; it does not parse a TUI or Provider reasoning.

The offline composition injects FauxModelAdapter: scripted Python code calculates the immutable report inside Docker, then Faux consumes the actual ToolResult to form the answer. It is deterministic integration evidence, not a language-understanding evaluation. Changing account B's fixture changes computed results. A future separately authorized ModelAdapter can use the consumer seam. No live provider is configured in this slice.

Docker is unprivileged, network-none, read-only root, user65534, cap-drop ALL, no-new-privileges, bounded processes/memory/CPU. Only task input(read-only) and task output are mounted. Node's environment is whitelisted; it receives neither DB nor Provider credentials. Output admission accepts only bounded regular, non-symlink, single-link analysis.json/details.csv; HTTP downloads read account-owned database bytes. Trusted local operators/DB admins remain outside this isolation claim.

Completed artifacts/results/events survive app/database restarts. Heartbeat loss marks running work interrupted; restarting reconciles only owned Node/container identities before admission, never replays interrupted work. Unknown cleanup blocks admission. This conservative policy avoids claiming exactly-once or using a sealed archive as a checkpoint. No distributed lease takeover, user cancellation or conversations are implemented here.

[#107 evidence](../../evidence/web107/README.md) · [executor](../../../apps/evidence-web/executor/README.md).

## #108 conversation ordering and context

Conversation owns one immutable bundle and server-side monotonic next_sequence. A row lock covers duplicate detection, sequence assignment and task insertion. Unique(account,conversation,requestID) plus unique(conversation,sequence) are database invariants, independent of timestamps/client clocks. Conflict does not rewrite the original question.

The single Worker blocks descendants of unavailable prerequisites, then claims an eligible task only after all earlier sequence tasks completed with confirmed cleanup. It freezes public context inside the claim transaction, never at enqueue time. Each task still uses a new GeneralAgentSession with public initialMessages: ordered completed user questions/assistant answers and bound source/task identities. SHA256 of exact snapshot text binds the consumed history; the first real adapter exchange is observable. No Provider continuation or archive replay.

A262144byte explicit context bound fails visibly rather than silently dropping older turns. Existing legacy completed tasks remain outside conversations with null context; no synthetic provenance is attributed to history. New API routes recheck ownership; conversation bundle cannot be rebound. Old task/file routes remain guarded. No distributed concurrency or exactly-once claim. [Evidence](../../evidence/web108/README.md).

## #109 revision and cancellation decisions

A control ledger owns immutable account/conversation/request identity. Conversation locking serializes replacement against append; task locking orders cancel intent against final result publication. The first committed decision wins. Queued cancel is terminal without execution; running cancel remains cancelling until recorded child exit and labelled container absence are confirmed. User cancellation is separate from Worker shutdown, so a successful stop permits unrelated work to continue. Unknown stops preserve the global safety guard.

Replacement creates a new task/sequence with replaces, marks the old target inactive and withdraws its unexecuted suffix as superseded. Public context uses only active valid completed prefix. This avoids both using cancelled answers and permanently blocking the new revision on its own retired branch. All rows, raw envelopes, archives, artifacts and known/unknown usage are retained. Late completed results belong to attemptResult only when cancellation won. No archive replay or distributed continuation is claimed.

Worker uses its owned child channel/process handle and task-labelled Docker identity, never a client PID/container argument. A5second graceful allowance can lead to force-stop, but only actual process wait and Docker inspection prove release;30second cleanup failure stays unknown. Stop-only recovery may admit the new task after confirmation. [Evidence](../../evidence/web109/README.md).

## #110 confirmed checkpoint recovery

[Design and pending Kimi storage policy](checkpoint110.md); [Builder evidence](../../evidence/web110/README.md).

#111: [operation reconciliation design](operations111.md), [evidence](../../evidence/web111/README.md).

- [#112 concurrent ownership](ownership112.md): task generations, atomic admission/revocation, managed stop and paired Faux capacity experiment.

## #113 bounded public query cache

[Design and operating boundaries](cache113.md): PG authority, process-bound
signed cache snapshots, bounded age/fallback, separate query accounting.

- [#119 package ownership and independent maintenance](packages119.md): explicit execution authority and read-only query seam.

- [#114 local deployment assembly](deployment114.md), [operator manual](../../../apps/evidence-web/deploy/README.md).

- [#122 real Kimi Web composition and boundaries](live122.md) (candidate).
