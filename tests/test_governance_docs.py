"""WorkOrder #26 governance-documentation contract anchors.

These are deliberately plain text-anchor checks — not a Criteria parser —
that keep the canonical verification governance, the issue/WorkOrder
conventions, and the project Agent map from contradicting each other.
"""

from __future__ import annotations

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VERIFICATION = (REPO_ROOT / "docs" / "governance" / "verification.md").read_text(
    encoding="utf-8"
)
ISSUE_TRACKER = (REPO_ROOT / "docs" / "agents" / "issue-tracker.md").read_text(
    encoding="utf-8"
)
AGENT_MAP = (REPO_ROOT / "AGENTS.md").read_text(encoding="utf-8")
GLOSSARY = (REPO_ROOT / "CONTEXT.md").read_text(encoding="utf-8")


class MemoryLaneGlossaryTest(unittest.TestCase):
    """C-MEM-10: the three memory lanes keep ownership, mutability, and
    non-equivalence anchors in the project glossary."""

    def _entry(self, name: str) -> str:
        marker = f"**{name}**:"
        self.assertIn(marker, GLOSSARY)
        start = GLOSSARY.index(marker)
        following = GLOSSARY.find("\n**", start + len(marker))
        section = GLOSSARY.find("\n## ", start + len(marker))
        end_candidates = [index for index in (following, section) if index != -1]
        end = min(end_candidates) if end_candidates else len(GLOSSARY)
        return GLOSSARY[start:end]

    def test_run_archive_entry(self) -> None:
        entry = self._entry("Run Archive")
        self.assertIn("session runtime", entry)  # ownership
        self.assertIn("append-only", entry)  # mutability rule
        self.assertIn("sealed", entry)
        for non_equivalent in ("Retrospective Ledger", "Runbook"):
            self.assertIn(f"{non_equivalent} synonym", entry)

    def test_retrospective_ledger_entry(self) -> None:
        entry = self._entry("Retrospective Ledger")
        self.assertIn("operator review process", entry)  # ownership
        self.assertIn("append-only", entry)  # mutability rule
        self.assertIn("supersedes", entry)
        for non_equivalent in ("Run Archive", "Runbook"):
            self.assertIn(f"{non_equivalent} synonym", entry)

    def test_runbook_entry(self) -> None:
        entry = self._entry("Runbook")
        self.assertIn("Human operator", entry)  # ownership
        self.assertIn("mutable", entry)  # mutability rule
        self.assertIn("revision", entry)
        for non_equivalent in ("Run Archive synonym", "Retrospective Ledger synonym"):
            self.assertIn(non_equivalent, entry)


class VerificationGovernanceCriteriaContractTest(unittest.TestCase):
    def test_blocking_criterion_shape_is_required(self) -> None:
        for anchor in (
            "Criterion ID",
            "Criteria-Version",
            "GateLevel",
            "Given / Observe / Pass iff / Fail when",
            "ready-for-agent",
            "oracle type",
        ):
            self.assertIn(anchor, VERIFICATION)
        self.assertIn("non-blocking", VERIFICATION)

    def test_oracle_types_are_enumerated(self) -> None:
        for oracle in (
            "Deterministic invariant/test",
            "Measurement",
            "Protocolized Human observation",
            "External contract",
        ):
            self.assertIn(oracle, VERIFICATION)

    def test_open_domains_require_invariants_over_examples(self) -> None:
        self.assertIn("domain-level invariant", VERIFICATION)
        self.assertIn("minimum probe coverage", VERIFICATION)
        self.assertIn("enumerate", VERIFICATION)

    def test_measurement_and_stochastic_fields_are_complete(self) -> None:
        for field in (
            "metric",
            "denominator",
            "window",
            "unit",
            "precision",
            "missing-data behavior",
            "threshold provenance",
            "frozen sample",
            "repetitions",
            "uncertainty treatment",
            "stop rule",
        ):
            self.assertIn(field, VERIFICATION)
        # A single live smoke stays limited to the retained Run.
        self.assertIn("single live smoke", VERIFICATION)

    def test_human_judgment_is_protocolized(self) -> None:
        for field in (
            "observer",
            "stimulus/task",
            "visible Evidence",
            "response scale or pass condition",
            "retained decision record",
        ):
            self.assertIn(field, VERIFICATION)

    def test_result_and_rejection_vocabulary(self) -> None:
        self.assertIn("PASS | FAIL | NOT_EVALUABLE", VERIFICATION)
        self.assertIn("criterion_failed", VERIFICATION)
        self.assertIn("evidence_incomplete", VERIFICATION)
        for field in (
            "Criterion ID",
            "probe input",
            "observed value",
            "expected predicate",
            "Evidence locator",
        ):
            self.assertIn(field, VERIFICATION)
        self.assertIn("ScopeChallenge", VERIFICATION)
        # Known global high-risk invariants apply even when omitted.
        self.assertIn("omits", VERIFICATION)

    def test_freeze_amendment_and_repair_semantics(self) -> None:
        self.assertIn("append-only", VERIFICATION)
        self.assertIn("never reopened", VERIFICATION)
        self.assertIn("never transfers", VERIFICATION)
        self.assertIn("impact analysis", VERIFICATION)

    def test_verification_depth_and_manual_lint(self) -> None:
        self.assertIn("exploratory | standard | high-risk", VERIFICATION)
        self.assertIn("Criteria Lint v1", VERIFICATION)
        self.assertIn("manual", VERIFICATION)


class IssueTrackerCriteriaContractTest(unittest.TestCase):
    def test_promotion_requires_frozen_criteria_and_manual_lint(self) -> None:
        self.assertIn("ready-for-agent", ISSUE_TRACKER)
        self.assertIn("Criteria Lint v1", ISSUE_TRACKER)
        self.assertIn("Given / Observe / Pass iff / Fail when", ISSUE_TRACKER)
        self.assertIn("oracle type", ISSUE_TRACKER)
        self.assertIn("non-blocking", ISSUE_TRACKER)

    def test_handoff_and_verdict_name_criteria_version(self) -> None:
        self.assertGreaterEqual(ISSUE_TRACKER.count("Criteria-Version"), 3)
        self.assertIn("criterion_failed", ISSUE_TRACKER)
        self.assertIn("evidence_incomplete", ISSUE_TRACKER)

    def test_issue_tracker_defers_to_canonical_verification_governance(self) -> None:
        self.assertIn("../governance/verification.md", ISSUE_TRACKER)
        self.assertIn("operational contract", ISSUE_TRACKER)


class GovernanceDocumentsConsistencyTest(unittest.TestCase):
    def test_verification_governance_names_the_lint_and_links_tracker(self) -> None:
        self.assertIn("../agents/issue-tracker.md", VERIFICATION)

    def test_agent_map_remains_a_router(self) -> None:
        # C-GOV-07: detailed contract prose must not move into AGENTS.md.
        for forbidden in (
            "Given / Observe / Pass iff / Fail when",
            "oracle type",
            "Criteria Lint",
            "domain-level invariant",
            "threshold provenance",
        ):
            self.assertNotIn(forbidden, AGENT_MAP)


if __name__ == "__main__":
    unittest.main()
