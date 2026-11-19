#!/usr/bin/env bash
# Host kernel and ordinary runner UID, with a disposable, compatible /usr in a private mount namespace.
set -euo pipefail
installed=$(realpath "$1")
output=$(realpath "$2")
node_binary=$(realpath "$(command -v node)")
fixture_dir=$(realpath "$(dirname "$0")")
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
echo "provision: obtain Ubuntu 24.04 userspace"
timeout 55s docker pull ubuntu:24.04
container=$(docker create --network host -e DEBIAN_FRONTEND=noninteractive \
  -v /etc/ssl/certs/ca-certificates.crt:/host-ca.crt:ro ubuntu:24.04 bash -euc '
  sed -i -e "s|http://archive.ubuntu.com|https://archive.ubuntu.com|g" \
    -e "s|http://security.ubuntu.com|https://security.ubuntu.com|g" /etc/apt/sources.list.d/ubuntu.sources
  opts=(-o Acquire::https::CaInfo=/host-ca.crt -o Acquire::https::Timeout=12 -o Acquire::Retries=1 -o Acquire::Languages=none)
  echo "provision: fetch signed distribution indexes over HTTPS"
  timeout 65s apt-get "${opts[@]}" -o APT::Update::Error-Mode=any update
  echo "provision: install native prerequisites"
  timeout 65s apt-get "${opts[@]}" install -y --no-install-recommends bubblewrap fuse3 libfuse2t64 libseccomp2 libatomic1 python3 curl ca-certificates
')
docker start -a "$container"
test "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = 0
echo "provision: export compatible userspace"
docker export --output "$sdk/packages.tar" "$container"
mkdir "$sdk/system"
# The mount table is private before any mount changes. Restore the runner UID before invoking candidate code.
sudo unshare --mount --propagation private /bin/bash -euc '
  sdk=$1; uid=$2; gid=$3; node_binary=$4; fixture_dir=$5; installed=$6; output=$7
  mount -t tmpfs -o nosuid,nodev,size=2G tmpfs "$sdk/system"
  tar -xf "$sdk/packages.tar" -C "$sdk/system" usr
  mount --bind "$sdk/system/usr" /usr
  mount -o remount,bind,ro,nosuid,nodev /usr
  /usr/bin/bwrap --version
  ls -l /dev/fuse
  run_fixture() {
    setpriv --reuid "$uid" --regid "$gid" --clear-groups env -i PATH=/usr/bin:/bin HOME="$output" \
    "$node_binary" "$fixture_dir/$1.mjs" "$installed" "$output/$2"
  }
  echo "fixture: workspace credentials"
  run_fixture workspace-trust trust
  echo "fixture: bounded networking"
  run_fixture native-network network
' bash "$sdk" "$uid" "$gid" "$node_binary" "$fixture_dir" "$installed" "$output"
