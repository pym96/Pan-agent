# #102 external archive commit and stopped-run successor

Candidate design, not production activation. The #97 segment3 result and consumption
remain valid source records even though receipt publication failed. No source is
rewritten, and a new runner cannot use the old activation.

## Receipt transaction

Task bytes, campaign metadata, journal prefix, activation and ledger prefix are
copied to a fresh immutable snapshot. Local and destination files are flushed and
hashed before publication. The receipt is written and fsynced inside a unique
`receipt.stage-UUID/` directory; that directory is flushed and renamed, on the same
filesystem, to `commit/`. The published path is `commit/receipt.json`. The parent
is then fsynced. No hard link is needed on this path. Internal campaign journal
publication still uses the existing internal-volume durable primitive.

A populated commit directory cannot be replaced by a concurrent directory rename
on the tested WD_BLACK or internal filesystem. Losers verify the winner instead
of overwriting it. Stage/snapshot leftovers are retained. Receipt presence alone
is insufficient: identity, complete declared file set, file hashes, local task
bytes, activation, append-only ledger prefix, and journal chain/checkpoint must
verify before `archived`. Filesystem-created `._` metadata sidecars may occur in
the destination; they do not replace or satisfy any declared file/hash. Unexpected
non-sidecar files reject. Missing/partial/corrupt committed data rejects and keeps
local originals; no automatic deletion or overwrite is performed. A legacy
`receipt.json` is readable, but simultaneous legacy and new commits reject.

The controller's existing per-campaign process lock serializes journal writes.
Publication is tested with two independent processes on the actual external
filesystem, plus crashes during copy, receipt write, before/after rename and
before journal confirmation. A process dying after publication can reverify and
append the missing archive event without executing the task again.

These are process-crash and API-level guarantees, including available fsync and
same-volume rename. They do not claim physical power-loss atomicity or storage
firmware durability. External mount absence or same-device replacement refuses
before writing snapshots; loss during writes leaves partial files and no success.
Write/space failures propagate. Trusted local filesystem access is assumed, not
hostile concurrent replacement of mount paths by another privileged process.

## Explicit predecessor import

`upgrade97 --source OLD_COPY --campaign NEW --layout LAYOUT` accepts only the
pinned #97 stopped state: exact source inventory, original metadata and journal,
three run ledgers, 57 imported reservations plus mcmc-sampling-stan. The old
campaign root and identity are validated as an archived source. Only the top-level
process lock and OS `._` metadata are outside the pin; nested historical locks are
retained because the prior recovery proof references their bytes.

The successor uses a new UUID, current runner identity and current policy/layout.
It retains `predecessor-original/` byte copies and copies task/accounting originals
into its own segments. Its new import event says what happened now; it never
reconstructs or edits the predecessor's events. All58 reservations and all20 old
unknown scores remain. Source ledger/hash changes block import/continuation.
The source is intentionally narrow; an independently authorized different failure
state requires a new reviewed importer/pin, not a user-supplied trust override.

The successor initially cannot prepare or bind. `recover` performs read-only
current-stop observation, archives the imported outstanding task under the **new
campaign's external archive namespace**, records the observation, then appends
`predecessor_reconciled`. This closes the predecessor obligation for the successor;
the original pending journal and failed external receipt remain untouched. The
new event is not a forged `segment_closed` in the old run. Further calls are
idempotent. Old run IDs and all consumed task IDs stay inadmissible.

## Production steps after independent acceptance and new Master workorder only

1. Preserve the stopped runner/campaign, failed external pending files and all12
   global ledgers. Check source inventory against `SOURCE_INVENTORY` in
   `full-upgrade-102.mjs`; do not modify JSON to make it match.
2. Create a clean persistent checkout of the exact accepted new SHA. Construct a
   new persistent layout, with that runner and unchanged verified #94 package,
   Python/Harbor/task sources; count all actual paths and preserve original Docker
   baseline48503971840, free>=20GiB and strict cumulative<54GiB. Create a new real
   external archive root. Reuse no preexisting successor destination.
3. Run the new CLI `upgrade97 --source OLD --layout NEW_LAYOUT --campaign NEW_ROOT`.
   It creates only the successor. Verify58 consumed/31 unstarted,17 historical
   successes/22 valid-scored rows and20 second-segment unknowns.
4. Run `recover --campaign NEW_ROOT`; this does not launch containers/models. It
   refuses unknown current stop, unavailable archives or invalid receipts. Require
   predecessor_reconciled and no pending archives before continuing. Do not remove
   partial directories on failure or run the old activation.
5. Prepare eligible unstarted tasks, obtain `status --campaign NEW_ROOT --task IDS`
   and submit the complete new binding to Master. Only a later new signed run ID
   authorizes execution. Neither this repair nor its synthetic demo grants that.

Master/Regulator retain result-classification responsibility; no score or external
claim is promoted by this implementation.
