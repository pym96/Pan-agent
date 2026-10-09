# Pan Web · #106 design

Current slice: [private evidence import and inspection](../../../apps/evidence-web/README.md). Product candidate, separate from TypeScript Pan execution. #105 describes later conversations/model execution/scheduling/cache/recovery; #106 implements none of those future layers.

The Go service exposes same-origin account/session and immutable evidence APIs. PostgreSQL owns accounts, session-token hashes, bundle ownership, normalized overview and original file bytes. React was chosen for the small stateful upload/list/source interface and straightforward text escaping; esbuild produces static assets without a separate deployment server. No frontend framework approval is needed under the contract.

An Evidence Bundle here is a user's manifest plus exact input copies and parser identity. It is not a Campaign or a Run Archive. The import adapter only reads top-level classifications and segment7Final.tasks[0].accounting.usage. Every row, count collection and usage object carries a JSON Pointer into its immutable imported summary. Historical snapshots are preserved as file bytes but not summed. Null scores remain null; rawReward and validScore are distinct. The UI labels data as imported report records, not fresh official results.

Atomic database storage was chosen over filesystem blobs for this16MiB first slice: the same transaction commits file bytes and ownership, so there is no split database/filesystem success state. A larger artifact store can be considered in a later scoped workorder. Downloads reproduce original bytes; no update/delete endpoint exists. External DB administrators remain trusted and can alter storage; this is not a cryptographic defense against DB-admin compromise.

Boundary checks: cookie sessions plus exact Origin on mutations; per-account queries on every evidence endpoint; strict upload filenames/hash/schema validation before writes; text-only rendering, CSP and download attachment headers. Normal invalid imports return file/field-specific errors; infrastructure/login errors do not echo credentials. Tests cover actual HTTP/DB/browser behavior. Public deployment, comprehensive identity operations, rate limiting, Redis, executor access, performance claims and new benchmark results remain out of scope.

[Evidence](../../evidence/web106/README.md) · [source navigation](SOURCE_OF_TRUTH.md).
