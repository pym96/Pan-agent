# #111 Builder evidence

[Current navigation](SOURCE_OF_TRUTH.md) · [design](../../design/pan-web/operations111.md) · [retained failures and decisions](learning-notes.md).

Criteria1.0 candidate, pending independent Regulator. Offline Go/PostgreSQL/installed Native Pan/Faux/real Docker only. No real Provider, benchmark or scoring calls; no main modification or fact promotion.

Private evidence/runtime root: `/Users/panyiming/.local/state/pan-agent/web111/`. Each test invocation has a separate evidence directory; failed probes and all task/attempt files remain. Handoff binds the complete candidate SHA and final inventory hash. Private checkpoints and local account configuration are not published here.

Reproduction: initialize a fresh empty directory with `apps/evidence-web/scripts/local-dev.py init --issue 111 --runtime <owned-runtime> --pg-bin /opt/homebrew/opt/postgresql@14/bin --port <unused-port> --db-port <unused-db-port>`. Build TypeScript with `npm ci --ignore-scripts`, `npm run check`, `npm run build`, `npm pack --ignore-scripts`; extract that independent package and put its dist at `<runtime-parent>/pan-source/dist`. Build the Web frontend with `npm ci --ignore-scripts` and `npm run build`. The helper builds Go and creates invited local accounts without printing credentials.

Set `WEB_TEST_ISSUE=111`, `WEB108_RUNTIME=<owned-runtime>`, `EVIDENCE_DIR=<fresh-directory>`, and `PAN_IMAGE=sha256:8129910271f9764b5c05038d351ad7b9f9d94b85351355b69c5526eadd111775`. Run the selected Python probes from `apps/evidence-web/scripts/` sequentially; they start/stop only their own API and single Worker. `check111.py`, `check111-negative.py`, `check111-boundaries.py`, `check111-stop-race.py`, `run-browser111.py` provide the new coverage. Existing #106–110 checks remain applicable with the owned namespace and operation mode disabled. Browser probes use the local Chrome binary. Cumulative resource gates remain active before every actual analysis tool.

Tests intentionally terminate owned Node PIDs, remove stopped owned containers, and mutate owned synthetic evidence for negative cases. Never point them at old runtimes or real user tasks. Keep prior evidence directories. Independent review must use its own clean worktree and runtime.

- [Builder report](report.md), [validation and identities](validation.json), [exact changed paths](changed-files.json), [scope/link verification](paths-verification.json).
