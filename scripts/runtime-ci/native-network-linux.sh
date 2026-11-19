#!/usr/bin/env bash
# Host kernel and ordinary runner UID, with a disposable, compatible /usr in a private mount namespace.
set -euo pipefail
installed=$(realpath "$1")
output=$(realpath "$2")
node_binary=$(realpath "$(command -v node)")
fixture=$(realpath "$(dirname "$0")/native-network.mjs")
uid=$(id -u)
gid=$(id -g)
test "$uid" -ne 0
sdk=$(mktemp -d "$RUNNER_TEMP/pan-native-sdk.XXXXXXXX")
container=
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null; fi
  rm -rf "$sdk"
}
trap cleanup EXIT
# Docker only provisions distribution packages; neither Pan nor its test workload runs under Docker here.
container=$(docker create -e DEBIAN_FRONTEND=noninteractive ubuntu:24.04 bash -euc '
  apt-get update -qq
  apt-get install -yqq --no-install-recommends bubblewrap fuse3 libfuse2t64 libseccomp2 libatomic1 python3 curl ca-certificates
')
docker start -a "$container"
docker export --output "$sdk/packages.tar" "$container"
mkdir "$sdk/system"
# The mount table is private before any mount changes. Restore the runner UID before invoking candidate code.
sudo unshare --mount --propagation private /bin/bash -euc '
  sdk=$1; uid=$2; gid=$3; node_binary=$4; fixture=$5; installed=$6; output=$7
  mount -t tmpfs -o nosuid,nodev,size=2G tmpfs "$sdk/system"
  tar -xf "$sdk/packages.tar" -C "$sdk/system" usr
  mount --bind "$sdk/system/usr" /usr
  mount -o remount,bind,ro,nosuid,nodev /usr
  /usr/bin/bwrap --version
  ls -l /dev/fuse
  exec setpriv --reuid "$uid" --regid "$gid" --clear-groups env -i PATH=/usr/bin:/bin HOME="$output" \
    "$node_binary" "$fixture" "$installed" "$output/network"
' bash "$sdk" "$uid" "$gid" "$node_binary" "$fixture" "$installed" "$output"
