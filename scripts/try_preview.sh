#!/bin/sh
# #51 documented offline first-task try: given an ALREADY BUILT local package
# artifact, install it into a fresh consumer without dev dependencies and start
# the actual installed Pan TUI with the scripted offline first task.
# This script performs no build and downloads nothing: the install runs against
# an intentionally empty npm cache with --offline. Building the artifact is a
# separate one-time developer step (see README: npm ci + npm pack).
set -eu
ARTIFACT=${1:?"usage: try_preview.sh /absolute/path/to/pan-agent-0.1.0.tgz"}
ARTIFACT=$(realpath "$ARTIFACT")
[ -f "$ARTIFACT" ] || { echo "artifact not found: $ARTIFACT" >&2; exit 2; }
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
DEST=$(mktemp -d "${TMPDIR:-/tmp}/pan-preview-try.XXXXXX")
DEST=$(realpath "$DEST")
echo "==> 1/3 Install the prebuilt artifact into a fresh consumer: $DEST/consumer"
echo "    (offline, empty npm cache, no dev dependencies, no install scripts)"
mkdir "$DEST/consumer" "$DEST/empty-npm-cache"
( set -x; cd "$DEST/consumer" && NPM_CONFIG_CACHE="$DEST/empty-npm-cache" npm install "$ARTIFACT" --omit=dev --offline --ignore-scripts --no-audit --no-fund )
echo "==> 2/3 Confirm the installed executable answers"
( set -x; "$DEST/consumer/node_modules/.bin/pan-agent" --help >/dev/null && echo "pan-agent --help OK" )
echo "==> 3/3 Start the installed offline first-task preview (records under $DEST/records)"
mkdir "$DEST/records"
set -x
exec node "$ROOT/scripts/demo_preview.mjs" "$DEST/consumer/node_modules/pan-agent" "$DEST/records" "$ROOT"
