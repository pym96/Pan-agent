# Generated metadata projections

Reconstruct using [inventory.py](../inventory.py) and the [external-input lock](../input-lock.json). No gold content or raw task dataset is vendored.

- [pool.json](pool.json): every source task, eligibility/exposure reasons, official scoring options and file inventories.
- [proposal.json](proposal.json): frozen allocation/ranking and blocked status; selected list remains empty.
- [membership-counterexample.json](membership-counterexample.json): known-eligible-only versus unresolved-included diagnostic selections showing selection sensitivity; neither is execution-ready.
- [feasibility.json](feasibility.json): exact projected metadata and unresolved environment/scoring/license requirements for the union of diagnostic lists.
- [holdout-exposure.json](holdout-exposure.json): historical/current exposure, diagnostic exclusions and reserve-only status. No accepted holdout or pretraining-clean claim.
