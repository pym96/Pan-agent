#!/bin/bash
# Dependencies only. No task instructions, tests, solution or output enter this image.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sed -i 's|http://ports.ubuntu.com|https://ports.ubuntu.com|g' /etc/apt/sources.list.d/ubuntu.sources
apt-get -o Acquire::Retries=0 -o Acquire::https::Timeout=30 update
apt-get -o Acquire::Retries=0 -o Acquire::https::Timeout=30 install -y ca-certificates curl
curl --fail --show-error --location --max-time 60 https://astral.sh/uv/0.9.7/install.sh -o /tmp/wo74-uv-install.sh
sha256sum /tmp/wo74-uv-install.sh
sh /tmp/wo74-uv-install.sh
source /root/.local/bin/env
uv --version
uvx --with pytest==8.4.1 --with pytest-json-ctrf==0.3.5 pytest --version
# Preserve package caches, but remove preparation-only files; no tests ran.
dpkg-query -W -f='${Package}\t${Version}\n'
find /root/.cache/uv -type d -name '*.dist-info' | sort
rm /tmp/wo74-uv-install.sh /tmp/wo74-prepare.sh
for path in /app/hello.txt /tests /solution /logs /app/.pytest_cache; do test ! -e "$path"; done
test -z "$(ls -A /app)"
