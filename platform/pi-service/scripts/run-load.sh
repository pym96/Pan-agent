#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${NODE_ROOT:?}" "${EVIDENCE_ROOT:?}"
level=${1:-100}
repeat=${2:-1}
shards=${3:-1}
case "$level" in 100|1000|10000) ;; *) exit 2;; esac
[ "$repeat" -ge 1 ] && [ "$repeat" -le 3 ]
free_kb=$(df -Pk "$EVIDENCE_ROOT" | awk 'NR==2 {print $4}')
[ "$free_kb" -ge 20971520 ] || { echo 'disk floor reached'; exit 3; }
name="load-cache${SSE_TAIL_CACHE:-1}-${level}-${repeat}-shards${shards}-$(date -u +%Y%m%dT%H%M%S)"
printf '%s\n' "${SOURCE_SHA:-unrecorded}" > "$EVIDENCE_ROOT/$name-source-sha.txt"
sha256sum bin/service bin/load pi/server.mjs pi/model.mjs pi/package-lock.json compose.yaml > "$EVIDENCE_ROOT/$name-identities.txt"
curl --noproxy '*' -fsS http://127.0.0.1:18142/metrics > "$EVIDENCE_ROOT/$name-before.json"
docker compose run --rm --name "pan-pi-142-$name" load -connections "$level" -session-shards "$shards" -hold 120s -session "$name" -out "/evidence/$name.json" > "$EVIDENCE_ROOT/$name.log" 2>&1 &
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
curl --noproxy '*' -fsS http://127.0.0.1:18142/metrics > "$EVIDENCE_ROOT/$name-after.json"
docker inspect pan-pi-142-api-1 pan-pi-142-pi-1 pan-pi-142-pg-1 > "$EVIDENCE_ROOT/$name-container-inspect.json"

docker exec pan-pi-142-pg-1 psql -U pan -d pan -At -c "SELECT coalesce(json_agg(row_to_json(x)),'[]') FROM (SELECT t.id,t.key,t.session,t.status,extract(epoch from (t.started_at-t.created_at))*1000 AS queue_ms,extract(epoch from (t.finished_at-t.created_at))*1000 AS total_ms,extract(epoch from ((SELECT min(e.created_at) FROM events e WHERE e.task=t.id AND e.kind='text')-t.created_at))*1000 AS first_text_ms FROM tasks t WHERE t.session LIKE '$name%' ORDER BY t.created_at) x;" > "$EVIDENCE_ROOT/$name-task-times.json"
docker exec pan-pi-142-pg-1 psql -U pan -d pan -At -c "SELECT coalesce(json_agg(row_to_json(x)),'[]') FROM (SELECT session,id,task,kind FROM events WHERE session LIKE '$name%' ORDER BY id) x;" > "$EVIDENCE_ROOT/$name-committed-events.json"
