from __future__ import annotations

import unittest
from pathlib import Path

import workspace_agent_harness


class PackageIdentityTest(unittest.TestCase):
    def test_public_package_and_project_use_workspace_agent_name(self) -> None:
        root = Path(__file__).resolve().parents[1]
        pyproject = (root / "pyproject.toml").read_text(encoding="utf-8")
        self.assertIn('name = "workspace-agent-harness"', pyproject)
        self.assertFalse((root / "research_harness").exists())
        self.assertTrue(hasattr(workspace_agent_harness, "AgentLoop"))


if __name__ == "__main__":
    unittest.main()
