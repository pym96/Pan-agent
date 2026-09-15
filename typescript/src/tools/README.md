# Tools

Tools implement AgentTool using Node APIs. #49 prospectively enforces operation-scoped authorization; Shell remains host-user authority, not a sandbox.

- [`authorized-file.ts`](authorized-file.ts): Criteria 1.1 final checks, non-following handles, exclusive creation and honest partial-effect records.

- [`pan-trusted-local-tools.ts`](pan-trusted-local-tools.ts): existing read/write/edit/bash implementations and factory.
