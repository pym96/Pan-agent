# Tool Activity digest | WorkOrder #61

Criteria-Version 1.0 candidate from accepted base `e5954e8a1c1fb6278b8ac6a640530e014079fba3`.

The TUI creates one `Tools · Activity` entry when the first tool starts in a run. It updates that one entry with running/settled/error counts and a safe latest label. `read`, `write`, and `edit` may show only a terminal-escaped basename; all other labels are their escaped canonical tool name. Raw arguments, results, IDs, full paths, hashes, bytes, and reasoning never enter the digest or activity overlay.

Transcript Enter opens `Tool activity · view only`: chronological safe name/label/status rows. Enter/Ctrl-G closes it. `:details` remains the explicit diagnostic route. Projection changes neither Runtime events nor Archive bytes.

The terminal-grid scrollbar and cached rendered-row layout remain unchanged; the digest is an ordinary TUI entry and is therefore included in their existing viewport rules.

Each digest retains its own display-only `ToolActivity`, so older run selections remain attributable. The activity summary has one clipped display row (plus its header); full safe labels remain available in the wrapping activity overlay. While the overlay is open its statuses update from the same observed events.

`:replay ID` reads the existing archive once and renders the retained tool starts/settlements in the replay overlay. Missing run boundaries, duplicate calls, orphan settlements, mismatched names or unfinished calls produce `Activity unavailable · inconsistent records`. Replay updates the existing diagnostic selection for subsequent `:details` without painting the old per-call diagnostic projection. Runtime, archive storage and diagnostic field-selection code are unchanged.

## Candidate reproduction and evidence

- `npm --prefix typescript run typecheck`; `node --experimental-strip-types --test typescript/test/tool-activity.test.ts typescript/test/scrollbar.test.ts typescript/test/scroll-layout.test.ts`.
- `python3 scripts/check_workorder_61_scope.py` verifies committed allowed paths and every protected baseline file.
- Build and pack from `typescript/`; install that tarball in a fresh consumer with `npm install --offline --omit=dev --ignore-scripts --no-audit --no-fund`.
- `python3 scripts/verify_activity_pty.py --node /absolute/node --package /absolute/consumer/node_modules/pan-agent --output /new/evidence/directory` exercises twelve calls (write/read/edit/bash), three errors, digest/overlay at 120×40 and 40×12, draft restoration, archive replay, unchanged archive hashes and zero guard meters.
- Raw PTY prefixes, reconstructed `.screen.txt`, instrumented `.state.json`, archive hashes, report and guard output are retained together. Faux exchanges and real local tool effects belong to the fixture run; view interactions add neither.

Human review remains required: readability, current/failure state, activity discoverability, return to conversation, scrollbar/wheel usability and final-answer visibility. Review the default/overlay capture for unambiguous escaped labels. Clipped summaries and terminal-cell scrolling are the declared presentation limits. No accepted fact or live Provider claim is made here.
