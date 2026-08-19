"""Concrete seed Domain Packs used to prove the accepted Runtime seam."""

from __future__ import annotations

import ast
import csv
import io
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from . import (
    AgentProjection,
    AuthorityGrant,
    AuthorityRequest,
    BenchmarkCase,
    CaseEligibility,
    CapabilityGrant,
    CapabilityRequirement,
    ControlProjection,
    DomainRunSpec,
    EvaluationEvidence,
    EvaluationVerdict,
    EvaluatorIdentity,
    LocalFixtureWorkspace,
    LocalWorkspaceWriteTool,
    PackManifest,
    PackSelector,
    ProtectedFixtureRef,
    RunLimitOverrides,
    RunRequest,
    SuiteManifest,
    SuiteSelector,
    Tool,
    benchmark_cases_hash,
    benchmark_source_hash,
    benchmark_transform_hash,
    pack_content_hash,
    suite_content_hash,
)


DATA_TASK_ID = "paid-revenue-by-region-v1"
DATA_FIXTURE_ID = "data-analysis-orders-v1"
DATA_ORDERS = """order_id,region,quantity,unit_price,status
o1,east,2,10.00,paid
o2,west,1,5.50,refunded
o3,east,3,7.00,paid
o4,north,0,99.00,paid
o5,west,4,2.50,paid
"""
DATA_EXPECTED = """region,order_count,revenue
east,2,41.00
west,1,10.00
"""

CODING_TASK_ID = "repair-slugify-v1"
CODING_FIXTURE_ID = "workspace-coding-slugify-v1"
CODING_BROKEN = """def slugify(text: str) -> str:
    return text.lower().replace(" ", "-")
"""
CODING_FIXED = """import re
import unicodedata


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_text.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return slug or "untitled"
"""
CODING_PUBLIC_TEST = """import unittest

from src.slugify import slugify


class SlugifyTest(unittest.TestCase):
    def test_words(self) -> None:
        self.assertEqual("hello-world", slugify("Hello World"))
"""


def _digest(*parts: str) -> str:
    import hashlib

    payload = "\0".join(parts).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def _requirements(*items: CapabilityRequirement) -> AuthorityRequest:
    return AuthorityRequest(tuple(items))


DATA_AGGREGATE = CapabilityRequirement(
    capability_id="table.aggregate",
    required=True,
    resources=("workspace:inputs/orders.csv",),
)
DATA_WRITE = CapabilityRequirement(
    capability_id="workspace.write-output",
    required=True,
    resources=("workspace:outputs/region_summary.csv",),
)
DATA_READ = CapabilityRequirement(
    capability_id="table.read",
    required=False,
    resources=("workspace:inputs/orders.csv",),
)
DATA_INSPECT = CapabilityRequirement(
    capability_id="table.inspect",
    required=False,
    resources=("workspace:inputs/orders.csv",),
)

CODING_READ = CapabilityRequirement(
    capability_id="workspace.read",
    required=True,
    resources=("workspace:src/slugify.py",),
)
CODING_PATCH = CapabilityRequirement(
    capability_id="workspace.patch",
    required=True,
    resources=("workspace:src/slugify.py",),
)
CODING_SEARCH = CapabilityRequirement(
    capability_id="workspace.search",
    required=False,
    resources=("workspace:src/**",),
)
CODING_TEST = CapabilityRequirement(
    capability_id="test.run-declared",
    required=False,
    resources=("command:python-unittest",),
)


class PaidRevenueAggregateTool:
    name = "table.aggregate"

    def identity_material(self) -> object:
        return {"adapter": "paid-revenue-aggregate", "version": "1"}

    def execute(self, arguments: dict[str, object]) -> str:
        source = arguments.get("_resolved_path")
        if not isinstance(source, Path):
            raise ValueError("Runtime did not resolve the table resource")
        rows = _paid_revenue_rows(source.read_text(encoding="utf-8"))
        return json.dumps({"rows": rows}, sort_keys=True)


class LocalWorkspaceReadTool:
    name = "workspace.read"

    def identity_material(self) -> object:
        return {"adapter": "local-workspace-read", "max_bytes": 64 * 1024}

    def execute(self, arguments: dict[str, object]) -> str:
        source = arguments.get("_resolved_path")
        if not isinstance(source, Path):
            raise ValueError("Runtime did not resolve the read resource")
        content = source.read_bytes()
        if len(content) > 64 * 1024:
            raise ValueError("workspace read exceeded the byte limit")
        return content.decode("utf-8")


class ScriptedProofModel:
    """One deterministic Model Adapter used only for the seed integration proof."""

    def identity_material(self) -> object:
        return {
            "adapter": "scripted-seed-proof-model",
            "version": "1",
            "data_expected": DATA_EXPECTED,
            "coding_fixed": CODING_FIXED,
        }

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        task = json.loads(str(context[0]["content"]))
        goal = str(task["goal"])
        tool_events = [item for item in context if item.get("role") == "tool"]
        if "data-analysis" in goal:
            return self._data_response(tool_events)
        if "workspace-coding" in goal:
            return self._coding_response(tool_events)
        raise ValueError("unknown proof-domain goal")

    @staticmethod
    def _data_response(tool_events: list[dict[str, object]]) -> str:
        if not tool_events:
            return json.dumps(
                {
                    "type": "tool",
                    "tool": "table.aggregate",
                    "arguments": {"resource": "workspace:inputs/orders.csv"},
                }
            )
        if tool_events[-1].get("name") == "table.aggregate":
            aggregate = json.loads(str(tool_events[-1]["content"]))
            output = io.StringIO(newline="")
            writer = csv.writer(output, lineterminator="\n")
            writer.writerow(("region", "order_count", "revenue"))
            for row in aggregate["rows"]:
                writer.writerow((row["region"], row["order_count"], row["revenue"]))
            return json.dumps(
                {
                    "type": "tool",
                    "tool": "workspace.write-output",
                    "arguments": {
                        "resource": "workspace:outputs/region_summary.csv",
                        "content": output.getvalue(),
                    },
                }
            )
        return json.dumps({"type": "final", "output": "data-analysis complete"})

    @staticmethod
    def _coding_response(tool_events: list[dict[str, object]]) -> str:
        if not tool_events:
            return json.dumps(
                {
                    "type": "tool",
                    "tool": "workspace.read",
                    "arguments": {"resource": "workspace:src/slugify.py"},
                }
            )
        if tool_events[-1].get("name") == "workspace.read":
            return json.dumps(
                {
                    "type": "tool",
                    "tool": "workspace.patch",
                    "arguments": {
                        "resource": "workspace:src/slugify.py",
                        "content": CODING_FIXED,
                    },
                }
            )
        return json.dumps({"type": "final", "output": "workspace-coding complete"})


class DataAnalysisSeedPack:
    def __init__(self, fixture: ProtectedFixtureRef) -> None:
        self._fixture = fixture
        selector = PackSelector(
            "data-analysis",
            "1.0.0",
            pack_content_hash(type(self), self.content_material()),
        )
        evaluator = EvaluatorIdentity(
            "data-analysis-seed-evaluator",
            "1.0.0",
            selector.content_hash,
        )
        requirements = (DATA_READ, DATA_INSPECT, DATA_AGGREGATE, DATA_WRITE)
        self.manifest = PackManifest(
            interface_version=1,
            identity=selector,
            task_schema={"type": "object", "required": ["task_id"]},
            required_runtime_features=frozenset(),
            guidance_resources=(),
            requested_capabilities=requirements,
            authority_ceiling=AuthorityRequest(requirements),
            fixture_resources=(),
            evaluator=evaluator,
        )

    def content_material(self) -> object:
        return {
            "interface_version": 1,
            "pack_id": "data-analysis",
            "version": "1.0.0",
            "task_schema": {"type": "object", "required": ["task_id"]},
            "requirements": (DATA_READ, DATA_INSPECT, DATA_AGGREGATE, DATA_WRITE),
            "fixture": self._fixture,
            "fixture_content": DATA_ORDERS,
            "expected_output": DATA_EXPECTED,
            "evaluator_version": "1.0.0",
        }

    def compile_task(self, raw_task: object) -> DomainRunSpec:
        if not isinstance(raw_task, dict) or raw_task.get("task_id") != DATA_TASK_ID:
            raise ValueError("unknown data-analysis seed task")
        active = (DATA_AGGREGATE, DATA_WRITE)
        return DomainRunSpec(
            task_id=DATA_TASK_ID,
            normalized_task={"task_id": DATA_TASK_ID},
            agent=AgentProjection(
                goal="execute data-analysis seed with exact decimal aggregation",
                guidance=(
                    "Aggregate only valid paid rows and write the exact CSV schema.",
                ),
                requested_capabilities=tuple(item.capability_id for item in active),
                visible_inputs=("workspace:inputs/orders.csv",),
                expected_artifacts=("workspace:outputs/region_summary.csv",),
            ),
            control=ControlProjection(
                fixture=self._fixture,
                evaluator=self.manifest.evaluator,
                protected_checks=("exact-csv",),
            ),
            authority_request=_requirements(*active),
            limit_defaults=None,
        )

    def evaluate(self, evidence: EvaluationEvidence) -> EvaluationVerdict:
        root = evidence.final_artifacts.path
        if root is None:
            raise ValueError("data-analysis evaluation requires a frozen artifact")
        files = {
            path.relative_to(root).as_posix()
            for path in root.rglob("*")
            if path.is_file()
        }
        input_path = root / "inputs" / "orders.csv"
        output_path = root / "outputs" / "region_summary.csv"
        checks = {
            "write_set": files
            == {"inputs/orders.csv", "outputs/region_summary.csv"},
            "input_immutable": input_path.is_file()
            and input_path.read_text(encoding="utf-8") == DATA_ORDERS,
            "output_present": output_path.is_file(),
            "output_exact": output_path.is_file()
            and output_path.read_text(encoding="utf-8")
            == _render_paid_revenue(DATA_ORDERS),
        }
        return EvaluationVerdict(
            passed=all(checks.values()),
            checks=tuple(
                {"check": name, "passed": passed}
                for name, passed in checks.items()
            ),
            measurements={"regions": 2, "expected_rows": 3},
        )


class WorkspaceCodingSeedPack:
    def __init__(
        self,
        fixture: ProtectedFixtureRef,
        fixture_files: Mapping[str, str],
    ) -> None:
        self._fixture = fixture
        self._fixture_files = MappingProxyType(dict(fixture_files))
        selector = PackSelector(
            "workspace-coding",
            "1.0.0",
            pack_content_hash(type(self), self.content_material()),
        )
        evaluator = EvaluatorIdentity(
            "workspace-coding-seed-evaluator",
            "1.0.0",
            selector.content_hash,
        )
        requirements = (CODING_READ, CODING_SEARCH, CODING_PATCH, CODING_TEST)
        self.manifest = PackManifest(
            interface_version=1,
            identity=selector,
            task_schema={"type": "object", "required": ["task_id"]},
            required_runtime_features=frozenset(),
            guidance_resources=(),
            requested_capabilities=requirements,
            authority_ceiling=AuthorityRequest(requirements),
            fixture_resources=(),
            evaluator=evaluator,
        )

    def content_material(self) -> object:
        return {
            "interface_version": 1,
            "pack_id": "workspace-coding",
            "version": "1.0.0",
            "task_schema": {"type": "object", "required": ["task_id"]},
            "requirements": (CODING_READ, CODING_SEARCH, CODING_PATCH, CODING_TEST),
            "fixture": self._fixture,
            "fixture_files": self._fixture_files,
            "hidden_cases": _SLUG_CASES,
            "allowed_calls": tuple(sorted(_ALLOWED_CALL_ATTRIBUTES)),
            "evaluator_version": "1.0.0",
        }

    def compile_task(self, raw_task: object) -> DomainRunSpec:
        if not isinstance(raw_task, dict) or raw_task.get("task_id") != CODING_TASK_ID:
            raise ValueError("unknown workspace-coding seed task")
        active = (CODING_READ, CODING_PATCH)
        return DomainRunSpec(
            task_id=CODING_TASK_ID,
            normalized_task={"task_id": CODING_TASK_ID},
            agent=AgentProjection(
                goal="execute workspace-coding seed and repair slugify",
                guidance=("Only src/slugify.py may change.",),
                requested_capabilities=tuple(item.capability_id for item in active),
                visible_inputs=("workspace:src/slugify.py", "workspace:tests/test_slugify.py"),
                expected_artifacts=("workspace:src/slugify.py",),
            ),
            control=ControlProjection(
                fixture=self._fixture,
                evaluator=self.manifest.evaluator,
                protected_checks=("safe-ast", "public-tests", "hidden-cases"),
            ),
            authority_request=_requirements(*active),
            limit_defaults=None,
        )

    def evaluate(self, evidence: EvaluationEvidence) -> EvaluationVerdict:
        root = evidence.final_artifacts.path
        if root is None:
            raise ValueError("workspace-coding evaluation requires a frozen artifact")
        actual_files = {
            path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
            for path in root.rglob("*")
            if path.is_file()
        }
        source = actual_files.get("src/slugify.py")
        checks: dict[str, bool] = {
            "write_set": set(actual_files) == set(self._fixture_files),
            "non_target_immutable": all(
                actual_files.get(path) == content
                for path, content in self._fixture_files.items()
                if path != "src/slugify.py"
            ),
            "source_changed": source is not None and source != CODING_BROKEN,
            "safe_ast": False,
            "public_tests": False,
            "hidden_cases": False,
        }
        execution_evidence: dict[str, object] = {
            "exit_status": None,
            "stdout": "",
            "stderr": "",
            "public_test_output": "",
            "candidate_stdout": "",
            "candidate_stderr": "",
        }
        if source is not None:
            try:
                _audit_slugify_source(source)
                checks["safe_ast"] = True
                execution_evidence = _run_slugify_evaluation(
                    root / "src" / "slugify.py",
                    root / "tests" / "test_slugify.py",
                )
                checks["public_tests"] = bool(
                    execution_evidence.get("public_tests_passed", False)
                )
                checks["hidden_cases"] = bool(
                    execution_evidence.get("hidden_cases_passed", False)
                )
            except (SyntaxError, ValueError, subprocess.SubprocessError):
                pass
        return EvaluationVerdict(
            passed=all(checks.values()),
            checks=tuple(
                {"check": name, "passed": passed}
                for name, passed in checks.items()
            ),
            measurements={
                "hidden_cases": len(_SLUG_CASES),
                **execution_evidence,
            },
        )


@dataclass(frozen=True)
class SeedProofCase:
    pack: PackSelector
    task: Mapping[str, str]


@dataclass(frozen=True)
class SeedProofBundle:
    packs: tuple[DataAnalysisSeedPack, WorkspaceCodingSeedPack]
    cases: tuple[SeedProofCase, SeedProofCase]
    authority: AuthorityGrant
    capabilities: Mapping[str, Tool]
    workspace: LocalFixtureWorkspace


class SeedVerticalSmokeSuite:
    def __init__(
        self,
        manifest: SuiteManifest,
        cases: tuple[BenchmarkCase, ...],
        source: object,
    ) -> None:
        self.manifest = manifest
        self._cases = cases
        self._source = source

    def cases(self) -> tuple[BenchmarkCase, ...]:
        return self._cases

    def source_material(self) -> object:
        return self._source


def build_seed_proof_bundle() -> SeedProofBundle:
    coding_files = {
        "src/slugify.py": CODING_BROKEN,
        "tests/test_slugify.py": CODING_PUBLIC_TEST,
        "README.md": "# Slugify seed fixture\n",
    }
    workspace = LocalFixtureWorkspace(
        {
            DATA_FIXTURE_ID: {"inputs/orders.csv": DATA_ORDERS},
            CODING_FIXTURE_ID: coding_files,
        }
    )
    data_pack = DataAnalysisSeedPack(workspace.fixture_ref(DATA_FIXTURE_ID))
    coding_pack = WorkspaceCodingSeedPack(
        workspace.fixture_ref(CODING_FIXTURE_ID), coding_files
    )
    authority = AuthorityGrant(
        (
            CapabilityGrant("table.aggregate", ("workspace:inputs/orders.csv",)),
            CapabilityGrant(
                "workspace.write-output",
                ("workspace:outputs/region_summary.csv",),
            ),
            CapabilityGrant("workspace.read", ("workspace:src/slugify.py",)),
            CapabilityGrant("workspace.patch", ("workspace:src/slugify.py",)),
        )
    )
    capability_values: dict[str, Tool] = {
        "table.aggregate": PaidRevenueAggregateTool(),
        "workspace.write-output": LocalWorkspaceWriteTool(
            "workspace.write-output"
        ),
        "workspace.read": LocalWorkspaceReadTool(),
        "workspace.patch": LocalWorkspaceWriteTool("workspace.patch"),
    }
    capabilities = MappingProxyType(capability_values)
    return SeedProofBundle(
        packs=(data_pack, coding_pack),
        cases=(
            SeedProofCase(data_pack.manifest.identity, {"task_id": DATA_TASK_ID}),
            SeedProofCase(coding_pack.manifest.identity, {"task_id": CODING_TASK_ID}),
        ),
        authority=authority,
        capabilities=capabilities,
        workspace=workspace,
    )


def build_seed_smoke_suite(bundle: SeedProofBundle) -> SeedVerticalSmokeSuite:
    cases = tuple(
        BenchmarkCase(
            case_id=str(case.task["task_id"]),
            source_case_id="local:" + str(case.task["task_id"]),
            request=RunRequest(
                pack=case.pack,
                task=case.task,
                authority=bundle.authority,
                limits=RunLimitOverrides(),
            ),
            eligibility=CaseEligibility.ELIGIBLE,
        )
        for case in bundle.cases
    )
    source = {
        "source_id": "accepted-proof-domain-seeds",
        "revision": "v1",
        "task_ids": (DATA_TASK_ID, CODING_TASK_ID),
        "fixture_hashes": (
            bundle.packs[0]._fixture.content_hash,
            bundle.packs[1]._fixture.content_hash,
        ),
    }
    transform_descriptor = {
        "transform_id": "identity-to-run-request",
        "version": "1",
    }
    source_digest = benchmark_source_hash(source)
    cases_digest = benchmark_cases_hash(cases)
    transform_digest = benchmark_transform_hash(transform_descriptor)
    required_packs = tuple(case.pack for case in bundle.cases)
    selector = SuiteSelector(
        "vertical-seed-smoke",
        "0.1.0",
        suite_content_hash(
            suite_id="vertical-seed-smoke",
            version="0.1.0",
            lane="vertical-development-smoke",
            source_revision="local:accepted-proof-domain-seeds-v1",
            source_digest=source_digest,
            cases_hash=cases_digest,
            transform_hash=transform_digest,
            metric_schema_version=1,
            required_packs=required_packs,
        ),
    )
    manifest = SuiteManifest(
        identity=selector,
        lane="vertical-development-smoke",
        source_revision="local:accepted-proof-domain-seeds-v1",
        source_digest=source_digest,
        cases_hash=cases_digest,
        transform_descriptor=transform_descriptor,
        transform_hash=transform_digest,
        metric_schema_version=1,
        required_packs=required_packs,
    )
    return SeedVerticalSmokeSuite(manifest, cases, source)


def _paid_revenue_rows(csv_text: str) -> list[dict[str, object]]:
    groups: dict[str, tuple[int, Decimal]] = {}
    for row in csv.DictReader(io.StringIO(csv_text)):
        if row.get("status") != "paid":
            continue
        try:
            quantity = int(row["quantity"])
            unit_price = Decimal(row["unit_price"])
        except (KeyError, ValueError, InvalidOperation):
            continue
        if quantity <= 0 or unit_price < 0:
            continue
        count, revenue = groups.get(row["region"], (0, Decimal("0")))
        groups[row["region"]] = (count + 1, revenue + quantity * unit_price)
    return [
        {
            "region": region,
            "order_count": count,
            "revenue": format(revenue, ".2f"),
        }
        for region, (count, revenue) in sorted(groups.items())
    ]


def _render_paid_revenue(csv_text: str) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(("region", "order_count", "revenue"))
    for row in _paid_revenue_rows(csv_text):
        writer.writerow((row["region"], row["order_count"], row["revenue"]))
    return output.getvalue()


_FORBIDDEN_AST = (
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.Delete,
    ast.For,
    ast.Global,
    ast.Lambda,
    ast.Nonlocal,
    ast.Raise,
    ast.Try,
    ast.While,
    ast.With,
    ast.Yield,
    ast.YieldFrom,
)
_ALLOWED_CALL_ATTRIBUTES = {
    "decode",
    "encode",
    "lower",
    "normalize",
    "strip",
    "sub",
}


def _audit_slugify_source(source: str) -> None:
    tree = ast.parse(source)
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
    if len(functions) != 1 or functions[0].name != "slugify":
        raise ValueError("source must define exactly one slugify function")
    if functions[0].decorator_list:
        raise ValueError("slugify decorators are not allowed")
    for node in tree.body:
        if isinstance(node, ast.Import):
            if any(alias.name not in {"re", "unicodedata"} for alias in node.names):
                raise ValueError("only re and unicodedata imports are allowed")
        elif not isinstance(node, ast.FunctionDef):
            raise ValueError("top-level executable statements are not allowed")
    for walked in ast.walk(tree):
        if isinstance(walked, _FORBIDDEN_AST):
            raise ValueError(f"forbidden syntax: {type(walked).__name__}")
        if isinstance(walked, (ast.Import, ast.ImportFrom)) and walked not in tree.body:
            raise ValueError("imports inside slugify are not allowed")
        if isinstance(walked, ast.Attribute) and walked.attr.startswith("_"):
            raise ValueError("private or dunder attributes are not allowed")
        if isinstance(walked, ast.Call):
            if not isinstance(walked.func, ast.Attribute):
                raise ValueError("direct builtin or dynamic calls are not allowed")
            if walked.func.attr not in _ALLOWED_CALL_ATTRIBUTES:
                raise ValueError(f"call is not allowed: {walked.func.attr}")


_SLUG_CASES = (
    ("Hello World", "hello-world"),
    ("  repeated---separators__here  ", "repeated-separators-here"),
    ("Café Déjà Vu", "cafe-deja-vu"),
    ("!!!", "untitled"),
    ("MiXeD Case", "mixed-case"),
    ("", "untitled"),
)


def _run_slugify_evaluation(
    source_path: Path,
    public_test_path: Path,
) -> dict[str, object]:
    runner = """import contextlib
import importlib.util
import io
import json
import sys
import types
import unittest

captured_stdout = io.StringIO()
captured_stderr = io.StringIO()
with contextlib.redirect_stdout(captured_stdout), contextlib.redirect_stderr(captured_stderr):
    package = types.ModuleType("src")
    package.__path__ = []
    sys.modules["src"] = package
    spec = importlib.util.spec_from_file_location("src.slugify", sys.argv[1])
    module = importlib.util.module_from_spec(spec)
    sys.modules["src.slugify"] = module
    spec.loader.exec_module(module)

    test_spec = importlib.util.spec_from_file_location("public_slugify_tests", sys.argv[2])
    test_module = importlib.util.module_from_spec(test_spec)
    test_spec.loader.exec_module(test_module)
    public_stream = io.StringIO()
    public_result = unittest.TextTestRunner(stream=public_stream, verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromModule(test_module)
    )
    cases = json.loads(sys.stdin.read())
    hidden_actual = [module.slugify(value) for value, _ in cases]

print(json.dumps({
    "public_tests_passed": public_result.wasSuccessful(),
    "public_test_output": public_stream.getvalue(),
    "hidden_actual": hidden_actual,
    "candidate_stdout": captured_stdout.getvalue(),
    "candidate_stderr": captured_stderr.getvalue(),
}))
"""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        runner_path = root / "runner.py"
        runner_path.write_text(runner, encoding="utf-8")
        try:
            completed = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    str(runner_path),
                    str(source_path),
                    str(public_test_path),
                ],
                input=json.dumps(_SLUG_CASES),
                text=True,
                capture_output=True,
                cwd=root,
                env={"PYTHONIOENCODING": "utf-8"},
                timeout=2,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            return {
                "exit_status": "timeout",
                "stdout": error.stdout or "",
                "stderr": error.stderr or "",
                "public_tests_passed": False,
                "hidden_cases_passed": False,
            }
    result: dict[str, object] = {
        "exit_status": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "public_tests_passed": False,
        "hidden_cases_passed": False,
    }
    if (
        completed.returncode != 0
        or len(completed.stdout.encode("utf-8")) > 32_768
        or len(completed.stderr.encode("utf-8")) > 32_768
    ):
        return result
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return result
    if not isinstance(payload, dict):
        return result
    result.update(payload)
    result["hidden_cases_passed"] = payload.get("hidden_actual") == [
        expected for _, expected in _SLUG_CASES
    ]
    return result


__all__ = [
    "DataAnalysisSeedPack",
    "ScriptedProofModel",
    "SeedProofBundle",
    "SeedProofCase",
    "WorkspaceCodingSeedPack",
    "build_seed_proof_bundle",
    "build_seed_smoke_suite",
]
