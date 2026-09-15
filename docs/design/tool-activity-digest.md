# Tool Activity digest | WorkOrder #61

Criteria-Version 1.0 candidate from accepted base `e5954e8a1c1fb6278b8ac6a640530e014079fba3`.

The TUI creates one `Tools · Activity` entry when the first tool starts in a run. It updates that one entry with running/settled/error counts and a safe latest label. `read`, `write`, and `edit` may show only a terminal-escaped basename; all other labels are their escaped canonical tool name. Raw arguments, results, IDs, full paths, hashes, bytes, and reasoning never enter the digest or activity overlay.

Transcript Enter opens `Tool activity · view only`: chronological safe name/label/status rows. Enter/Ctrl-G closes it. `:details` remains the explicit diagnostic route. Projection changes neither Runtime events nor Archive bytes.

The terminal-grid scrollbar and cached rendered-row layout remain unchanged; the digest is an ordinary TUI entry and is therefore included in their existing viewport rules.
