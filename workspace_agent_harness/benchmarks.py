"""Content-pinned benchmark catalogs above the public Runtime seam.

Loading a catalog is deliberately non-executing: upstream prompts and grader
source are treated as untrusted data, and no case becomes runnable without a
separately frozen local translation.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, cast

from . import (
    BenchmarkCase,
    CaseEligibility,
    RunLimitOverrides,
    RunRequest,
    SuiteManifest,
    SuiteSelector,
    benchmark_cases_hash,
    benchmark_source_hash,
    benchmark_transform_hash,
    suite_content_hash,
)


@dataclass(frozen=True)
class PinchBenchCatalogRequest:
    """Non-runnable provenance for one untranslated upstream task."""

    upstream_task_id: str
    task_content_hash: str
    profile: str


@dataclass(frozen=True)
class VerticalCatalogRequest:
    """Non-runnable provenance for one configured but unimplemented case."""

    task_id: str
    pack_id: str
    fixture_id: str
    evaluator_id: str


class FrozenBenchmarkSuite:
    """Immutable suite Adapter consumed by :class:`EvaluationCampaign`."""

    def __init__(
        self,
        *,
        manifest: SuiteManifest,
        cases: tuple[BenchmarkCase, ...],
        source_material: Mapping[str, object],
    ) -> None:
        self.manifest = manifest
        self._cases = cases
        self._source_material = source_material

    def cases(self) -> tuple[BenchmarkCase, ...]:
        return self._cases

    def source_material(self) -> Mapping[str, object]:
        return self._source_material


def configured_pinchbench_lock(profile: str = "core") -> Mapping[str, object]:
    """Return the repository-shipped immutable PinchBench source lock."""

    if profile not in {"core", "full"}:
        raise ValueError("PinchBench profile must be 'core' or 'full'")
    path = _configured_pinchbench_lock_path(profile)
    return cast(
        Mapping[str, object],
        _freeze_json(_read_json_object(path, label="configured PinchBench lock")),
    )


def load_pinchbench_suite(
    *,
    checkout: Path,
    lock_path: Path | None = None,
    profile: str = "core",
) -> FrozenBenchmarkSuite:
    """Load one fail-closed, catalog-only PinchBench compatibility profile.

    The checkout must be a clean Git worktree at the exact locked commit and
    task-tree. This function parses task metadata as data and never imports or
    executes task-embedded grader code.
    """

    if profile not in {"core", "full"}:
        raise ValueError("PinchBench profile must be 'core' or 'full'")
    checkout = Path(checkout).resolve()
    selected_lock_path = (
        _configured_pinchbench_lock_path(profile)
        if lock_path is None
        else Path(lock_path)
    )
    lock = _read_json_object(selected_lock_path, label="PinchBench lock")
    if lock.get("schema") != "workspace-agent-harness/pinchbench-lock/v1":
        raise ValueError("unsupported PinchBench lock schema")
    if _require_string(lock, "profile") != profile:
        raise ValueError("PinchBench profile does not match the selected lock")
    source_lock = _require_mapping(lock, "source")
    catalog_lock = _require_mapping(lock, "catalog")
    admission = _require_mapping(lock, "admission")
    if admission.get("default_eligibility") != "ineligible":
        raise ValueError("PinchBench catalog must default every case to ineligible")
    if admission.get("execute_upstream_graders") is not False:
        raise ValueError("upstream PinchBench graders cannot execute in this Adapter")
    reason = admission.get("reason")
    if not isinstance(reason, str) or not reason:
        raise ValueError("PinchBench lock requires a stable ineligibility reason")

    tasks_root = checkout / "tasks"
    manifest_path = tasks_root / "manifest.yaml"
    if not checkout.is_dir() or not tasks_root.is_dir() or not manifest_path.is_file():
        raise ValueError("PinchBench checkout is missing tasks/manifest.yaml")
    if tasks_root.is_symlink() or manifest_path.is_symlink():
        raise ValueError("PinchBench task controls cannot be symbolic links")

    expected_commit = _require_string(source_lock, "commit")
    expected_tree = _require_string(source_lock, "tasks_tree")
    actual_commit = _git(checkout, "rev-parse", "HEAD")
    actual_tree = _git(checkout, "rev-parse", "HEAD:tasks")
    if actual_commit != expected_commit:
        raise ValueError("PinchBench checkout commit drift")
    if actual_tree != expected_tree:
        raise ValueError("PinchBench tasks tree drift")
    dirty = _git(
        checkout,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        "tasks",
    )
    if dirty:
        raise ValueError("PinchBench task worktree drift")

    manifest_bytes = manifest_path.read_bytes()
    actual_manifest_hash = _sha256(manifest_bytes)
    if actual_manifest_hash != _require_string(source_lock, "manifest_sha256"):
        raise ValueError("PinchBench manifest content drift")
    parsed_manifest = _parse_manifest(manifest_bytes.decode("utf-8"))
    full_ids = tuple(
        task_id
        for task_ids in parsed_manifest.categories.values()
        for task_id in task_ids
    )
    if len(full_ids) != len(set(full_ids)):
        raise ValueError("PinchBench manifest contains duplicate task IDs")
    task_file_ids = {path.stem for path in tasks_root.glob("task_*.md")}
    if task_file_ids != set(full_ids):
        raise ValueError("PinchBench task-file set does not match the manifest")
    _expect_count(catalog_lock, "full_task_count", len(full_ids))
    _expect_count(catalog_lock, "core_task_count", len(parsed_manifest.core))
    _expect_count(catalog_lock, "category_count", len(parsed_manifest.categories))
    if not set(parsed_manifest.core).issubset(full_ids):
        raise ValueError("PinchBench core profile contains an unknown task")
    if not set(parsed_manifest.run_first).issubset(full_ids):
        raise ValueError("PinchBench run_first contains an unknown task")

    task_records: dict[str, object] = {}
    category_discrepancies: list[dict[str, str]] = []
    for category, task_ids in parsed_manifest.categories.items():
        for task_id in task_ids:
            task_path = tasks_root / f"{task_id}.md"
            if task_path.is_symlink() or not task_path.is_file():
                raise ValueError(f"PinchBench task file is missing: {task_id}")
            raw = task_path.read_bytes()
            metadata = _parse_task_frontmatter(raw.decode("utf-8"), task_id)
            frontmatter_category = metadata.get("category")
            if not isinstance(frontmatter_category, str):
                raise ValueError(f"PinchBench task category mismatch: {task_id}")
            if frontmatter_category.casefold() != category.casefold():
                raise ValueError(f"PinchBench task category mismatch: {task_id}")
            if frontmatter_category != category:
                category_discrepancies.append(
                    {
                        "task_id": task_id,
                        "manifest_category": category,
                        "frontmatter_category": frontmatter_category,
                    }
                )
            task_records[task_id] = {
                "task_id": task_id,
                "category": category,
                "grading_type": metadata.get("grading_type"),
                "timeout_seconds": metadata.get("timeout_seconds"),
                "content_hash": _sha256(raw),
            }

    selected_ids = parsed_manifest.core if profile == "core" else full_ids
    selected_records = tuple(task_records[task_id] for task_id in selected_ids)
    source_material = {
        "schema": "workspace-agent-harness/pinchbench-source/v1",
        "label": "pinchbench-compatible",
        "profile": profile,
        "repository": _require_string(source_lock, "repository"),
        "tag": _require_string(source_lock, "tag"),
        "commit": expected_commit,
        "tasks_tree": expected_tree,
        "manifest_sha256": actual_manifest_hash,
        "run_first": parsed_manifest.run_first,
        "core": parsed_manifest.core,
        "categories": parsed_manifest.categories,
        "category_discrepancies": tuple(category_discrepancies),
        "tasks": selected_records,
    }
    cases = tuple(
        BenchmarkCase(
            case_id=f"pinchbench:{task_id}",
            source_case_id=f"pinchbench@{expected_commit}:{task_id}",
            request=PinchBenchCatalogRequest(
                upstream_task_id=task_id,
                task_content_hash=str(task_records[task_id]["content_hash"]),  # type: ignore[index]
                profile=profile,
            ),
            eligibility=CaseEligibility.INELIGIBLE,
            ineligibility_reason=reason,
        )
        for task_id in selected_ids
    )
    transform_descriptor = {
        "transform_id": "pinchbench-catalog-only",
        "version": "1",
        "executes_upstream_graders": False,
        "admission": "explicit-local-translation-required",
    }
    source_digest = benchmark_source_hash(source_material)
    cases_digest = benchmark_cases_hash(cases)
    transform_digest = benchmark_transform_hash(transform_descriptor)
    suite_id = _require_string(lock, "suite_id")
    version = _require_string(lock, "version")
    selector = SuiteSelector(
        suite_id=suite_id,
        version=version,
        content_hash=suite_content_hash(
            suite_id=suite_id,
            version=version,
            lane="pinchbench-compatible",
            source_revision=expected_commit,
            source_digest=source_digest,
            cases_hash=cases_digest,
            transform_hash=transform_digest,
            metric_schema_version=1,
            required_packs=(),
        ),
    )
    manifest = SuiteManifest(
        identity=selector,
        lane="pinchbench-compatible",
        source_revision=expected_commit,
        source_digest=source_digest,
        cases_hash=cases_digest,
        transform_descriptor=transform_descriptor,
        transform_hash=transform_digest,
        metric_schema_version=1,
        required_packs=(),
    )
    return FrozenBenchmarkSuite(
        manifest=manifest,
        cases=cases,
        source_material=source_material,
    )


def load_vertical_evidence_suite(
    bundle: object,
    *,
    config_path: Path | None = None,
) -> FrozenBenchmarkSuite:
    """Compose the fixed 15+15 vertical catalog with implemented seed cases."""

    from .proof_packs import (
        DataAnalysisSeedPack,
        SeedProofBundle,
        WorkspaceCodingSeedPack,
    )

    if not isinstance(bundle, SeedProofBundle):
        raise TypeError("vertical evidence suite requires a SeedProofBundle")
    selected_config_path = (
        Path(__file__).resolve().parent
        / "benchmark_configs"
        / "vertical-evidence-v1.json"
        if config_path is None
        else Path(config_path)
    )
    config = _read_json_object(
        selected_config_path,
        label="vertical evidence configuration",
    )
    if config.get("schema") != "workspace-agent-harness/vertical-catalog/v1":
        raise ValueError("unsupported vertical evidence configuration schema")
    tasks = config.get("tasks")
    if not isinstance(tasks, list) or any(not isinstance(item, dict) for item in tasks):
        raise ValueError("vertical evidence tasks must be JSON objects")
    task_values = tuple(tasks)
    task_ids = tuple(_require_string(task, "task_id") for task in task_values)
    if len(task_ids) != 30 or len(task_ids) != len(set(task_ids)):
        raise ValueError("vertical evidence catalog must contain 30 unique cases")
    pack_counts: dict[str, int] = {}
    for task in task_values:
        pack_id = _require_string(task, "pack_id")
        pack_counts[pack_id] = pack_counts.get(pack_id, 0) + 1
    if pack_counts != {"data-analysis": 15, "workspace-coding": 15}:
        raise ValueError("vertical evidence catalog must contain exactly 15 cases per pack")

    seed_cases = {str(case.task["task_id"]): case for case in bundle.cases}
    seed_pack_values = cast(
        tuple[DataAnalysisSeedPack, WorkspaceCodingSeedPack],
        bundle.packs,
    )
    seed_packs: dict[
        object,
        DataAnalysisSeedPack | WorkspaceCodingSeedPack,
    ] = {
        seed_pack_values[0].manifest.identity: seed_pack_values[0],
        seed_pack_values[1].manifest.identity: seed_pack_values[1],
    }
    implemented_ids = {
        _require_string(task, "task_id")
        for task in task_values
        if task.get("implementation_state") == "implemented-seed"
    }
    if implemented_ids != set(seed_cases):
        raise ValueError("vertical implemented-case set does not match the seed bundle")

    cases: list[BenchmarkCase] = []
    required_packs = []
    resolved_eligible_controls: list[dict[str, object]] = []
    for task in task_values:
        task_id = _require_string(task, "task_id")
        pack_id = _require_string(task, "pack_id")
        fixture_id = _require_string(task, "fixture_id")
        evaluator_id = _require_string(task, "evaluator_id")
        state = _require_string(task, "implementation_state")
        seed = seed_cases.get(task_id)
        if state == "implemented-seed":
            if seed is None or seed.pack.pack_id != pack_id:
                raise ValueError(f"vertical seed Pack mismatch: {task_id}")
            pack = seed_packs.get(seed.pack)
            if pack is None:
                raise ValueError(f"vertical seed Pack is missing: {task_id}")
            spec = pack.compile_task(seed.task)
            if (
                spec.task_id != task_id
                or spec.control.fixture.fixture_id != fixture_id
                or spec.control.evaluator.evaluator_id != evaluator_id
                or spec.control.evaluator != pack.manifest.evaluator
            ):
                raise ValueError(
                    f"vertical eligible control provenance mismatch: {task_id}"
                )
            resolved_eligible_controls.append(
                {
                    "task_id": task_id,
                    "fixture": spec.control.fixture,
                    "evaluator": spec.control.evaluator,
                }
            )
            request: object = RunRequest(
                pack=seed.pack,
                task=seed.task,
                authority=bundle.authority,
                limits=RunLimitOverrides(),
                metadata={"benchmark": "vertical-evidence-v1"},
            )
            eligibility = CaseEligibility.ELIGIBLE
            reason = None
            if seed.pack not in required_packs:
                required_packs.append(seed.pack)
        elif state == "configured-not-implemented":
            request = VerticalCatalogRequest(
                task_id=task_id,
                pack_id=pack_id,
                fixture_id=fixture_id,
                evaluator_id=evaluator_id,
            )
            eligibility = CaseEligibility.INELIGIBLE
            reason = "vertical.case_not_implemented"
        else:
            raise ValueError(f"unsupported vertical implementation state: {state}")
        cases.append(
            BenchmarkCase(
                case_id=task_id,
                source_case_id=f"local:vertical-evidence-v1:{task_id}",
                request=request,
                eligibility=eligibility,
                ineligibility_reason=reason,
            )
        )

    frozen_cases = tuple(cases)
    frozen_config = cast(Mapping[str, object], _freeze_json(config))
    source_material = MappingProxyType(
        {
            **frozen_config,
            "resolved_eligible_controls": tuple(resolved_eligible_controls),
        }
    )
    transform_descriptor = {
        "transform_id": "vertical-catalog-to-run-request",
        "version": "1",
        "implemented_cases": tuple(sorted(implemented_ids)),
        "unimplemented_admission": "vertical.case_not_implemented",
    }
    source_digest = benchmark_source_hash(source_material)
    cases_digest = benchmark_cases_hash(frozen_cases)
    transform_digest = benchmark_transform_hash(transform_descriptor)
    suite_id = _require_string(config, "suite_id")
    version = _require_string(config, "version")
    lane = _require_string(config, "lane")
    source_revision = _require_string(config, "source_revision")
    metric_schema_version = config.get("metric_schema_version")
    if not isinstance(metric_schema_version, int) or isinstance(metric_schema_version, bool):
        raise ValueError("vertical metric_schema_version must be an integer")
    frozen_required_packs = tuple(required_packs)
    selector = SuiteSelector(
        suite_id=suite_id,
        version=version,
        content_hash=suite_content_hash(
            suite_id=suite_id,
            version=version,
            lane=lane,
            source_revision=source_revision,
            source_digest=source_digest,
            cases_hash=cases_digest,
            transform_hash=transform_digest,
            metric_schema_version=metric_schema_version,
            required_packs=frozen_required_packs,
        ),
    )
    manifest = SuiteManifest(
        identity=selector,
        lane=lane,
        source_revision=source_revision,
        source_digest=source_digest,
        cases_hash=cases_digest,
        transform_descriptor=transform_descriptor,
        transform_hash=transform_digest,
        metric_schema_version=metric_schema_version,
        required_packs=frozen_required_packs,
    )
    return FrozenBenchmarkSuite(
        manifest=manifest,
        cases=frozen_cases,
        source_material=source_material,
    )


@dataclass(frozen=True)
class _ParsedManifest:
    run_first: tuple[str, ...]
    core: tuple[str, ...]
    categories: Mapping[str, tuple[str, ...]]


def _parse_manifest(text: str) -> _ParsedManifest:
    section: str | None = None
    category: str | None = None
    run_first: list[str] = []
    core: list[str] = []
    categories: dict[str, list[str]] = {}
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        if not line:
            continue
        if not line.startswith(" ") and line.endswith(":"):
            section = line[:-1]
            category = None
            if section not in {"run_first", "core", "categories"}:
                raise ValueError(f"unsupported PinchBench manifest section: {section}")
            continue
        if section == "categories" and line.startswith("  ") and not line.startswith("    ") and line.endswith(":"):
            category = line.strip()[:-1]
            if not category or category in categories:
                raise ValueError("invalid PinchBench category")
            categories[category] = []
            continue
        stripped = line.strip()
        if not stripped.startswith("- "):
            raise ValueError("unsupported PinchBench manifest syntax")
        task_id = stripped[2:].strip()
        if not task_id.startswith("task_"):
            raise ValueError("invalid PinchBench task ID")
        if section == "run_first":
            run_first.append(task_id)
        elif section == "core":
            core.append(task_id)
        elif section == "categories" and category is not None:
            categories[category].append(task_id)
        else:
            raise ValueError("PinchBench task appears outside a manifest list")
    if not categories:
        raise ValueError("PinchBench manifest has no categories")
    return _ParsedManifest(
        tuple(run_first),
        tuple(core),
        MappingProxyType({key: tuple(value) for key, value in categories.items()}),
    )


def _parse_task_frontmatter(text: str, expected_id: str) -> dict[str, object]:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError(f"PinchBench task lacks frontmatter: {expected_id}")
    try:
        end = lines.index("---", 1)
    except ValueError as error:
        raise ValueError(f"PinchBench task has unterminated frontmatter: {expected_id}") from error
    values: dict[str, object] = {}
    for line in lines[1:end]:
        if not line or line.startswith(" ") or ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        value = raw_value.strip().strip('"\'')
        if key == "timeout_seconds":
            try:
                values[key] = int(value)
            except ValueError as error:
                raise ValueError(
                    f"PinchBench timeout must be a positive integer: {expected_id}"
                ) from error
        else:
            values[key] = value
    if values.get("id") != expected_id:
        raise ValueError(f"PinchBench task ID mismatch: {expected_id}")
    if values.get("grading_type") not in {"automated", "hybrid", "llm_judge"}:
        raise ValueError(f"invalid grading type for PinchBench task: {expected_id}")
    timeout_seconds = values.get("timeout_seconds")
    if (
        not isinstance(timeout_seconds, int)
        or isinstance(timeout_seconds, bool)
        or timeout_seconds <= 0
    ):
        raise ValueError(
            f"PinchBench timeout must be a positive integer: {expected_id}"
        )
    return values


def _read_json_object(path: Path, *, label: str) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read {label}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def _require_mapping(parent: Mapping[str, object], key: str) -> Mapping[str, object]:
    value = parent.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"PinchBench lock field {key!r} must be an object")
    return value


def _require_string(parent: Mapping[str, object], key: str) -> str:
    value = parent.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"PinchBench lock field {key!r} must be a non-empty string")
    return value


def _expect_count(parent: Mapping[str, object], key: str, actual: int) -> None:
    expected = parent.get(key)
    if not isinstance(expected, int) or isinstance(expected, bool) or expected < 0:
        raise ValueError(f"PinchBench lock field {key!r} must be a non-negative integer")
    if actual != expected:
        raise ValueError(f"PinchBench catalog count drift: {key}")


def _git(checkout: Path, *arguments: str) -> str:
    try:
        completed = subprocess.run(
            ("git", *arguments),
            cwd=checkout,
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ValueError("cannot verify PinchBench Git checkout") from error
    return completed.stdout.strip()


def _sha256(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


def _freeze_json(value: object) -> object:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze_json(item) for item in value)
    return value


def _configured_pinchbench_lock_path(profile: str) -> Path:
    return (
        Path(__file__).resolve().parent
        / "benchmark_configs"
        / f"pinchbench-{profile}-v2.0.0.json"
    )
