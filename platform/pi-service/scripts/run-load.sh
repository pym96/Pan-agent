#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${NODE_ROOT:?}" "${EVIDENCE_ROOT:?}"
level=${1:-100}
repeat=${2:-1}
case "$level" in 100|1000|10000) ;; *) exit 2;; esac
[ "$repeat" -ge 1 ] && [ "$repeat" -le 3 ]
free_kb=$(df -Pk "$EVIDENCE_ROOT" | awk 'NR==2 {print $4}')
[ "$free_kb" -ge 20971520 ] || { echo 'disk floor reached'; exit 3; }
name="load-${level}-${repeat}-$(date -u +%Y%m%dT%H%M%S)"
curl -fsS http://127.0.0.1:18142/metrics > "$EVIDENCE_ROOT/$name-before.json"
docker compose run --rm --name "pan-pi-142-$name" load -connections "$level" -hold 120s -session "$name" -out "/evidence/$name.json" > "$EVIDENCE_ROOT/$name.log" 2>&1 &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true; docker stop "pan-pi-142-$name" >/dev/null 2>&1 || true' INT TERM
while kill -0 "$load_pid" 2>/dev/null; do
 date -u +%FT%TZ >> "$EVIDENCE_ROOT/$name-resources.jsonl"
 docker stats --no-stream --format '{{json .}}' pan-pi-142-api-1 pan-pi-142-pi-1 pan-pi-142-pg-1 "pan-pi-142-$name" >> "$EVIDENCE_ROOT/$name-resources.jsonl" 2>/dev/null || true
 docker exec pan-pi-142-api-1 sh -c 'echo fds=$(ls /proc/1/fd | wc -l); grep -E "VmRSS|Threads" /proc/1/status' >> "$EVIDENCE_ROOT/$name-process.txt"
 free_kb=$(df -Pk "$EVIDENCE_ROOT" | awk 'NR==2 {print $4}')
 if [ "$free_kb" -lt 20971520 ]; then docker stop "pan-pi-142-$name"; break; fi
 sleep 5
done
wait "$load_pid"
curl -fsS http://127.0.0.1:18142/metrics > "$EVIDENCE_ROOT/$name-after.json"
docker inspect pan-pi-142-api-1 pan-pi-142-pi-1 pan-pi-142-pg-1 > "$EVIDENCE_ROOT/$name-container-inspect.json"
