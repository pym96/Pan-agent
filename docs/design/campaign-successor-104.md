# #104: fixed stopped campaign successor

Criteria1.0 Product runner candidate. This entry is preparation infrastructure,
not a production migration or permission to run #97. The #103 product is unchanged.

`successor97 --source SOURCE --layout LAYOUT --campaign NEW` only accepts the
963-file sourceInventory fingerprint
`b3b9248ae10a3f8da677b044c6c4d02ce46bcf72c93fbea2c9934f58c0850c30`.
The original root, campaign, old runner/product, closed journal and completed
archive obligations are also checked through real Store and the historical importer.
The source must not overlap the destination. Source reads are repeated around the
copy; symlinks/special files or drift fail closed. No historical metadata is edited.

The new identity copies all frozen fields and changes only runnerSha (the invoking
runner's actual HEAD) and panHash (#103 accepted package). New campaign UUID,
location/layout and explicit provenance are forward-looking. Resource baseline is
copied exactly. Source history, including nested predecessors, lives byte-for-byte
in `successor-original/`; historical segment files are independently copied for
accounting. Imported consumed records derive from the verified source, never a
handwritten count. Fifteen historical run IDs, including consumed permits without
tasks, remain in the reuse-denial set. Score nulls, errors and unknown usage stay as-is.

Exclusive mkdir claims a destination; migration writes its completion marker only
after source verification, full copies, resource check and flush. An interrupted
migration is not reopened as an empty campaign: keep it and use a new destination.
A completed successor is never overwritten or imported twice.

After migration, `recover` first observes current stop state for all62 imported
reservations through the existing scoped host inspector. It archives the entire
pinned predecessor snapshot into the new external namespace, flushes it, and uses
the existing directory-based receipt publication. Only then is successor_reconciled
appended. An archive failure preserves partial snapshots; retrying recover can
publish a fresh snapshot, or verify an already committed receipt after a crash.
Every reopen verifies the committed archive when reconciliation is recorded.
Live mode requires the archive on a different actual filesystem, not just a path
that looks external. Missing/corrupt receipt or data is blocking.

Old preparation observations remain raw history, never new readiness. Prepare and
status recheck task configuration/cache through the unchanged host interfaces.
Binding only consults the successor's own preparation events; all consumed tasks
are excluded, missing images remain not_started. The imported stop checks are
repeated for every readiness/binding/run attempt. Package files and frozen runtime
dependencies are revalidated on reopen, before producing a binding.

## Historical package compatibility

The pre-#103 recovery ledgers are immutable and tied to the #94 package. Validating
them against whichever package happens to be current would reject genuine history.
`RECOVERY_PACKAGE` pins that historical hash in the existing already-pinned ledger
parser. #102 upgrade still changes runner only, retains its source/hash/old product,
and uses that old product identity on reopen. Run now explicitly compares verified
product hash with campaign panHash before credentials: a new package cannot be
silently substituted in a legacy successor. The legacy offline test declares its
synthetic old-package verifier; #104 tests use the actual installed #103 product.
The old #102 pin and import semantics are not replaced by the new source pin.

## Operational boundary

See [deployment runbook](campaign-successor-104-runbook.md). Independent acceptance,
Master's production-preparation assignment, and a new signed activation are separate.
The command has no permission to extend budgets, clear consumption or run tasks.
The existing #103 session confirmations, scoring/archive gates and official timeouts
remain unchanged. No core cancellation code or package identity is modified here.
