#!/usr/bin/env bash
# A disposable CI container supplies system dependencies. The installed workload runs as the runner UID.
set -euo pipefail
installed=$(realpath "$1")
output=$(realpath "$2")
node_binary=$(realpath "$(command -v node)")
fixture=$(realpath "$(dirname "$0")/native-network.mjs")
docker run --rm --device /dev/fuse --cap-add SYS_ADMIN --security-opt apparmor=unconfined \
  --mount "type=bind,src=$installed,dst=/package,readonly" \
  --mount "type=bind,src=$node_binary,dst=/runtime/node,readonly" \
  --mount "type=bind,src=$fixture,dst=/fixture.mjs,readonly" \
  --mount "type=bind,src=$output,dst=/evidence" \
  -e DEBIAN_FRONTEND=noninteractive ubuntu:24.04 bash -euc '
    apt-get update -qq
    apt-get install -yqq --no-install-recommends bubblewrap fuse3 libfuse2t64 libseccomp2 python3 curl ca-certificates
    bwrap --version
    ls -l /dev/fuse
    uid=$(stat -c %u /evidence)
    gid=$(stat -c %g /evidence)
    test "$uid" -ne 0
    exec setpriv --reuid "$uid" --regid "$gid" --clear-groups /runtime/node /fixture.mjs /package /evidence/network
  '
