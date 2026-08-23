#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: bash scripts/swebench_gold_gate.sh INSTANCE_ID" >&2
  exit 2
fi

instance_id=$1
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
config_path="$project_root/workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json"
scratch_root="$project_root/.scratch"
runner_root="$scratch_root/upstreams/SWE-bench"
venv_root="$scratch_root/venvs/swebench"
dataset_root="$scratch_root/datasets/swe-bench-lite-b0dde1093fe417d83b7184254edf8199c1f0dff5"
dataset_path="$dataset_root/data/dev-00000-of-00001.parquet"
report_root="$scratch_root/react-mvp-gold-5"
runner_repository=https://github.com/SWE-bench/SWE-bench.git
runner_commit=7a21e05772954cc81471ae19d56f436cecf43c54
dataset_repository=SWE-bench/SWE-bench_Lite
dataset_revision=b0dde1093fe417d83b7184254edf8199c1f0dff5
dataset_sha256=b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f

command -v docker >/dev/null
command -v git >/dev/null
command -v jq >/dev/null
command -v python3 >/dev/null
docker info >/dev/null

if [[ ! -d "$runner_root/.git" ]]; then
  mkdir -p "$(dirname -- "$runner_root")"
  git clone "$runner_repository" "$runner_root"
fi

if [[ -n "$(git -C "$runner_root" status --short)" ]]; then
  echo "refusing to change dirty SWE-bench scratch checkout: $runner_root" >&2
  exit 1
fi

if [[ "$(git -C "$runner_root" rev-parse HEAD)" != "$runner_commit" ]]; then
  git -C "$runner_root" fetch origin "$runner_commit"
  git -C "$runner_root" checkout --detach "$runner_commit"
fi

if [[ ! -x "$venv_root/bin/python" ]]; then
  python3 -m venv "$venv_root"
fi
"$venv_root/bin/python" -m pip install --disable-pip-version-check -q -e "$runner_root"
PYTHONPATH="$project_root" "$venv_root/bin/python" -c \
  'from pathlib import Path; from workspace_agent_harness.react_mvp import load_react_mvp_config; load_react_mvp_config(Path(__import__("sys").argv[1]))' \
  "$config_path"

image=$(jq -er --arg id "$instance_id" '.selection.images_by_instance_id[$id]' "$config_path")
image_digest=$(jq -er --arg id "$instance_id" '.selection.image_digests_by_instance_id[$id]' "$config_path")
if [[ -z "$image" || "$image" == "null" ]]; then
  echo "instance is not in react-mvp-5: $instance_id" >&2
  exit 2
fi

mkdir -p "$dataset_root"
"$venv_root/bin/hf" download "$dataset_repository" data/dev-00000-of-00001.parquet \
  --repo-type dataset \
  --revision "$dataset_revision" \
  --local-dir "$dataset_root" >/dev/null

actual_dataset_sha256=$(shasum -a 256 "$dataset_path" | awk '{print $1}')
if [[ "$actual_dataset_sha256" != "$dataset_sha256" ]]; then
  echo "pinned SWE-bench Lite parquet hash mismatch" >&2
  exit 1
fi

docker pull --platform linux/amd64 "$image"
expected_repo_digest="${image%:latest}@$image_digest"
if ! docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}' | grep -Fx "$expected_repo_digest" >/dev/null; then
  echo "pinned SWE-bench image registry digest mismatch" >&2
  exit 1
fi

safe_instance=${instance_id#*__}
run_id="react-mvp-gold-$safe_instance"
mkdir -p "$report_root"
(
  cd "$project_root"
  "$venv_root/bin/swebench" eval "$dataset_path" \
    --gold \
    -i "$instance_id" \
    --run-id "$run_id" \
    -j 1 \
    -t 900 \
    --report-dir "$report_root"
)

report_path="$report_root/gold.$run_id.json"
jq -e \
  --arg id "$instance_id" \
  '.total_instances == 1 and
   .submitted_instances == 1 and
   .completed_instances == 1 and
   .resolved_instances == 1 and
   .unresolved_instances == 0 and
   .infra_failure_instances == 0 and
   .ambiguous_failure_instances == 0 and
   .error_instances == 0 and
   .unstopped_instances == 0 and
   .resolved_ids == [$id]' \
  "$report_path" >/dev/null

echo "gold gate passed: $instance_id"
echo "report: $report_path"
shasum -a 256 "$report_path"
